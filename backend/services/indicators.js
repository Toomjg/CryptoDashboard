// Calcula EMA completa (array de null hasta que hay suficientes datos)
function ema(values, period) {
  const k = 2 / (period + 1);
  const result = new Array(values.length).fill(null);
  if (values.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

// RSI con suavizado de Wilder
function rsi(closes, period = 14) {
  const result = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

// MACD (12, 26, 9) — devuelve series completas
function macd(closes) {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);

  const macdLine = closes.map((_, i) =>
    ema12[i] !== null && ema26[i] !== null ? ema12[i] - ema26[i] : null
  );

  // EMA 9 del MACD
  const firstIdx = macdLine.findIndex(v => v !== null);
  const macdValues = macdLine.slice(firstIdx).map(v => v ?? 0);
  const signalRaw = ema(macdValues, 9);

  const signalLine = new Array(closes.length).fill(null);
  for (let i = 0; i < signalRaw.length; i++) {
    if (signalRaw[i] !== null) signalLine[firstIdx + i] = signalRaw[i];
  }

  const histogram = closes.map((_, i) =>
    macdLine[i] !== null && signalLine[i] !== null ? macdLine[i] - signalLine[i] : null
  );

  return { macdLine, signalLine, histogram };
}

// Media de volumen
function volumeAvg(volumes, period = 20) {
  const result = new Array(volumes.length).fill(null);
  for (let i = period - 1; i < volumes.length; i++) {
    const sum = volumes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result[i] = sum / period;
  }
  return result;
}

// Genera señal compuesta con puntaje -10 a +10
function generateSignal(candles) {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const n = closes.length - 1;

  const ema20v = ema(closes, 20);
  const ema50v = ema(closes, 50);
  const ema200v = ema(closes, 200);
  const rsiV = rsi(closes, 14);
  const { macdLine, signalLine, histogram } = macd(closes);
  const volAvg = volumeAvg(volumes, 20);

  const price = closes[n];
  const curRsi = rsiV[n];
  const curMacd = macdLine[n];
  const curMacdSig = signalLine[n];
  const curHist = histogram[n];
  const prevHist = histogram[n - 1];
  const curVol = volumes[n];
  const avgVol = volAvg[n];

  let score = 0;
  const details = {};

  // RSI: -3 a +3
  if (curRsi !== null) {
    let s = 0, sig = 'NEUTRAL';
    if (curRsi < 30)      { s = 3;  sig = 'SOBREVENTA'; }
    else if (curRsi < 40) { s = 2;  sig = 'COMPRA'; }
    else if (curRsi < 45) { s = 1;  sig = 'DEBIL_COMPRA'; }
    else if (curRsi > 70) { s = -3; sig = 'SOBRECOMPRA'; }
    else if (curRsi > 60) { s = -2; sig = 'VENTA'; }
    else if (curRsi > 55) { s = -1; sig = 'DEBIL_VENTA'; }
    score += s;
    details.rsi = { value: +curRsi.toFixed(2), signal: sig, score: s };
  }

  // MACD: -3 a +3
  if (curMacd !== null && curMacdSig !== null) {
    let s = 0, sig = 'NEUTRAL';
    if (curMacd > curMacdSig) {
      s = curHist !== null && prevHist !== null && curHist > prevHist ? 3 : 2;
      sig = s === 3 ? 'FUERTE_COMPRA' : 'COMPRA';
    } else if (curMacd < curMacdSig) {
      s = curHist !== null && prevHist !== null && curHist < prevHist ? -3 : -2;
      sig = s === -3 ? 'FUERTE_VENTA' : 'VENTA';
    }
    score += s;
    details.macd = {
      macd: +curMacd.toFixed(4),
      signal: +curMacdSig.toFixed(4),
      histogram: curHist !== null ? +curHist.toFixed(4) : null,
      trend: sig,
      score: s
    };
  }

  // EMA: -3 a +3
  if (ema20v[n] !== null && ema50v[n] !== null) {
    const e20 = ema20v[n], e50 = ema50v[n], e200 = ema200v[n];
    const ab20 = price > e20, ab50 = price > e50, ab200 = e200 !== null && price > e200;
    const e20abE50 = e20 > e50;
    let s = 0, sig = 'NEUTRAL';

    if (ab20 && ab50 && e20abE50) {
      s = ab200 ? 3 : 2; sig = s === 3 ? 'FUERTE_COMPRA' : 'COMPRA';
    } else if (!ab20 && !ab50 && !e20abE50) {
      s = (!ab200 && e200 !== null) ? -3 : -2; sig = s === -3 ? 'FUERTE_VENTA' : 'VENTA';
    } else if (ab20) { s = 1; sig = 'DEBIL_COMPRA'; }
    else { s = -1; sig = 'DEBIL_VENTA'; }

    score += s;
    details.ema = {
      ema20: +e20.toFixed(2), ema50: +e50.toFixed(2),
      ema200: e200 ? +e200.toFixed(2) : null,
      signal: sig, score: s
    };
  }

  // Volumen: -1 a +1 (amplifica señal existente)
  if (avgVol) {
    const ratio = curVol / avgVol;
    let s = 0, sig = 'NORMAL';
    if (ratio > 1.5) {
      sig = 'ALTO';
      s = score > 0 ? 1 : score < 0 ? -1 : 0;
    } else if (ratio < 0.6) { sig = 'BAJO'; }
    score += s;
    details.volume = {
      ratio: +ratio.toFixed(2),
      signal: sig, score: s
    };
  }

  let overall;
  if      (score >= 7)  overall = 'COMPRA_FUERTE';
  else if (score >= 4)  overall = 'COMPRA';
  else if (score >= 1)  overall = 'COMPRA_DEBIL';
  else if (score <= -7) overall = 'VENTA_FUERTE';
  else if (score <= -4) overall = 'VENTA';
  else if (score <= -1) overall = 'VENTA_DEBIL';
  else                  overall = 'NEUTRAL';

  return { overall, score, maxScore: 10, details };
}

module.exports = { ema, rsi, macd, volumeAvg, generateSignal };
