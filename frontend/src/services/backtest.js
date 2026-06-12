import { atr, generateMarkers } from './indicators'

// Ejecuta backtest sobre las velas históricas usando las mismas señales
// que genera generateMarkers. Para cada señal mira las velas siguientes
// y detecta si el precio llegó al TP o al SL primero.
export function runBacktest(candles, interval, strategy = 'ema') {
  if (!candles || candles.length < 100) return null

  const markers = generateMarkers(candles, interval, strategy)
  if (!markers.length) return { trades: [], total: 0, winRate: 0, wins: 0, losses: 0, timeouts: 0, profitFactor: null, avgWinPct: 0, avgLossPct: 0, equityCurve: [] }

  const highs  = candles.map(c => c.high)
  const lows   = candles.map(c => c.low)
  const closes = candles.map(c => c.close)
  const atrV   = atr(highs, lows, closes, 14)

  // Índice rápido tiempo → posición en el array
  const timeToIdx = {}
  candles.forEach((c, i) => { timeToIdx[c.time] = i })

  const isShortTerm = interval === '5m' || interval === '15m' || interval === '1h'
  // Máximo de velas a esperar antes de declarar timeout
  const maxHold = isShortTerm ? 24 : 15

  const trades = []

  for (const marker of markers) {
    const i = timeToIdx[marker.time]
    if (i === undefined || i >= candles.length - 3) continue

    const isBuy  = marker.position === 'belowBar'
    const entry  = candles[i].close
    const curAtr = atrV[i]
    if (!curAtr || curAtr <= 0) continue

    // R/R 2:1 → rentable a partir de 34% win rate
    const tp = isBuy ? entry + curAtr * 2.0 : entry - curAtr * 2.0
    const sl = isBuy ? entry - curAtr * 1.0 : entry + curAtr * 1.0

    let outcome    = 'TIMEOUT'
    let exitPrice  = candles[Math.min(i + maxHold, candles.length - 1)].close
    let exitCandle = maxHold

    for (let j = i + 1; j < candles.length && j <= i + maxHold; j++) {
      if (isBuy) {
        if (candles[j].high >= tp) { outcome = 'WIN';  exitPrice = tp; exitCandle = j - i; break }
        if (candles[j].low  <= sl) { outcome = 'LOSS'; exitPrice = sl; exitCandle = j - i; break }
      } else {
        if (candles[j].low  <= tp) { outcome = 'WIN';  exitPrice = tp; exitCandle = j - i; break }
        if (candles[j].high >= sl) { outcome = 'LOSS'; exitPrice = sl; exitCandle = j - i; break }
      }
    }

    // P&L real en %
    const pct = isBuy
      ? (exitPrice - entry) / entry * 100
      : (entry - exitPrice) / entry * 100

    trades.push({
      time:      marker.time,
      direction: isBuy ? 'LONG' : 'SHORT',
      strength:  marker.text,
      entry, tp, sl, outcome, exitPrice,
      pct:       +pct.toFixed(2),
      exitCandle,
    })
  }

  // Estadísticas
  const wins     = trades.filter(t => t.outcome === 'WIN')
  const losses   = trades.filter(t => t.outcome === 'LOSS')
  const timeouts = trades.filter(t => t.outcome === 'TIMEOUT')
  const winRate  = trades.length ? +(wins.length / trades.length * 100).toFixed(1) : 0

  const totalGain   = wins.reduce((s, t) => s + t.pct, 0)
  const totalLoss   = losses.reduce((s, t) => s + Math.abs(t.pct), 0)
  const profitFactor = totalLoss > 0 ? +(totalGain / totalLoss).toFixed(2) : null
  const avgWinPct   = wins.length   ? +(totalGain / wins.length).toFixed(2)   : 0
  const avgLossPct  = losses.length ? +(totalLoss / losses.length).toFixed(2) : 0

  // Curva de capital normalizada (1% riesgo por operación, R/R 2:1)
  let equity = 0
  const equityCurve = trades.map(t => {
    if (t.outcome === 'WIN')  equity += 2.0
    if (t.outcome === 'LOSS') equity -= 1.0
    return +equity.toFixed(2)
  })

  // Desglose por dirección (LONG vs SHORT)
  const longs  = trades.filter(t => t.direction === 'LONG')
  const shorts = trades.filter(t => t.direction === 'SHORT')
  const longWins  = longs.filter(t => t.outcome === 'WIN')
  const shortWins = shorts.filter(t => t.outcome === 'WIN')
  const byDirection = {
    LONG:  { total: longs.length,  wins: longWins.length,  winRate: longs.length  ? +(longWins.length  / longs.length  * 100).toFixed(1) : null },
    SHORT: { total: shorts.length, wins: shortWins.length, winRate: shorts.length ? +(shortWins.length / shorts.length * 100).toFixed(1) : null },
  }

  // Máximo drawdown
  let peak = 0, maxDrawdown = 0
  for (const v of equityCurve) {
    if (v > peak) peak = v
    const dd = peak - v
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  // Desglose por magnitud de señal (1-5)
  const byStrength = {}
  for (let s = 1; s <= 5; s++) {
    const group = trades.filter(t => t.strength === String(s))
    const gWins = group.filter(t => t.outcome === 'WIN')
    byStrength[s] = {
      total:   group.length,
      wins:    gWins.length,
      losses:  group.filter(t => t.outcome === 'LOSS').length,
      timeouts: group.filter(t => t.outcome === 'TIMEOUT').length,
      winRate: group.length ? +(gWins.length / group.length * 100).toFixed(1) : null,
      avgPct:  group.length ? +(group.reduce((s, t) => s + t.pct, 0) / group.length).toFixed(2) : null,
    }
  }

  return {
    trades,
    total:     trades.length,
    winRate,
    wins:      wins.length,
    losses:    losses.length,
    timeouts:  timeouts.length,
    profitFactor,
    avgWinPct,
    avgLossPct,
    equityCurve,
    maxDrawdown:  +maxDrawdown.toFixed(2),
    finalEquity:  +equity.toFixed(2),
    byStrength,
    byDirection,
  }
}
