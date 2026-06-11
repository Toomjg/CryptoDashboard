const router = require('express').Router();
const { getMarketSentiment } = require('../services/news');
const { sendSignalAlert }    = require('../services/telegram');

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

// POST /api/market/alert  — frontend lo llama cuando detecta señal confirmada en 2 TF
router.post('/alert', async (req, res) => {
  try {
    const result = await sendSignalAlert(req.body);
    res.json(result);
  } catch (err) {
    console.error('Alert error:', err.message);
    res.json({ ok: false, error: err.message });
  }
});

module.exports = router;
