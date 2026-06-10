const router = require('express').Router();
const { getMarketSentiment } = require('../services/news');

const SYMBOLS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT',
];

router.get('/symbols', (req, res) => res.json(SYMBOLS));

router.get('/news', async (req, res) => {
  try {
    const sentiment = await getMarketSentiment();
    res.json(sentiment);
  } catch (err) {
    console.error('Sentiment error:', err.message);
    res.json({ score: 0, signal: 'NEUTRAL', value: null, label: null, available: false });
  }
});

module.exports = router;
