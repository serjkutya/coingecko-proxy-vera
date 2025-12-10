// === Universal CoinGecko Proxy (Vera PRO V3) ===

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// === Главная страница ===
app.get('/', (req, res) => {
  res.send("🟢 CoinGecko Proxy Vera is running!");
});

// === Пинг ===
app.get('/api/ping', (req, res) => {
  res.json({ "gecko_says": "(V3) На Луну!" });
});

// === Универсальный прокси ===
// принимает *любой* путь после /api/ (например coins/bitcoin, coins/markets и т.д.)
app.get('/api/*', async (req, res) => {
  try {
    // убираем "/api/"
    const endpoint = req.params[0];

    const url = `https://api.coingecko.com/api/v3/${endpoint}`;

    const response = await axios.get(url, {
      params: req.query,   // подхватывает параметры
      headers: { 'X-API-KEY': process.env.CG_KEY || '' }
    });

    res.json(response.data);

  } catch (err) {
    res.status(500).json({ error: "Ошибка при запросе к CoinGecko", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Vera Proxy started on port " + PORT);
});
