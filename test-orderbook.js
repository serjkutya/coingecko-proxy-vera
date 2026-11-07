'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { measureBook, createBookService } = require('./orderbook');
const T = 1794078318809;
function fixture() { return { E: T + 10, T, lastUpdateId: 123,
  bids: [['99.99','10'],['99.9','20'],['99.5','1']],
  asks: [['100.01','5'],['100.1','15'],['100.5','1']] }; }
const reply = (b, status = 200) => ({ ok: status === 200, status, headers: { get: () => null }, json: async () => b });

test('quote notionals and imbalance use symmetric price bands', () => {
  const m = measureBook(fixture(), T + 100);
  assert.equal(m.status, 'OK'); assert.equal(m.mid, 100);
  assert.ok(Math.abs(m.spreadBps - 2) < 1e-8);
  assert.ok(Math.abs(m.bands[0].bidUSDT - 999.9) < 1e-8);
  assert.ok(Math.abs(m.bands[0].askUSDT - 500.05) < 1e-8);
  assert.ok(Math.abs(m.bands[0].imbalance - (999.9 - 500.05) / 1499.95) < 1e-10);
});
test('truncated side gives null, never artificial zero or imbalance', () => {
  const b = fixture(); b.asks = b.asks.slice(0,1);
  const m = measureBook(b, T + 100);
  assert.equal(m.status, 'PARTIAL'); assert.equal(m.bands[0].askUSDT, null);
  assert.equal(m.bands[0].imbalance, null); assert.equal(m.bands[0].bidUSDT, 999.9);
});
test('exact boundary is conservatively incomplete', () => {
  const b = fixture(); b.bids = [['99.99','10'], ['99.75','1']];
  assert.equal(measureBook(b,T+100).bands[2].bidUSDT,null);
});
test('stale or future data never supply fresh metrics', () => {
  assert.equal(measureBook(fixture(), T+3001).status,'STALE');
  assert.equal(measureBook(fixture(), T-1000).reason,'CLOCK_SKEW');
  assert.equal(measureBook(fixture(), T+3001).mid,null);
});
test('invalid, missing, crossed, duplicate, unordered levels are rejected', () => {
  for (const mutate of [b=>b.T=null,b=>b.E=T-1,b=>b.asks=[],b=>b.bids[0][1]='',
    b=>b.bids[0][1]='Infinity',b=>b.bids[0][0]='101',b=>b.bids[1][0]='99.99',
    b=>b.asks.reverse(),b=>b.bids[0][1]='-1']) {
    const b=fixture();mutate(b);assert.equal(measureBook(b,T+100).status,'INVALID');
  }
});
test('read-only endpoint, cache retains exchange clock and becomes stale',async()=>{
  let time=T+200,calls=0;
  const get=createBookService({now:()=>time,fetchImpl:async(url,opts)=>{
    calls++;assert.match(url,/^https:\/\/fapi.binance.com\/fapi\/v1\/depth\?symbol=BTCUSDT&limit=500$/);
    assert.equal(opts.redirect,'error');assert.equal(opts.method,undefined);return reply(fixture());
  }});
  assert.equal((await get('BTCUSDT')).cached,false);time+=500;
  const cached=await get('BTCUSDT');assert.equal(cached.cached,true);assert.equal(cached.bookAgeMs,700);
  assert.equal(calls,1);time=T+3200;assert.equal((await get('BTCUSDT')).status,'STALE');
});
test('bad symbols never reach network',async()=>{
  const get=createBookService({fetchImpl:()=>{throw Error('NETWORK_MUST_NOT_RUN');}});
  for(const s of ['',null,['BTCUSDT'],'BTCUSDT&limit=1000','btcUSDT','BTC/USDT','ETHUSDC'])
    await assert.rejects(get(s),/INVALID_SYMBOL/);
});
test('403 and rate limit responses stop retries for a bounded cooldown',async()=>{
  for (const code of [403,418,429,451]) {
    let calls=0,time=T+100;
    const get=createBookService({now:()=>time,fetchImpl:async()=>{calls++;return reply(null,code);}});
    await assert.rejects(get('BTCUSDT'),new RegExp(`UPSTREAM_HTTP_${code}`));
    await assert.rejects(get('SOLUSDT'),/UPSTREAM_BACKOFF/);assert.equal(calls,1);
  }
});
test('hard budget protects upstream weight and returns no fake measurements',async()=>{
  const get=createBookService({now:()=>T+100,fetchImpl:async()=>reply(fixture())});
  for(let i=0;i<60;i++) await get(`X${i}USDT`);
  await assert.rejects(get('EXTRAUSDT'),/LOCAL_BUDGET_OR_BUSY/);
});
