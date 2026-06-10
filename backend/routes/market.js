const router = require('express').Router();
const { getKlines, getTicker } = require('../services/binance');
const { ema, rsi, macd, volumeAvg, generateSignal } = require('../services/indicators');

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

  if (!SYMBOLS.includes(symbol))   return res.status(400).json({ error: 'Symbol no soportado' });
  if (!INTERVALS.includes(interval)) return res.status(400).json({ error: 'Intervalo no soportado' });

  try {
    const [candles, ticker] = await Promise.all([
      getKlines(symbol, interval, 300),
      getTicker(symbol),
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

    const signal = generateSignal(candles);

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
    });
  } catch (err) {
    console.error('Error Binance:', err.message);
    res.status(502).json({ error: 'Error al obtener datos de Binance' });
  }
});

module.exports = router;
