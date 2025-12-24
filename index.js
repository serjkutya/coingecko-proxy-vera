// === VeraSuperPremium+ CoinGecko PRO Proxy (Render) ===
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ВАЖНО: ключ задаём в Render ENV: CG_PRO_KEY
const CG_PRO_KEY = process.env.CG_PRO_KEY || "";
// Используем PRO endpoint (под твой тариф с ключом)
const COINGECKO_BASE = "https://pro-api.coingecko.com/api/v3";

// --- Healthcheck (не CoinGecko) ---
app.get("/", (req, res) => res.send("✅ Vera CoinGecko Proxy is running"));
app.get("/api/ping", (req, res) => res.json({ ok: true, ts: Date.now() }));

// --- Реальный ping CoinGecko (через ключ) ---
app.get("/api/cg/ping", async (req, res) => {
  try {
    if (!CG_PRO_KEY) {
      return res.status(500).json({ error: "CG_PRO_KEY is not set on server (ENV). Add it and redeploy." });
    }
    const r = await axios.get(`${COINGECKO_BASE}/ping`, {
      headers: { "x-cg-pro-api-key": CG_PRO_KEY },
      timeout: 20000,
    });
    return res.status(200).json(r.data);
  } catch (e) {
    const status = e.response?.status || 500;
    return res.status(status).json({ error: "CoinGecko ping failed", details: e.message });
  }
});

// --- Главный прокси: всё, что после /api/... уходит в CoinGecko PRO ---
app.use("/api", async (req, res) => {
  try {
    if (!CG_PRO_KEY) {
      return res.status(500).json({ error: "CG_PRO_KEY is not set on server (ENV). Add it and redeploy." });
    }

    // Не даём /api/ping и /api/cg/ping сюда попасть
    if (req.path === "/ping" || req.path === "/cg/ping") {
      return res.status(404).json({ error: "Use /api/ping or /api/cg/ping" });
    }

    const url = `${COINGECKO_BASE}${req.path}`;

    const axiosConfig = {
      method: req.method,
      url,
      headers: {
        "x-cg-pro-api-key": CG_PRO_KEY,
        "accept": "application/json",
      },
      params: req.query,           // все query параметры пробрасываем как есть
      timeout: 20000,
      validateStatus: () => true,  // чтобы отдавать клиенту реальный статус
    };

    // POST/PUT body
    if (req.method !== "GET" && req.method !== "HEAD") {
      axiosConfig.data = req.body;
      axiosConfig.headers["content-type"] = "application/json";
    }

    const response = await axios(axiosConfig);
    return res.status(response.status).send(response.data);
  } catch (e) {
    const status = e.response?.status || 500;
    return res.status(status).json({
      error: "Proxy request failed",
      details: e.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Vera PRO proxy running on port ${PORT}`);
});
