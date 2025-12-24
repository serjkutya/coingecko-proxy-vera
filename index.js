// === VeraSuperPremium+ CoinGecko API Proxy (Render) ===
// Работает для CoinGecko API с ключом (включая Basic $35/мес).
// ENV: CG_API_KEY = <твой ключ CoinGecko>
// Порт: Render сам даст process.env.PORT

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Ключ берём ТОЛЬКО из Render ENV
const CG_API_KEY = process.env.CG_API_KEY || "";

// ВАЖНО:
// Для платных планов CoinGecko API обычно используется домен pro-api + заголовок x-cg-pro-api-key.
// Если вдруг у тебя в плане указан другой домен — поменяем, но стартуем с pro-api.
const COINGECKO_BASE = "https://pro-api.coingecko.com/api/v3";

// --- Health / ping ---
app.get("/", (req, res) => res.status(200).send("✅ Vera CoinGecko Proxy is running"));
app.get("/api/ping", (req, res) => res.json({ ok: true, ts: Date.now() }));

// --- Реальный ping CoinGecko (через ключ) ---
app.get("/api/cg/ping", async (req, res) => {
  try {
    if (!CG_API_KEY) {
      return res.status(500).json({
        error: "CG_API_KEY is not set on server (ENV). Add it in Render Environment and redeploy."
      });
    }

    const r = await axios.get(`${COINGECKO_BASE}/ping`, {
      headers: { "x-cg-pro-api-key": CG_API_KEY },
      timeout: 20000,
    });

    return res.status(200).json(r.data);
  } catch (e) {
    const status = e.response?.status || 500;
    return res.status(status).json({
      error: "CoinGecko ping failed",
      status,
      details: e.response?.data || e.message,
    });
  }
});

// --- УНИВЕРСАЛЬНЫЙ ПРОКСИ: всё что после /api/ -> уходит в CoinGecko /api/v3 ---
// Пример:
// /api/simple/price?ids=bitcoin&vs_currencies=usd
// /api/coins/bitcoin/market_chart?vs_currency=usd&days=1&interval=hourly
app.use("/api", async (req, res) => {
  try {
    if (!CG_API_KEY) {
      return res.status(500).json({
        error: "CG_API_KEY is not set on server (ENV). Add it in Render Environment and redeploy."
      });
    }

    // оригинальный путь: /api/<...>
    const path = req.originalUrl.replace(/^\/api/, ""); // оставляем всё после /api
    const url = `${COINGECKO_BASE}${path}`;

    const r = await axios.request({
      method: req.method,
      url,
      params: req.query,
      data: req.body,
      timeout: 20000,
      headers: {
        "x-cg-pro-api-key": CG_API_KEY,
        "accept": "application/json",
      },
      validateStatus: () => true, // чтобы прокидывать статус как есть
    });

    res.status(r.status).json(r.data);
  } catch (e) {
    const status = e.response?.status || 500;
    res.status(status).json({
      error: "Proxy request failed",
      status,
      details: e.response?.data || e.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Vera Proxy running on port ${PORT}`);
});
