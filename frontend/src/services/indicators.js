// ─── Indicadores base ────────────────────────────────────────────────────────

export function atr(highs, lows, closes, period = 14) {
  const n = closes.length;
  const result = new Array(n).fill(null);
  if (n < period + 1) return result;
  for (let i = 1; i < n; i++) {
    const tr = Math.max(
      highs[i]  - lows[i],
      Math.abs(highs[i]  - closes[i - 1]),
      Math.abs(lows[i]   - closes[i - 1])
    );
    if (i === period) {
      let sum = 0;
      for (let j = 1; j <= period; j++) {
        sum += Math.max(highs[j] - lows[j], Math.abs(highs[j] - closes[j-1]), Math.abs(lows[j] - closes[j-1]));
      }
      result[period] = sum / period;
    } else if (i > period && result[i - 1] !== null) {
      result[i] = (result[i - 1] * (period - 1) + tr) / period;
    }
  }
  return result;
}

export function bollingerBands(closes, period = 20, mult = 2) {
  const result = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean  = slice.reduce((a, b) => a + b, 0) / period;
    const sd    = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    result[i]   = { upper: mean + mult * sd, middle: mean, lower: mean - mult * sd };
  }
  return result;
}

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

// ─── Soporte y Resistencia ───────────────────────────────────────────────────

// Agrupa niveles cercanos (dentro del % de tolerancia) y cuenta cuántas veces fue tocado
export function findSupportResistance(candles, lookback = 150) {
  const recent  = candles.slice(-lookback);
  const highs   = recent.map(c => c.high);
  const lows    = recent.map(c => c.low);

  const pivH = pivotHighs(highs, 4);
  const pivL = pivotLows(lows,   4);

  const raw = [
    ...pivH.map(i => highs[i]),
    ...pivL.map(i => lows[i]),
  ];

  // Clusterizar niveles dentro del 1%
  const clusters = [];
  for (const price of raw) {
    const found = clusters.find(c => Math.abs(c.price - price) / price < 0.01);
    if (found) { found.touches++; found.price = (found.price + price) / 2; }
    else         clusters.push({ price, touches: 1 });
  }

  const significant = clusters
    .filter(l => l.touches >= 2)
    .sort((a, b) => b.touches - a.touches);

  const cur = candles[candles.length - 1].close;

  const supports    = significant.filter(l => l.price < cur * 0.999)
                                 .sort((a, b) => b.price - a.price).slice(0, 4);
  const resistances = significant.filter(l => l.price > cur * 1.001)
                                 .sort((a, b) => a.price - b.price).slice(0, 4);

  return { supports, resistances };
}

function analyzeSR(currentPrice, prevPrice, { supports, resistances }) {
  const NEAR = 0.012; // 1.2% de cercanía

  // Ruptura de resistencia → alcista fuerte
  const brokenR = resistances.find(r => prevPrice < r.price && currentPrice > r.price);
  if (brokenR) return { score: 2, signal: 'RUPTURA_ALCISTA' };

  // Ruptura de soporte → bajista fuerte
  const brokenS = supports.find(s => prevPrice > s.price && currentPrice < s.price);
  if (brokenS) return { score: -2, signal: 'RUPTURA_BAJISTA' };

  // Precio rebotando en soporte
  const nearS = supports.find(s => Math.abs(currentPrice - s.price) / currentPrice < NEAR);
  if (nearS) return { score: 1, signal: 'CERCA_SOPORTE' };

  // Precio tocando resistencia
  const nearR = resistances.find(r => Math.abs(currentPrice - r.price) / currentPrice < NEAR);
  if (nearR) return { score: -1, signal: 'CERCA_RESISTENCIA' };

  return { score: 0, signal: 'NEUTRAL' };
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
  if      (score >= 11) return 'COMPRA_FUERTE';
  else if (score >= 7)  return 'COMPRA';
  else if (score >= 3)  return 'COMPRA_DEBIL';
  else if (score <= -11) return 'VENTA_FUERTE';
  else if (score <= -7) return 'VENTA';
  else if (score <= -3) return 'VENTA_DEBIL';
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

  // Soporte y Resistencia: -2 a +2
  const srData   = findSupportResistance(candles);
  const srResult = analyzeSR(closes[n], closes[n - 1], srData);
  score += srResult.score;
  details.sr = {
    signal:      srResult.signal,
    score:       srResult.score,
    supports:    srData.supports,
    resistances: srData.resistances,
  };

  // Bollinger Bands: -2 a +2
  // Precio bajo banda inferior = sobreventa extrema (compra fuerte)
  // Precio sobre banda superior = sobrecompra extrema (venta fuerte)
  const bbAll = bollingerBands(closes);
  const bb    = bbAll[n];
  if (bb) {
    const bPct = (bb.upper - bb.lower) > 0
      ? (price - bb.lower) / (bb.upper - bb.lower)
      : 0.5;
    let s = 0, sig = 'NEUTRAL';
    if      (bPct <= 0)   { s =  2; sig = 'COMPRA'; }
    else if (bPct <= 0.2) { s =  1; sig = 'DEBIL_COMPRA'; }
    else if (bPct >= 1)   { s = -2; sig = 'VENTA'; }
    else if (bPct >= 0.8) { s = -1; sig = 'DEBIL_VENTA'; }
    score += s;
    details.bb = {
      upper:   +bb.upper.toFixed(2),
      lower:   +bb.lower.toFixed(2),
      percent: +bPct.toFixed(3),
      signal:  sig, score: s,
    };
  }

  // ─── Objetivo de precio (TP / SL) ─────────────────────────────────────────
  let target = null;
  const isBull = score > 0;

  // Primero intentar con S/R (supports/resistances están ordenados por proximidad, más cercano primero)
  if (isBull) {
    const tp = srData.resistances.find(r => r.price > price);   // resistencia más cercana encima
    const sl = srData.supports.find(s => s.price < price);      // soporte más cercano abajo
    if (tp && sl) {
      const risk = price - sl.price, reward = tp.price - price;
      target = { tp: tp.price, sl: sl.price, rr: risk > 0 ? +(reward / risk).toFixed(2) : null, direction: 'LONG' };
    }
  } else if (score < 0) {
    const tp = srData.supports.find(s => s.price < price);      // soporte más cercano abajo
    const sl = srData.resistances.find(r => r.price > price);   // resistencia más cercana encima
    if (tp && sl) {
      const risk = sl.price - price, reward = price - tp.price;
      target = { tp: tp.price, sl: sl.price, rr: risk > 0 ? +(reward / risk).toFixed(2) : null, direction: 'SHORT' };
    }
  }

  // Siempre calcular ATR — lo guardamos en el target para poder recalcular
  // TP/SL sobre el precio en vivo en lugar del precio de la vela cerrada
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const atrAll = atr(highs, lows, closes, 14);
  const curAtr = atrAll[n];

  if (!target && score !== 0 && curAtr !== null) {
    if (isBull) {
      target = { tp: +(price + curAtr * 2.0).toFixed(2), sl: +(price - curAtr * 1.0).toFixed(2), rr: 2.0, direction: 'LONG',  fromAtr: true };
    } else {
      target = { tp: +(price - curAtr * 2.0).toFixed(2), sl: +(price + curAtr * 1.0).toFixed(2), rr: 2.0, direction: 'SHORT', fromAtr: true };
    }
  }

  // Guardar ATR en todos los targets para que App.jsx pueda recentrar los niveles
  // sobre el precio en vivo (evita SL por encima de entrada en LONGs, etc.)
  if (target && curAtr !== null) target.atr = curAtr;

  // Confirmación de momentum: si RSI y MACD van en contra de la dirección,
  // la señal viene solo de indicadores rezagados (EMA, patrones) — reducirla
  const rsiScore  = details.rsi?.score  || 0
  const macdScore = details.macd?.score || 0
  if (score > 0 && rsiScore <= 0 && macdScore <= 0) score = Math.floor(score * 0.5)
  if (score < 0 && rsiScore >= 0 && macdScore >= 0) score = Math.ceil(score  * 0.5)

  return { overall: scoreToOverall(score), score, maxScore: 22, details, target };
}

// ─── Estrategia específica para 5m: EMA 9/21 crossover ───────────────────────
// Para 5m el MACD es demasiado lento (EMA 26 = 130 min). El cruce EMA 9/21 es
// más rápido y captura el movimiento antes de que termine.
function generateMarkers5m(candles) {
  const closes  = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)
  const times   = candles.map(c => c.time)

  const ema9v   = ema(closes,  9)   // ~45 min
  const ema21v  = ema(closes, 21)   // ~105 min
  const ema20v  = ema(closes, 20)   // filtro de tendencia (~100 min)
  const ema50v  = ema(closes, 50)   // tendencia de corto plazo (~250 min / 4h)
  const rsiV    = rsi(closes, 14)
  const volAvgV = volumeAvg(volumes, 20)

  const minGap = 6   // mínimo 30 min entre señales
  const markers = []
  let lastIdx = -minGap

  for (let i = 55; i < candles.length; i++) {
    const e9  = ema9v[i],  e9p  = ema9v[i - 1]
    const e21 = ema21v[i], e21p = ema21v[i - 1]
    if (e9 === null || e21 === null || e9p === null || e21p === null) continue
    if (i - lastIdx < minGap) continue

    // Disparador: cruce fresco EMA 9/21
    const freshBull = e9p <= e21p && e9 > e21
    const freshBear = e9p >= e21p && e9 < e21
    if (!freshBull && !freshBear) continue

    const close = closes[i]
    const e20   = ema20v[i]
    const e50   = ema50v[i]
    const r     = rsiV[i]
    const va    = volAvgV[i]

    // Filtro duro: descartar si EMA 20 y EMA 50 van en contra
    if (freshBull && e20 !== null && e50 !== null && close < e20 && close < e50) continue
    if (freshBear && e20 !== null && e50 !== null && close > e20 && close > e50) continue

    // RSI: no entrar si ya está en zona extrema
    if (r !== null && freshBull && r >= 70) continue
    if (r !== null && freshBear && r <= 30) continue

    // Magnitud: 1 base + hasta 4 confirmaciones
    let strength = 1

    if (r !== null) {
      if (freshBull && r <= 55) strength++   // RSI con recorrido alcista
      if (freshBear && r >= 45) strength++   // RSI con recorrido bajista
    }
    if (e20 !== null) {
      if (freshBull && close > e20) strength++   // precio sobre EMA 20
      if (freshBear && close < e20) strength++
    }
    if (e50 !== null) {
      if (freshBull && close > e50) strength++   // tendencia 4h a favor
      if (freshBear && close < e50) strength++
    }
    if (va !== null && volumes[i] > va * 1.3) strength++  // volumen confirma

    strength = Math.min(5, strength)
    if (strength < 3) { lastIdx = i; continue }

    markers.push({
      time:     times[i],
      position: freshBull ? 'belowBar' : 'aboveBar',
      color:    '#FFD700',
      shape:    freshBull ? 'arrowUp' : 'arrowDown',
      size:     1,
      text:     String(strength),
    })
    lastIdx = i
  }

  return markers.slice(-60)
}

// ─── Estrategia 5m: UT Bot Alerts (ATR trailing stop crossover) ───────────────
// Algoritmo original de UT Bot: trailing stop dinámico basado en ATR.
// Señal cuando el precio cruza el trailing stop → más rápido que cualquier cruce de medias.
function generateMarkers5mUTBot(candles, keyValue = 1, atrPeriod = 10) {
  const closes  = candles.map(c => c.close)
  const highs   = candles.map(c => c.high)
  const lows    = candles.map(c => c.low)
  const volumes = candles.map(c => c.volume)
  const times   = candles.map(c => c.time)

  const atrV    = atr(highs, lows, closes, atrPeriod)
  const rsiV    = rsi(closes, 14)
  const volAvgV = volumeAvg(volumes, 20)

  // Calcular ATR trailing stop (lógica Pine Script original)
  const nLoss     = atrV.map(v => v !== null ? v * keyValue : null)
  const trailStop = new Array(closes.length).fill(null)

  for (let i = 1; i < closes.length; i++) {
    const loss = nLoss[i]
    if (loss === null) continue
    const c = closes[i], cp = closes[i - 1]
    const prev = trailStop[i - 1]
    if (prev === null) { trailStop[i] = c - loss; continue }

    if      (c > prev && cp > prev) trailStop[i] = Math.max(prev, c - loss)
    else if (c < prev && cp < prev) trailStop[i] = Math.min(prev, c + loss)
    else if (c > prev)              trailStop[i] = c - loss
    else                            trailStop[i] = c + loss
  }

  const markers = []
  let lastIdx = -6  // 30 min mínimo entre señales

  for (let i = atrPeriod + 2; i < candles.length; i++) {
    const c  = closes[i],    cp  = closes[i - 1]
    const ts = trailStop[i], tsp = trailStop[i - 1]
    if (ts === null || tsp === null) continue
    if (i - lastIdx < 6) continue

    // Cruce precio vs trailing stop
    const bullCross = cp <= tsp && c > ts
    const bearCross = cp >= tsp && c < ts
    if (!bullCross && !bearCross) continue

    const r  = rsiV[i]
    const va = volAvgV[i]

    // Filtro RSI: no entrar en zona extrema
    if (r !== null && bullCross && r >= 72) continue
    if (r !== null && bearCross && r <= 28) continue

    // Magnitud: base 2 (el cruce UT Bot ya tiene alto valor) + confirmaciones
    let strength = 2

    // Volumen confirma la ruptura
    if (va !== null && volumes[i] > va * 1.3) strength++

    // ATR por encima de su promedio reciente → movimiento más fuerte
    const recentAtr = atrV.slice(Math.max(0, i - 10), i).filter(v => v !== null)
    if (recentAtr.length > 0) {
      const avgAtr = recentAtr.reduce((a, b) => a + b, 0) / recentAtr.length
      if (atrV[i] > avgAtr * 1.15) strength++
    }

    // RSI en zona con recorrido
    if (r !== null) {
      if (bullCross && r < 55) strength++
      if (bearCross && r > 45) strength++
    }

    strength = Math.min(5, strength)
    if (strength < 3) { lastIdx = i; continue }

    markers.push({
      time:     times[i],
      position: bullCross ? 'belowBar' : 'aboveBar',
      color:    '#FFD700',
      shape:    bullCross ? 'arrowUp' : 'arrowDown',
      size:     1,
      text:     String(strength),
    })
    lastIdx = i
  }

  return markers.slice(-60)
}

// ─── Marcadores históricos de señal ──────────────────────────────────────────

// strategy: 'ema' (EMA 9/21) | 'utbot' (UT Bot trailing stop) — solo aplica a 5m
export function generateMarkers(candles, interval, strategy = 'ema') {
  if (interval === '5m') {
    return strategy === 'utbot'
      ? generateMarkers5mUTBot(candles)
      : generateMarkers5m(candles)
  }
  if (!candles || candles.length < 60) return []

  const closes  = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)
  const times   = candles.map(c => c.time)

  const ema20v  = ema(closes, 20)
  const ema50v  = ema(closes, 50)
  const ema200v = ema(closes, 200)
  const rsiV    = rsi(closes, 14)
  const { macdLine, signalLine } = macd(closes)
  const volAvgV = volumeAvg(volumes, 20)

  const isShortTerm = interval === '5m' || interval === '15m' || interval === '1h'
  // Mínimo de velas entre señales para evitar señales duplicadas en rango
  const minGap = isShortTerm ? 5 : 3

  const markers = []
  let lastIdx   = -minGap

  for (let i = 55; i < candles.length; i++) {
    const ml  = macdLine[i],     ml0 = macdLine[i - 1]
    const sig = signalLine[i],   sig0 = signalLine[i - 1]
    if (ml === null || sig === null || ml0 === null || sig0 === null) continue

    // ── Disparador primario: cruce MACD fresco ─────────────────────────
    const freshBull = ml0 <= sig0 && ml > sig   // cruce alcista
    const freshBear = ml0 >= sig0 && ml < sig   // cruce bajista
    if (!freshBull && !freshBear) continue
    if (i - lastIdx < minGap)    continue

    const close = closes[i]
    const e20   = ema20v[i], e50 = ema50v[i], e200 = ema200v[i]
    const r     = rsiV[i]
    const va    = volAvgV[i]

    // ── Filtros de calidad: si no se cumplen, descartar la señal ───────
    if (freshBull) {
      // No comprar si RSI ya está sobrecomprado (>= 65)
      if (r !== null && r >= 65) continue
      // No comprar contra tendencia fuerte (precio bajo EMA50 Y EMA200)
      if (e50 !== null && e200 !== null && close < e50 && close < e200) continue
    }
    if (freshBear) {
      // No vender si RSI ya está sobrevendido (<= 35)
      if (r !== null && r <= 35) continue
      // No vender contra tendencia fuerte (precio sobre EMA50 Y EMA200)
      if (e50 !== null && e200 !== null && close > e50 && close > e200) continue
    }

    // ── Magnitud 1-5: confirmaciones adicionales ───────────────────────
    // Cada condición cumplida suma 1 punto de fuerza
    let strength = 1  // el cruce MACD ya garantiza magnitud mínima 1

    // RSI en zona favorable (no extremo, con recorrido)
    if (r !== null) {
      if (freshBull && r <= 50) strength++       // RSI aún no sobrecomprado
      if (freshBear && r >= 50) strength++       // RSI aún no sobrevendido
    }

    // EMA50 alineada con la señal
    if (e50 !== null) {
      if (freshBull && close > e50) strength++
      if (freshBear && close < e50) strength++
    }

    // EMA200 alineada (tendencia de largo plazo a favor)
    if (e200 !== null) {
      if (freshBull && close > e200) strength++
      if (freshBear && close < e200) strength++
    }

    // Volumen alto confirma el cruce
    if (va !== null && volumes[i] > va * 1.5) strength++

    strength = Math.min(5, strength)

    // Solo mostrar magnitud 3+ — 1 y 2 son ruido según backtest
    if (strength < 3) { lastIdx = i; continue }

    markers.push({
      time:     times[i],
      position: freshBull ? 'belowBar' : 'aboveBar',
      color:    '#FFD700',
      shape:    freshBull ? 'arrowUp' : 'arrowDown',
      size:     isShortTerm ? 1 : 2,
      text:     String(strength),
    })
    lastIdx = i
  }

  return markers.slice(-60)
}

// ─── Señal activa unificada — derivada del sistema de marcadores ──────────────
// Esta es la fuente de verdad para overlay, cuadro TP/SL y alertas Telegram.
// Un sistema, un criterio: si hay flecha también hay cuadro y notificación.
export function getActiveSignal(candles, markers, interval) {
  if (!candles || !markers || markers.length === 0) return null

  const isShortTerm = ['5m', '15m', '1h'].includes(interval)
  // Ventana de "frescura": cuántas velas cerradas hacia atrás cuenta como señal activa
  const freshN  = isShortTerm ? 8 : 5
  const closed  = candles.slice(0, -1)
  const freshTs = new Set(closed.slice(-freshN).map(c => c.time))

  // Buscar el marcador más reciente dentro de la ventana fresca
  for (let i = markers.length - 1; i >= 0; i--) {
    const m         = markers[i]
    const magnitude = parseInt(m.text, 10)
    if (!freshTs.has(m.time)) break  // los marcadores están en orden cronológico

    if (magnitude < 3) return null  // magnitud 1-2 son ruido (confirmado por backtest)

    const isLong  = m.position === 'belowBar'
    const overall = magnitude >= 4
      ? (isLong ? 'COMPRA_FUERTE' : 'VENTA_FUERTE')
      : (isLong ? 'COMPRA'        : 'VENTA')

    // ATR en la vela del marcador para TP/SL
    const highs      = candles.map(c => c.high)
    const lows       = candles.map(c => c.low)
    const closes     = candles.map(c => c.close)
    const atrV       = atr(highs, lows, closes, 14)
    const markerIdx  = candles.findIndex(c => c.time === m.time)
    const markerAtr  = markerIdx >= 0 ? atrV[markerIdx] : null

    return { overall, magnitude, isLong, direction: isLong ? 'LONG' : 'SHORT', atr: markerAtr, markerTime: m.time }
  }
  return null
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
