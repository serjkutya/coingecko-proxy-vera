// === Universal CoinGecko Proxy (Vera PRO V3) ===

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Стартовая страница
app.get('/', (req, res) => {
  res.send("🦎 CoinGecko Proxy Vera is running!");
});

// Пинг
app.get('/api/ping', (req, res) => {
  res.json({ "gecko_says": "(V3) На Луну!" });
});

// === ГЛАВНЫЙ УНИВЕРСАЛЬНЫЙ ПРОКСИ ===
// Поддерживает ЛЮБОЙ путь вида /api/.../.../...
app.get('/api/*', async (req, res) => {
  try {
    const cgPath = req.params[0]; // всё, что идёт после /api/
    const query = req.query;

    const url = `https://api.coingecko.com/api/v3/${cgPath}`;

    const response = await axios.get(url, { params: query });

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Ошибка при запросе к CoinGecko", details: error.message });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Vera Proxy running on port ${PORT}`);
});
