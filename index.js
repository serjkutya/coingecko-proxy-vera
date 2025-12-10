// === Базовый CoinGecko Proxy API ===

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Разрешаем CORS для всех
app.use(cors());

app.get('/', (req, res) => {
  res.send('🟢 CoinGecko Proxy Vera is running!');
});

// Прокси для CoinGecko API
app.get('/api/:endpoint', async (req, res) => {
  const endpoint = req.params.endpoint;
  const query = req.query;
  const url =
    `https://api.coingecko.com/api/v3/${endpoint}`;

  try {
    const response = await axios.get(url, { params: query });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при запросе к CoinGecko' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
