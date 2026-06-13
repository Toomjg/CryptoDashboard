import { generateMarkers } from './indicators'

const RISK_CONFIG = {
  '5m':  { sl: 0.015, tp: 0.030, beTrigger: 0.015, beSl: 0.003 },
  '15m': { sl: 0.025, tp: 0.050, beTrigger: 0.025, beSl: 0.005 },
  '1h':  { sl: 0.040, tp: 0.080, beTrigger: 0.040, beSl: 0.008 },
  '4h':  { sl: 0.070, tp: 0.140, beTrigger: 0.070, beSl: 0.014 },
  '1d':  { sl: 0.100, tp: 0.200, beTrigger: 0.100, beSl: 0.020 },
  '1w':  { sl: 0.150, tp: 0.300, beTrigger: 0.150, beSl: 0.030 },
}
function getRisk(interval) { return RISK_CONFIG[interval] || RISK_CONFIG['1h'] }

// Timeout escalado igual que el backend
const MAX_HOLD = {
  '5m': 48, '15m': 96, '1h': 72, '4h': 30, '1d': 15, '1w': 10,
}

export function runBacktest(candles, interval, strategy = 'ema') {
  if (!candles || candles.length < 100) return null

  const markers = generateMarkers(candles, interval, strategy)
  if (!markers.length) return { trades: [], total: 0, winRate: 0, wins: 0, losses: 0, bes: 0, timeouts: 0, profitFactor: null, avgWinPct: 0, avgLossPct: 0, equityCurve: [] }

  const timeToIdx = {}
  candles.forEach((c, i) => { timeToIdx[c.time] = i })

  const risk    = getRisk(interval)
  const maxHold = MAX_HOLD[interval] || 48

  const trades = []

  for (const marker of markers) {
    const i = timeToIdx[marker.time]
    if (i === undefined || i >= candles.length - 3) continue

    const isBuy = marker.position === 'belowBar'
    const entry = candles[i].close

    // SL y TP según temporalidad — igual que el bot
    const tp = isBuy ? +(entry * (1 + risk.tp)).toFixed(8) : +(entry * (1 - risk.tp)).toFixed(8)
    const sl = isBuy ? +(entry * (1 - risk.sl)).toFixed(8) : +(entry * (1 + risk.sl)).toFixed(8)

    let outcome    = 'TIMEOUT'
    let exitPrice  = candles[Math.min(i + maxHold, candles.length - 1)].close
    let exitCandle = maxHold
    let beTriggered = false
    let currentSl   = sl

    for (let j = i + 1; j < candles.length && j <= i + maxHold; j++) {
      // Break-even: si el precio supera beTrigger, mover SL a beSl
      if (!beTriggered) {
        if (isBuy  && candles[j].high >= entry * (1 + risk.beTrigger)) {
          beTriggered = true
          currentSl   = +(entry * (1 + risk.beSl)).toFixed(8)
        } else if (!isBuy && candles[j].low <= entry * (1 - risk.beTrigger)) {
          beTriggered = true
          currentSl   = +(entry * (1 - risk.beSl)).toFixed(8)
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

  // Curva de capital en unidades R (SL = 1R, TP = tp/sl R, BE = beSl/sl R)
  let equity = 0
  const equityCurve = trades.map(t => {
    if (t.outcome === 'WIN')  equity += risk.tp  / risk.sl
    if (t.outcome === 'BE')   equity += risk.beSl / risk.sl
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