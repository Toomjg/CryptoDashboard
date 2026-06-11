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

// GET /api/market/alert/diagnose  — verifica la configuración sin enviar mensaje
router.get('/alert/diagnose', async (req, res) => {
  const axios = require('axios');
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const result = {
    token_configured:   !!token,
    chat_id_configured: !!chatId,
    chat_id_value:      chatId || '(no configurado)',
    bot_info:           null,
    error:              null,
  };

  if (token) {
    try {
      const r = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 6000 });
      result.bot_info = r.data.result;
    } catch (e) {
      result.error = e.response?.data || e.message;
    }
  }

  res.json(result);
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
