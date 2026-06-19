import { ema, atr } from './indicators'

function pivotHighs(values, lookback = 3) {
  const result = []
  for (let i = lookback; i < values.length - lookback; i++) {
    let ok = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && values[j] >= values[i]) { ok = false; break }
    }
    if (ok) result.push(i)
  }
  return result
}

function pivotLows(values, lookback = 3) {
  const result = []
  for (let i = lookback; i < values.length - lookback; i++) {
    let ok = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && values[j] <= values[i]) { ok = false; break }
    }
    if (ok) result.push(i)
  }
  return result
}

// 3 pivot highs decrecientes + H2 cerca de la línea H1-H3
function findDescendingTrendline(candles, curAtr) {
  const n     = candles.length
  const highs = candles.map(c => c.high)
  // Excluir las últimas 4 velas: el pivot todavía no está confirmado
  const pivIdxs = pivotHighs(highs, 3).filter(i => i <= n - 4)
  if (pivIdxs.length < 3) return null

  for (let k = pivIdxs.length - 1; k >= 2; k--) {
    const [i1, i2, i3] = [pivIdxs[k - 2], pivIdxs[k - 1], pivIdxs[k]]
    const [h1, h2, h3] = [highs[i1], highs[i2], highs[i3]]

    // Los 3 máximos deben ser estrictamente decrecientes
    if (h2 >= h1 || h3 >= h2) continue

    // Línea por i1/h1 e i3/h3
    const slope     = (h3 - h1) / (i3 - i1)
    const intercept = h1 - slope * i1

    // Validar que H2 esté cerca de la línea (tolerancia 2× ATR)
    if (curAtr && Math.abs(h2 - (slope * i2 + intercept)) > curAtr * 2.0) continue

    // Proyectar 30 velas hacia el futuro
    const secPerCandle = candles[n - 1].time - candles[n - 2].time
    const futureTime   = candles[n - 1].time + 30 * secPerCandle
    const futureVal    = +(slope * (n - 1 + 30) + intercept).toFixed(2)

    // Toques posteriores al 3er pivot (velas donde el high rozó la línea)
    const touches = []
    for (let i = i3 + 1; i < n - 1; i++) {
      if (curAtr && Math.abs(candles[i].high - (slope * i + intercept)) < curAtr * 0.5) {
        touches.push(candles[i].time)
      }
    }

    return {
      type: 'DESCENDING',
      pivots: [
        { time: candles[i1].time, value: h1 },
        { time: candles[i2].time, value: h2 },
        { time: candles[i3].time, value: h3 },
      ],
      linePoints: [
        { time: candles[i1].time, value: +(slope * i1 + intercept).toFixed(2) },
        { time: futureTime,       value: futureVal },
      ],
      currentValue: +(slope * (n - 1) + intercept).toFixed(2),
      touches,
      // SL por encima del último máximo + 0.5× ATR
      slLevel: +(h3 + (curAtr ?? 0) * 0.5).toFixed(2),
    }
  }
  return null
}

// 3 pivot lows crecientes + L2 cerca de la línea L1-L3
function findAscendingTrendline(candles, curAtr) {
  const n    = candles.length
  const lows = candles.map(c => c.low)
  const pivIdxs = pivotLows(lows, 3).filter(i => i <= n - 4)
  if (pivIdxs.length < 3) return null

  for (let k = pivIdxs.length - 1; k >= 2; k--) {
    const [i1, i2, i3] = [pivIdxs[k - 2], pivIdxs[k - 1], pivIdxs[k]]
    const [l1, l2, l3] = [lows[i1], lows[i2], lows[i3]]

    if (l2 <= l1 || l3 <= l2) continue

    const slope     = (l3 - l1) / (i3 - i1)
    const intercept = l1 - slope * i1

    if (curAtr && Math.abs(l2 - (slope * i2 + intercept)) > curAtr * 2.0) continue

    const secPerCandle = candles[n - 1].time - candles[n - 2].time
    const futureTime   = candles[n - 1].time + 30 * secPerCandle
    const futureVal    = +(slope * (n - 1 + 30) + intercept).toFixed(2)

    const touches = []
    for (let i = i3 + 1; i < n - 1; i++) {
      if (curAtr && Math.abs(candles[i].low - (slope * i + intercept)) < curAtr * 0.5) {
        touches.push(candles[i].time)
      }
    }

    return {
      type: 'ASCENDING',
      pivots: [
        { time: candles[i1].time, value: l1 },
        { time: candles[i2].time, value: l2 },
        { time: candles[i3].time, value: l3 },
      ],
      linePoints: [
        { time: candles[i1].time, value: +(slope * i1 + intercept).toFixed(2) },
        { time: futureTime,       value: futureVal },
      ],
      currentValue: +(slope * (n - 1) + intercept).toFixed(2),
      touches,
      // SL por debajo del último mínimo − 0.5× ATR
      slLevel: +(l3 - (curAtr ?? 0) * 0.5).toFixed(2),
    }
  }
  return null
}

export function analyzeTrendlines(candles) {
  if (!candles || candles.length < 60) {
    return { descending: null, ascending: null, signal: null, ema20: null, curAtr: null }
  }

  const n      = candles.length
  const highs  = candles.map(c => c.high)
  const lows   = candles.map(c => c.low)
  const closes = candles.map(c => c.close)

  const atrV   = atr(highs, lows, closes, 14)
  const ema20v = ema(closes, 20)
  const curAtr  = atrV[n - 1]
  const ema20   = ema20v[n - 1]

  const descending = findDescendingTrendline(candles, curAtr)
  const ascending  = findAscendingTrendline(candles, curAtr)

  const curClose = closes[n - 1]
  const curHigh  = highs[n - 1]
  const curLow   = lows[n - 1]

  let signal = null

  // SHORT: high roza la trendline bajista Y precio bajo EMA20
  if (descending && curAtr) {
    const touching = curHigh >= descending.currentValue - curAtr * 0.5
    if (touching && ema20 && curClose < ema20) {
      signal = {
        direction: 'SHORT',
        reason:    'Toque trendline bajista · precio bajo EMA 20',
        entry:     curClose,
        sl:        descending.slLevel,
      }
    }
  }

  // LONG: low roza la trendline alcista Y precio sobre EMA20
  if (!signal && ascending && curAtr) {
    const touching = curLow <= ascending.currentValue + curAtr * 0.5
    if (touching && ema20 && curClose > ema20) {
      signal = {
        direction: 'LONG',
        reason:    'Toque trendline alcista · precio sobre EMA 20',
        entry:     curClose,
        sl:        ascending.slLevel,
      }
    }
  }

  return { descending, ascending, signal, ema20, curAtr }
}
