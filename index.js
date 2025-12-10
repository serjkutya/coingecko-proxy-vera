// === Universal CoinGecko Proxy (Vera PRO V3) ===

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- Главная страница ---
app.get("/", (req, res) => {
  res.send("🟢 CoinGecko Proxy Vera is running!");
});

// --- Пинг ---
app.get("/api/ping", (req, res) => {
  res.json({ gecko_says: "(V3) На Луну!" });
});

// === ГЛАВНЫЙ УНИВЕРСАЛЬНЫЙ ПРОКСИ ===
// Вместо app.get('/api/*') — используем app.use('/api').
// Это единственный способ заставить Render работать без ошибок.

app.use("/api", async (req, res) => {
  try {
    // Берём оригинальный путь: /api/coins/bitcoin/market_chart
    const originalPath = req.originalUrl.replace("/api/", "");

    const url = `https://api.coingecko.com/api/v3/${originalPath}`;

    const response = await axios.get(url, {
      params: req.query, // передаём параметры как есть
    });

    res.json(response.data);
  } catch (error) {
    console.error("Proxy error:", error.message);
    res.status(500).json({ error: "Ошибка при запросе к CoinGecko" });
  }
});

// --- Запуск сервера ---
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
