// === VeraSuperPremium+ CoinGecko Proxy (BASIC plan compatible) ===

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// 🔑 КЛЮЧ из Render → Environment
const CG_API_KEY = process.env.CG_API_KEY || "";

// ❗ BASIC / PAID API (НЕ PRO)
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

// --- health ---
app.get("/", (req, res) => {
  res.send("✅ VeraSuperPremium+ CoinGecko Proxy ONLINE");
});

// --- local ping ---
app.get("/api/ping", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// --- universal proxy ---
app.use("/api", async (req, res) => {
  try {
    const path = req.originalUrl.replace("/api", "");
    const url = `${COINGECKO_BASE}${path}`;

    if (!CG_API_KEY) {
      return res.status(500).json({
        error: "CG_API_KEY not set in Render ENV"
      });
    }

    const response = await axios.get(url, {
      params: req.query,
      timeout: 20000,
      headers: {
        "accept": "application/json",
        "x-cg-demo-api-key": CG_API_KEY
      }
    });

    res.status(response.status).json(response.data);

  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({
      error: "Proxy error",
      status,
      message: err.response?.data || err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Vera Proxy running on port ${PORT}`);
});
