// === VeraSuperPremium+ — CoinGecko PRO Proxy (Stage 1.1) ===
// Цель: стабильные запросы, правильная авторизация PRO, ретраи при 429/5xx.
// Важно: ключ хранится на сервере (ENV), в Google Apps Script ключ НЕ нужен.

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

// В Render/Node: добавь переменную окружения:
const CG_PRO_KEY = process.env.CG_PRO_KEY; // <-- сюда ключ CoinGecko PRO
const CG_BASE = "https://pro-api.coingecko.com/api/v3";

// Тюнинг
const TIMEOUT_MS = 20000;
const MAX_RETRIES = 4;

// Утилита: ожидание
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Ретраи с backoff (429/5xx)
async function fetchWithRetry(url, params) {
  let lastErr;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await axios.get(url, {
        params,
        timeout: TIMEOUT_MS,
        headers: {
          accept: "application/json",
          "x-cg-pro-api-key": CG_PRO_KEY,
          // Чуть повышает стабильность:
          "user-agent": "VeraSuperPremiumProxy/1.1"
        }
      });

      return resp.data;
    } catch (e) {
      lastErr = e;

      const status = e?.response?.status;
      const retryAfter = Number(e?.response?.headers?.["retry-after"] || 0);

      // ретраим только 429 и 5xx
      const shouldRetry = status === 429 || (status >= 500 && status <= 599);

      if (!shouldRetry || attempt === MAX_RETRIES) break;

      // backoff: либо retry-after, либо экспонента
      const backoff = retryAfter > 0
        ? (retryAfter * 1000)
        : (800 * Math.pow(2, attempt)); // 800, 1600, 3200, 6400...

      await sleep(backoff);
    }
  }

  // Если дошли сюда — ошибка
  const status = lastErr?.response?.status || 500;
  const data = lastErr?.response?.data || { error: "Proxy fetch failed" };
  const msg = typeof data === "string" ? data : JSON.stringify(data);

  const err = new Error(`CG_PROXY_ERROR status=${status} body=${msg}`);
  err.httpStatus = status;
  throw err;
}

// Health
app.get("/", (_req, res) => res.send("✅ Vera PRO Proxy is running"));
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Главный прокси: /api/*  ->  https://pro-api.coingecko.com/api/v3/*
app.use("/api", async (req, res) => {
  try {
    if (!CG_PRO_KEY) {
      return res.status(500).json({
        error: "CG_PRO_KEY is not set on server (ENV). Add it and redeploy."
      });
    }

    // Оригинальный путь после /api
    const tail = req.originalUrl.replace(/^\/api/, ""); // например: /coins/bitcoin/market_chart?...
    const url = `${CG_BASE}${tail.split("?")[0]}`;

    const data = await fetchWithRetry(url, req.query);

    // Отдаём как есть
    res.status(200).json(data);
  } catch (e) {
    const status = e.httpStatus || 500;
    res.status(status).json({
      error: "Proxy error",
      message: e.message,
      ts: Date.now()
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Vera PRO Proxy listening on :${PORT}`);
});
