// === Универсальный прокси CoinGecko (Vera PRO V3) ===

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Главная
app.get('/', (req, res) => {
    res.send("🟢 Прокси CoinGecko Vera запущен!");
});

// Пинг
app.get('/api/ping', (req, res) => {
    res.json({ "gecko_says": "(V3) На Луну!" });
});

// === Универсальный маршрут ===
// принимает любой путь вида /api/coins/bitcoin, /api/simple/price и т.д.
app.get('/api/*', async (req, res) => {
    try {
        const endpoint = req.params[0]; // всё после /api/
        const url = `https://api.coingecko.com/api/v3/${endpoint}`;

        const response = await axios.get(url, {
            params: req.query
        });

        res.json(response.data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при запросе к CoinGecko' });
    }
});

// Стартуем сервер
app.listen(PORT, () => {
    console.log(`🟢 Vera Proxy listening on port ${PORT}`);
});
