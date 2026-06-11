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

// GET /api/market/alert/test  — mensaje de prueba para verificar configuración Telegram
router.get('/alert/test', async (req, res) => {
  try {
    const result = await sendSignalAlert({
      symbol:   'BTCUSDT',
      interval: '1h',
      overall:  'COMPRA_FUERTE',
      score:    12,
      entry:    99999,
      tp:       105000,
      sl:       96000,
      rr:       1.84,
      fromAtr:  false,
      higherTf: '4h',
      higherOverall: 'COMPRA_FUERTE',
      isTest: true,
    });
    res.json(result);
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

module.exports = router;
