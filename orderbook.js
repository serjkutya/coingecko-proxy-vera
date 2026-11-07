'use strict';

// Public Binance USD-M book measurements. No account/trade endpoints or API keys.
const BANDS_BPS = [5, 10, 25];
const MAX_AGE_MS = 3000;
const ENDPOINT = 'https://fapi.binance.com/fapi/v1/depth';

function positive(x) {
  if (typeof x !== 'number' && typeof x !== 'string') return null;
  if (typeof x === 'string' && !x.trim()) return null;
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function measureBook(book, receivedMs) {
  const out = { version: 'VERA_OB_V1', mode: 'SHADOW_ONLY', status: 'INVALID',
    receivedMs, eventMs: null, transactionMs: null, bookAgeMs: null,
    lastUpdateId: null, mid: null, spreadBps: null,
    bidCoverageBps: null, askCoverageBps: null, bands: [], reason: '' };
  const reject = reason => ({ ...out, reason });
  if (!Number.isFinite(receivedMs)) return reject('INVALID_RECEIVE_TIME');
  if (!book || !positive(book.E) || !positive(book.T) || !positive(book.lastUpdateId))
    return reject('MISSING_EXCHANGE_METADATA');
  out.eventMs = Number(book.E); out.transactionMs = Number(book.T);
  out.lastUpdateId = String(book.lastUpdateId);
  out.bookAgeMs = receivedMs - out.transactionMs;
  if (out.eventMs < out.transactionMs || out.eventMs > receivedMs + 500 || out.bookAgeMs < -500)
    return reject('CLOCK_SKEW');
  if (out.bookAgeMs > MAX_AGE_MS || receivedMs - out.eventMs > MAX_AGE_MS)
    return { ...out, status: 'STALE', reason: 'BOOK_OLDER_THAN_3S' };
  function levels(input, descending) {
    if (!Array.isArray(input) || !input.length || input.length > 1000) return null;
    const result = [];
    for (const row of input) {
      if (!Array.isArray(row) || row.length !== 2) return null;
      const p = positive(row[0]), q = positive(row[1]);
      if (p === null || q === null || !Number.isFinite(p * q)) return null;
      if (result.length && (descending ? p >= result.at(-1)[0] : p <= result.at(-1)[0])) return null;
      result.push([p, q]);
    }
    return result;
  }
  const bids = levels(book.bids, true), asks = levels(book.asks, false);
  if (!bids || !asks) return reject('INVALID_OR_UNSORTED_LEVELS');
  if (bids[0][0] >= asks[0][0]) return reject('CROSSED_OR_LOCKED_BOOK');
  out.mid = (bids[0][0] + asks[0][0]) / 2;
  out.spreadBps = (asks[0][0] - bids[0][0]) / out.mid * 10000;
  out.bidCoverageBps = (out.mid - bids.at(-1)[0]) / out.mid * 10000;
  out.askCoverageBps = (asks.at(-1)[0] - out.mid) / out.mid * 10000;
  out.bands = BANDS_BPS.map(bps => {
    const lo = out.mid * (1 - bps / 10000), hi = out.mid * (1 + bps / 10000);
    // Need an observed level strictly outside each boundary; an equal final
    // level is not proof that all levels in the requested band were returned.
    const bidComplete = bids.at(-1)[0] < lo, askComplete = asks.at(-1)[0] > hi;
    const bid = bidComplete ? bids.filter(x => x[0] >= lo).reduce((n, x) => n + x[0] * x[1], 0) : null;
    const ask = askComplete ? asks.filter(x => x[0] <= hi).reduce((n, x) => n + x[0] * x[1], 0) : null;
    const complete = bidComplete && askComplete;
    return { bps, bidComplete, askComplete, bidUSDT: bid, askUSDT: ask,
      imbalance: complete && bid + ask > 0 ? (bid - ask) / (bid + ask) : null };
  });
  out.status = out.bands.every(b => b.bidComplete && b.askComplete) ? 'OK' : 'PARTIAL';
  out.reason = out.status === 'OK' ? '' : 'INCOMPLETE_BANDS_ARE_NULL';
  return out;
}

function createBookService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  let inFlight = 0, used = 0, windowAt = now(), blockedUntil = 0, blockedCode = null;
  function fault(code, status) {
    const e = new Error(code); e.status = status;
    if (blockedUntil > now()) {
      e.retryAfterSeconds = Math.ceil((blockedUntil - now()) / 1000);
      e.blockedUntilMs = blockedUntil; e.upstreamStatus = blockedCode;
    }
    return e;
  }
  return async function getBook(symbol) {
    if (typeof symbol !== 'string' || !/^[A-Z0-9]{1,20}USDT$/.test(symbol)) throw fault('INVALID_SYMBOL', 400);
    const t = now();
    if (t < blockedUntil) throw fault('UPSTREAM_BACKOFF', 503);
    const old = cache.get(symbol);
    if (old && t - old.fetchedMs < 1500) {
      return { symbol, ...measureBook(old.book, t), fetchLatencyMs: old.latencyMs, cached: true };
    }
    if (t - windowAt >= 60000) { windowAt = t; used = 0; }
    // 500 levels cost 10 weight. Reserve capacity for the user's other clients.
    if (inFlight >= 2 || used >= 60) throw fault('LOCAL_BUDGET_OR_BUSY', 503);
    inFlight++; used++;
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 4000);
    try {
      const response = await fetchImpl(`${ENDPOINT}?symbol=${encodeURIComponent(symbol)}&limit=500`,
        { signal: abort.signal, redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok) {
        const rawRetry = response.headers?.get('retry-after');
        const retry = typeof rawRetry === 'string' && /^\d+$/.test(rawRetry.trim()) ? Number(rawRetry) : NaN;
        if ([403, 418, 429, 451].includes(response.status)) {
          // Never shorten the provider's deadline. Missing ban metadata requires
          // a conservative pause, not a new request after only one minute.
          const fallback = response.status === 418 ? 3 * 86400000 : 60000;
          const delay = Number.isSafeInteger(retry) && retry > 0 && Number.isSafeInteger(now() + retry * 1000)
            ? Math.max(60000, retry * 1000) : fallback;
          blockedUntil = Math.max(blockedUntil, now() + delay);
          blockedCode = response.status;
        }
        throw fault(`UPSTREAM_HTTP_${response.status}`, 502);
      }
      const book = await response.json(), end = now();
      const measured = measureBook(book, end);
      if (['OK', 'PARTIAL'].includes(measured.status)) {
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(symbol, { book, fetchedMs: end, latencyMs: end - t });
      }
      return { symbol, ...measured, fetchLatencyMs: end - t, cached: false };
    } catch (error) {
      if (error.status) throw error;
      throw fault(error.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', 502);
    } finally { clearTimeout(timer); inFlight--; }
  };
}

function createOrderBookHandler(options) {
  const getBook = createBookService(options);
  return async function orderBookHandler(req, res) {
    res.set('Cache-Control', 'no-store');
    try { res.json(await getBook(req.query.symbol)); }
    catch (e) {
      if (e.retryAfterSeconds) res.set('Retry-After', String(e.retryAfterSeconds));
      res.status(e.status || 500).json({ mode: 'SHADOW_ONLY', status: 'UNAVAILABLE', reason: e.message,
        ...(e.retryAfterSeconds ? {retryAfterSeconds:e.retryAfterSeconds,
          blockedUntilMs:e.blockedUntilMs, upstreamStatus:e.upstreamStatus} : {}) });
    }
  };
}

module.exports = { measureBook, createBookService, createOrderBookHandler };
