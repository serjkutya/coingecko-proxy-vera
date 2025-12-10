// === Universal CoinGecko Proxy (Vera PRO V3) ===

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Стартовая страница
app.get('/', (req, res) => {
  res.send('🟢 CoinGecko Proxy Vera is running!');
});

// Пинг
app.get('/api/ping', (req, res) => {
  res.json({ "gecko_says": "(V3) На Луну!" });
});

// === ГЛАВНЫЙ УНИВЕРСАЛЬНЫЙ ПРОКСИ ===
// Поддерживает ЛЮБОЙ путь вида /api/.../.../...
app.get('/api/*', async (req, res) => {
  try {
    // Получаем всё после "/api/"
    const endpoint = req.params[0];

    // Собираем URL
    const url = `https://api.coingecko.com/api/v3/${endpoint}`;

    // Пересылаем query параметры как есть
    const response = await axios.get(url, { params: req.query });

    res.json(response.data);

  } catch (error) {
    console.error("Proxy Error:", error.message);
    res.status(500).json({ error: "Proxy request failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Vera Proxy running on port ${PORT}`);
});
