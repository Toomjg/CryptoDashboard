const router = require('express').Router();
const { getNewsSentiment } = require('../services/news');

const SYMBOLS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT',
];

router.get('/symbols', (req, res) => res.json(SYMBOLS));

router.get('/news', async (req, res) => {
  const { symbol = 'BTCUSDT' } = req.query;
  if (!SYMBOLS.includes(symbol)) {
    return res.status(400).json({ error: 'Symbol no soportado' });
  }
  try {
    const news = await getNewsSentiment(symbol);
    res.json(news);
  } catch (err) {
    console.error('News error:', err.message);
    res.json({ score: 0, signal: 'NEUTRAL', news: [], available: false });
  }
});

module.exports = router;
