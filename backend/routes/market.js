const router = require('express').Router();
const { getKlines, getTicker } = require('../services/binance');
const { ema, rsi, macd, volumeAvg, generateSignal, scoreToOverall } = require('../services/indicators');
const { getNewsSentiment } = require('../services/news');

const SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
];

const INTERVALS = ['15m', '1h', '4h', '1d'];

function toSeries(values, times) {
  return values
    .map((v, i) => (v !== null ? { time: times[i], value: v } : null))
    .filter(Boolean);
}

function toHistogramSeries(values, times) {
  return values
    .map((v, i) =>
      v !== null
        ? { time: times[i], value: v, color: v >= 0 ? '#26a69a80' : '#ef535080' }
        : null
    )
    .filter(Boolean);
}

router.get('/symbols', (req, res) => res.json(SYMBOLS));

router.get('/candles', async (req, res) => {
  const { symbol = 'BTCUSDT', interval = '1h' } = req.query;

  if (!SYMBOLS.includes(symbol))    return res.status(400).json({ error: 'Symbol no soportado' });
  if (!INTERVALS.includes(interval)) return res.status(400).json({ error: 'Intervalo no soportado' });

  try {
    // Las noticias se obtienen en paralelo; si fallan no bloquean el resto
    const [candles, ticker, newsData] = await Promise.all([
      getKlines(symbol, interval, 300),
      getTicker(symbol),
      getNewsSentiment(symbol).catch(() => ({ score: 0, signal: 'NEUTRAL', news: [], available: false })),
    ]);

    const closes  = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const times   = candles.map(c => c.time);

    const ema20v  = ema(closes, 20);
    const ema50v  = ema(closes, 50);
    const ema200v = ema(closes, 200);
    const rsiV    = rsi(closes, 14);
    const { macdLine, signalLine, histogram } = macd(closes);
    const volAvgV = volumeAvg(volumes, 20);

    // Señal técnica base
    const signal = generateSignal(candles);

    // Sumar sentimiento de noticias al score final
    signal.score += newsData.score;
    signal.maxScore = 11;
    signal.overall = scoreToOverall(signal.score);
    signal.details.noticias = {
      score:   newsData.score,
      signal:  newsData.signal,
      available: newsData.available,
    };

    res.json({
      symbol,
      interval,
      ticker,
      candles,
      indicators: {
        ema20:         toSeries(ema20v,  times),
        ema50:         toSeries(ema50v,  times),
        ema200:        toSeries(ema200v, times),
        rsi:           toSeries(rsiV,    times),
        macd:          toSeries(macdLine,   times),
        macdSignal:    toSeries(signalLine, times),
        macdHistogram: toHistogramSeries(histogram, times),
        volumeAvg:     toSeries(volAvgV, times),
      },
      signal,
      news: newsData,
    });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(502).json({ error: 'Error al obtener datos de mercado' });
  }
});

module.exports = router;
