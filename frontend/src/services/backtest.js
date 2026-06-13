import { generateMarkers } from './indicators'

const SL_PCT     = 0.10
const TP_PCT     = 0.20
const BE_TRIGGER = 0.10
const BE_SL      = 0.02

export function runBacktest(candles, interval, strategy = 'ema') {
  if (!candles || candles.length < 100) return null

  const markers = generateMarkers(candles, interval, strategy)
  if (!markers.length) return { trades: [], total: 0, winRate: 0, wins: 0, losses: 0, bes: 0, timeouts: 0, profitFactor: null, avgWinPct: 0, avgLossPct: 0, equityCurve: [] }

  const timeToIdx = {}
  candles.forEach((c, i) => { timeToIdx[c.time] = i })

  const isShortTerm = interval === '5m' || interval === '15m' || interval === '1h'
  const maxHold = isShortTerm ? 24 : 15

  const trades = []

  for (const marker of markers) {
    const i = timeToIdx[marker.time]
    if (i === undefined || i >= candles.length - 3) continue

    const isBuy = marker.position === 'belowBar'
    const entry = candles[i].close

    // SL y TP fijos en % — igual que el bot
    const tp = isBuy ? +(entry * (1 + TP_PCT)).toFixed(8) : +(entry * (1 - TP_PCT)).toFixed(8)
    const sl = isBuy ? +(entry * (1 - SL_PCT)).toFixed(8) : +(entry * (1 + SL_PCT)).toFixed(8)

    let outcome    = 'TIMEOUT'
    let exitPrice  = candles[Math.min(i + maxHold, candles.length - 1)].close
    let exitCandle = maxHold
    let beTriggered = false
    let currentSl   = sl

    for (let j = i + 1; j < candles.length && j <= i + maxHold; j++) {
      // Break-even: si el precio supera BE_TRIGGER, mover SL a BE_SL
      if (!beTriggered) {
        if (isBuy  && candles[j].high >= entry * (1 + BE_TRIGGER)) {
          beTriggered = true
          currentSl   = +(entry * (1 + BE_SL)).toFixed(8)
        } else if (!isBuy && candles[j].low <= entry * (1 - BE_TRIGGER)) {
          beTriggered = true
          currentSl   = +(entry * (1 - BE_SL)).toFixed(8)
        }
      }

      if (isBuy) {
        if (candles[j].high >= tp)        { outcome = 'WIN';                        exitPrice = tp;        exitCandle = j - i; break }
        if (candles[j].low  <= currentSl) { outcome = beTriggered ? 'BE' : 'LOSS'; exitPrice = currentSl; exitCandle = j - i; break }
      } else {
        if (candles[j].low  <= tp)        { outcome = 'WIN';                        exitPrice = tp;        exitCandle = j - i; break }
        if (candles[j].high >= currentSl) { outcome = beTriggered ? 'BE' : 'LOSS'; exitPrice = currentSl; exitCandle = j - i; break }
      }
    }

    const pct = isBuy
      ? (exitPrice - entry) / entry * 100
      : (entry - exitPrice) / entry * 100

    trades.push({
      time:      marker.time,
      direction: isBuy ? 'LONG' : 'SHORT',
      strength:  marker.text,
      isBounce:  marker.bounce === true,
      entry, tp, sl: currentSl, outcome, exitPrice,
      pct:       +pct.toFixed(2),
      exitCandle,
    })
  }

  const wins     = trades.filter(t => t.outcome === 'WIN' || t.outcome === 'BE')
  const losses   = trades.filter(t => t.outcome === 'LOSS')
  const bes      = trades.filter(t => t.outcome === 'BE')
  const timeouts = trades.filter(t => t.outcome === 'TIMEOUT')
  const winRate  = trades.length ? +(wins.length / trades.length * 100).toFixed(1) : 0

  const totalGain    = wins.reduce((s, t) => s + t.pct, 0)
  const totalLoss    = losses.reduce((s, t) => s + Math.abs(t.pct), 0)
  const profitFactor = totalLoss > 0 ? +(totalGain / totalLoss).toFixed(2) : null
  const avgWinPct    = wins.length   ? +(totalGain / wins.length).toFixed(2)   : 0
  const avgLossPct   = losses.length ? +(totalLoss / losses.length).toFixed(2) : 0

  // Curva de capital en unidades R (SL = 1R, TP = 2R, BE = 0.2R)
  let equity = 0
  const equityCurve = trades.map(t => {
    if (t.outcome === 'WIN')  equity += TP_PCT / SL_PCT        // 2.0R
    if (t.outcome === 'BE')   equity += BE_SL  / SL_PCT        // 0.2R
    if (t.outcome === 'LOSS') equity -= 1.0
    return +equity.toFixed(2)
  })

  const longs      = trades.filter(t => t.direction === 'LONG')
  const shorts     = trades.filter(t => t.direction === 'SHORT')
  const longWins   = longs.filter(t => t.outcome === 'WIN' || t.outcome === 'BE')
  const shortWins  = shorts.filter(t => t.outcome === 'WIN' || t.outcome === 'BE')
  const byDirection = {
    LONG:  { total: longs.length,  wins: longWins.length,  winRate: longs.length  ? +(longWins.length  / longs.length  * 100).toFixed(1) : null },
    SHORT: { total: shorts.length, wins: shortWins.length, winRate: shorts.length ? +(shortWins.length / shorts.length * 100).toFixed(1) : null },
  }

  let peak = 0, maxDrawdown = 0
  for (const v of equityCurve) {
    if (v > peak) peak = v
    const dd = peak - v
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  const byStrength = {}
  for (let s = 1; s <= 5; s++) {
    const group  = trades.filter(t => t.strength === String(s))
    const gWins  = group.filter(t => t.outcome === 'WIN' || t.outcome === 'BE')
    byStrength[s] = {
      total:    group.length,
      wins:     gWins.length,
      losses:   group.filter(t => t.outcome === 'LOSS').length,
      timeouts: group.filter(t => t.outcome === 'TIMEOUT').length,
      winRate:  group.length ? +(gWins.length / group.length * 100).toFixed(1) : null,
      avgPct:   group.length ? +(group.reduce((s, t) => s + t.pct, 0) / group.length).toFixed(2) : null,
    }
  }

  return {
    trades,
    total:        trades.length,
    winRate,
    wins:         wins.length,
    losses:       losses.length,
    bes:          bes.length,
    timeouts:     timeouts.length,
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