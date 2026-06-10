// ─── Indicadores base ────────────────────────────────────────────────────────

export function ema(values, period) {
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

export function rsi(closes, period = 14) {
  const result = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period; avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export function macd(closes) {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = closes.map((_, i) =>
    ema12[i] !== null && ema26[i] !== null ? ema12[i] - ema26[i] : null
  );
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

export function volumeAvg(volumes, period = 20) {
  const result = new Array(volumes.length).fill(null);
  for (let i = period - 1; i < volumes.length; i++) {
    const sum = volumes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result[i] = sum / period;
  }
  return result;
}

// ─── Estrategias ─────────────────────────────────────────────────────────────

// Encuentra mínimos locales (un pivot low es menor que los 'lookback' vecinos)
function pivotLows(values, lookback = 3) {
  const result = [];
  for (let i = lookback; i < values.length - lookback; i++) {
    let ok = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && values[j] <= values[i]) { ok = false; break; }
    }
    if (ok) result.push(i);
  }
  return result;
}

// Encuentra máximos locales
function pivotHighs(values, lookback = 3) {
  const result = [];
  for (let i = lookback; i < values.length - lookback; i++) {
    let ok = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && values[j] >= values[i]) { ok = false; break; }
    }
    if (ok) result.push(i);
  }
  return result;
}

// Golden Cross / Death Cross: EMA 50 cruzando EMA 200
function detectEMACross(ema50v, ema200v, lookback = 10) {
  const n = ema50v.length - 1;
  for (let i = n; i >= Math.max(1, n - lookback); i--) {
    if (ema50v[i] === null || ema200v[i] === null) continue;
    if (ema50v[i - 1] === null || ema200v[i - 1] === null) continue;
    const age = n - i;
    // Golden Cross: EMA50 cruza por encima de EMA200
    if (ema50v[i - 1] <= ema200v[i - 1] && ema50v[i] > ema200v[i]) {
      return { type: 'GOLDEN', age, score: age <= 3 ? 2 : 1 };
    }
    // Death Cross: EMA50 cruza por debajo de EMA200
    if (ema50v[i - 1] >= ema200v[i - 1] && ema50v[i] < ema200v[i]) {
      return { type: 'DEATH', age, score: age <= 3 ? -2 : -1 };
    }
  }
  return null;
}

// Divergencia regular entre precio y un oscilador (RSI o MACD)
// Usa los últimos 'window' candles y require el pivot más reciente en los últimos 8
function detectDivergence(candles, oscillator, window = 60) {
  const n = candles.length;
  const start = Math.max(0, n - window);

  const lows  = candles.slice(start).map(c => c.low);
  const highs = candles.slice(start).map(c => c.high);
  const osc   = oscillator.slice(start);
  const recent = lows.length - 8; // el pivot tiene que estar en los últimos 8

  // Divergencia alcista: precio hace mínimo más bajo, oscilador hace mínimo más alto
  const pLows = pivotLows(lows);
  const recentLows = pLows.filter(i => i >= recent);
  if (recentLows.length > 0) {
    const idx2 = recentLows[recentLows.length - 1];
    const prevLows = pLows.filter(i => i < idx2);
    if (prevLows.length > 0) {
      const idx1 = prevLows[prevLows.length - 1];
      if (
        osc[idx1] !== null && osc[idx2] !== null &&
        lows[idx2] < lows[idx1] &&   // precio: mínimo más bajo
        osc[idx2]  > osc[idx1]        // oscilador: mínimo más alto
      ) {
        return { type: 'ALCISTA', score: 2 };
      }
    }
  }

  // Divergencia bajista: precio hace máximo más alto, oscilador hace máximo más bajo
  const pHighs = pivotHighs(highs);
  const recentHighs = pHighs.filter(i => i >= recent);
  if (recentHighs.length > 0) {
    const idx2 = recentHighs[recentHighs.length - 1];
    const prevHighs = pHighs.filter(i => i < idx2);
    if (prevHighs.length > 0) {
      const idx1 = prevHighs[prevHighs.length - 1];
      if (
        osc[idx1] !== null && osc[idx2] !== null &&
        highs[idx2] > highs[idx1] &&  // precio: máximo más alto
        osc[idx2]   < osc[idx1]        // oscilador: máximo más bajo
      ) {
        return { type: 'BAJISTA', score: -2 };
      }
    }
  }

  return null;
}

// ─── Patrones de velas ───────────────────────────────────────────────────────

export function detectCandlePatterns(candles) {
  const patterns = [];
  const n = candles.length - 1;
  if (n < 2) return patterns;

  const c0 = candles[n];
  const c1 = candles[n - 1];
  const c2 = candles[n - 2];

  // Helpers vela actual
  const body0   = Math.abs(c0.close - c0.open);
  const range0  = c0.high - c0.low || 0.000001;
  const lower0  = Math.min(c0.open, c0.close) - c0.low;
  const upper0  = c0.high - Math.max(c0.open, c0.close);
  const bull0   = c0.close > c0.open;
  const bear0   = c0.close < c0.open;

  // Helpers vela anterior
  const body1   = Math.abs(c1.close - c1.open);
  const range1  = c1.high - c1.low || 0.000001;
  const bull1   = c1.close > c1.open;
  const bear1   = c1.close < c1.open;

  // ── Hammer (Martillo) ── pequeño cuerpo arriba, sombra inferior larga
  if (
    body0 / range0 < 0.35 &&
    lower0 >= body0 * 2 &&
    upper0 <= body0 * 0.5
  ) {
    patterns.push({ name: 'HAMMER', label: 'Martillo', signal: 'ALCISTA', score: 2 });
  }

  // ── Shooting Star (Estrella Fugaz) ── pequeño cuerpo abajo, sombra superior larga
  if (
    body0 / range0 < 0.35 &&
    upper0 >= body0 * 2 &&
    lower0 <= body0 * 0.5
  ) {
    patterns.push({ name: 'SHOOTING_STAR', label: 'Estrella Fugaz', signal: 'BAJISTA', score: -2 });
  }

  // ── Doji ── cuerpo casi inexistente
  if (body0 / range0 < 0.08) {
    patterns.push({ name: 'DOJI', label: 'Doji', signal: 'NEUTRAL', score: 0 });
  }

  // ── Engulfing Alcista ── vela verde engloba completamente la roja anterior
  if (
    bear1 && bull0 &&
    c0.open  <= c1.close &&
    c0.close >= c1.open  &&
    body0 > body1
  ) {
    patterns.push({ name: 'ENGULFING_BULL', label: 'Envolvente Alcista', signal: 'ALCISTA', score: 2 });
  }

  // ── Engulfing Bajista ── vela roja engloba completamente la verde anterior
  if (
    bull1 && bear0 &&
    c0.open  >= c1.close &&
    c0.close <= c1.open  &&
    body0 > body1
  ) {
    patterns.push({ name: 'ENGULFING_BEAR', label: 'Envolvente Bajista', signal: 'BAJISTA', score: -2 });
  }

  // ── Morning Star (Estrella de la Mañana) ── 3 velas: roja, pequeña, verde
  const bear2 = c2.close < c2.open;
  const bull2 = c2.close > c2.open;
  if (
    bear2 &&
    body1 / range1 < 0.3 &&
    bull0 &&
    c0.close > (c2.open + c2.close) / 2
  ) {
    patterns.push({ name: 'MORNING_STAR', label: 'Estrella de la Mañana', signal: 'ALCISTA', score: 3 });
  }

  // ── Evening Star (Estrella Vespertina) ── 3 velas: verde, pequeña, roja
  if (
    bull2 &&
    body1 / range1 < 0.3 &&
    bear0 &&
    c0.close < (c2.open + c2.close) / 2
  ) {
    patterns.push({ name: 'EVENING_STAR', label: 'Estrella Vespertina', signal: 'BAJISTA', score: -3 });
  }

  // ── Marubozu Alcista ── vela verde sin sombras (momentum fuerte)
  if (bull0 && lower0 / range0 < 0.05 && upper0 / range0 < 0.05 && body0 / range0 > 0.9) {
    patterns.push({ name: 'MARUBOZU_BULL', label: 'Marubozu Alcista', signal: 'ALCISTA', score: 2 });
  }

  // ── Marubozu Bajista ── vela roja sin sombras
  if (bear0 && lower0 / range0 < 0.05 && upper0 / range0 < 0.05 && body0 / range0 > 0.9) {
    patterns.push({ name: 'MARUBOZU_BEAR', label: 'Marubozu Bajista', signal: 'BAJISTA', score: -2 });
  }

  return patterns;
}

// ─── Score general ────────────────────────────────────────────────────────────

export function scoreToOverall(score) {
  if      (score >= 9)  return 'COMPRA_FUERTE';
  else if (score >= 5)  return 'COMPRA';
  else if (score >= 2)  return 'COMPRA_DEBIL';
  else if (score <= -9) return 'VENTA_FUERTE';
  else if (score <= -5) return 'VENTA';
  else if (score <= -2) return 'VENTA_DEBIL';
  else                  return 'NEUTRAL';
}

export function generateSignal(candles) {
  const closes  = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const n = closes.length - 1;

  const ema20v  = ema(closes, 20);
  const ema50v  = ema(closes, 50);
  const ema200v = ema(closes, 200);
  const rsiV    = rsi(closes, 14);
  const { macdLine, signalLine, histogram } = macd(closes);
  const volAvg  = volumeAvg(volumes, 20);

  const price = closes[n];
  let score = 0;
  const details = {};

  // RSI: -3 a +3
  const curRsi = rsiV[n];
  if (curRsi !== null) {
    let s = 0, sig = 'NEUTRAL';
    if      (curRsi < 30) { s = 3;  sig = 'SOBREVENTA'; }
    else if (curRsi < 40) { s = 2;  sig = 'COMPRA'; }
    else if (curRsi < 45) { s = 1;  sig = 'DEBIL_COMPRA'; }
    else if (curRsi > 70) { s = -3; sig = 'SOBRECOMPRA'; }
    else if (curRsi > 60) { s = -2; sig = 'VENTA'; }
    else if (curRsi > 55) { s = -1; sig = 'DEBIL_VENTA'; }
    score += s;
    details.rsi = { value: +curRsi.toFixed(2), signal: sig, score: s };
  }

  // MACD: -3 a +3
  const curMacd = macdLine[n], curMacdSig = signalLine[n];
  const curHist = histogram[n], prevHist = histogram[n - 1];
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
      macd: +curMacd.toFixed(4), signal: +curMacdSig.toFixed(4),
      histogram: curHist !== null ? +curHist.toFixed(4) : null,
      trend: sig, score: s,
    };
  }

  // EMA: -3 a +3
  if (ema20v[n] !== null && ema50v[n] !== null) {
    const e20 = ema20v[n], e50 = ema50v[n], e200 = ema200v[n];
    const ab20 = price > e20, ab50 = price > e50;
    const ab200 = e200 !== null && price > e200;
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
      signal: sig, score: s,
    };
  }

  // Volumen: -1 a +1
  const avgVol = volAvg[n];
  if (avgVol) {
    const ratio = volumes[n] / avgVol;
    let s = 0, sig = 'NORMAL';
    if (ratio > 1.5) { sig = 'ALTO'; s = score > 0 ? 1 : score < 0 ? -1 : 0; }
    else if (ratio < 0.6) { sig = 'BAJO'; }
    score += s;
    details.volume = { ratio: +ratio.toFixed(2), signal: sig, score: s };
  }

  // Golden / Death Cross EMA50 x EMA200: -2 a +2
  if (ema50v[n] !== null && ema200v[n] !== null) {
    const cross = detectEMACross(ema50v, ema200v, 10);
    if (cross) {
      score += cross.score;
      details.cross = {
        type:  cross.type,
        age:   cross.age,
        score: cross.score,
        signal: cross.type === 'GOLDEN' ? 'GOLDEN_CROSS' : 'DEATH_CROSS',
      };
    }
  }

  // Divergencia RSI: -2 a +2
  if (rsiV[n] !== null) {
    const divRsi = detectDivergence(candles, rsiV, 60);
    if (divRsi) {
      score += divRsi.score;
      details.divRsi = {
        type:   divRsi.type,
        score:  divRsi.score,
        signal: divRsi.type === 'ALCISTA' ? 'DIV_ALCISTA' : 'DIV_BAJISTA',
      };
    }
  }

  // Divergencia MACD: -2 a +2
  if (macdLine[n] !== null) {
    const divMacd = detectDivergence(candles, macdLine, 60);
    if (divMacd) {
      score += divMacd.score;
      details.divMacd = {
        type:   divMacd.type,
        score:  divMacd.score,
        signal: divMacd.type === 'ALCISTA' ? 'DIV_ALCISTA' : 'DIV_BAJISTA',
      };
    }
  }

  // Patrones de velas: variable según patrón detectado
  const patterns = detectCandlePatterns(candles);
  if (patterns.length > 0) {
    const patternScore = patterns.reduce((sum, p) => sum + p.score, 0);
    score += patternScore;
    details.patterns = patterns;
  }

  return { overall: scoreToOverall(score), score, maxScore: 18, details };
}

// ─── Series para gráficos ─────────────────────────────────────────────────────

export function toSeries(values, times) {
  return values.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean);
}

export function toHistogramSeries(values, times) {
  return values
    .map((v, i) => v !== null
      ? { time: times[i], value: v, color: v >= 0 ? '#26a69a80' : '#ef535080' }
      : null)
    .filter(Boolean);
}
