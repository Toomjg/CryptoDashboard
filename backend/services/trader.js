const RISK_CONFIG = {
  '5m':  { sl: 0.015, tp: 0.030, beTrigger: 0.015, beSl: 0.003 },
  '15m': { sl: 0.025, tp: 0.050, beTrigger: 0.025, beSl: 0.005 },
  '1h':  { sl: 0.040, tp: 0.080, beTrigger: 0.040, beSl: 0.008 },
  '4h':  { sl: 0.070, tp: 0.140, beTrigger: 0.070, beSl: 0.014 },
  '1d':  { sl: 0.100, tp: 0.200, beTrigger: 0.100, beSl: 0.020 },
  '1w':  { sl: 0.150, tp: 0.300, beTrigger: 0.150, beSl: 0.030 },
}
function getRisk(interval) { return RISK_CONFIG[interval] || RISK_CONFIG['1h'] }

const INTERVAL_MS = {
  '5m':  5  * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h':  60 * 60 * 1000,
  '4h':  4  * 60 * 60 * 1000,
  '1d':  24 * 60 * 60 * 1000,
  '1w':  7  * 24 * 60 * 60 * 1000,
}
const MAX_HOLD_CANDLES = {
  '5m': 48, '15m': 96, '1h': 72, '4h': 30, '1d': 15, '1w': 10,
}
function getMaxHoldMs(interval) {
  return (INTERVAL_MS[interval] || INTERVAL_MS['15m']) * (MAX_HOLD_CANDLES[interval] || 15)
}

// ─── Bots disponibles ─────────────────────────────────────────────────────────
const BOT_IDS = ['15m', '1h']

function mkState(interval) {
  return {
    enabled:      true,
    paperMode:    true,
    capital:      100,
    startCapital: 100,
    riskPct:      5,
    interval,
    minStrength:  3,
    position:     null,
    trades:       [],
  }
}

const states = Object.fromEntries(BOT_IDS.map(id => [id, mkState(id)]))

function req(botId) {
  const s = states[botId]
  if (!s) throw new Error(`Bot '${botId}' no existe. Disponibles: ${BOT_IDS.join(', ')}`)
  return s
}

// ─── Lectura de estado ────────────────────────────────────────────────────────
function getState(botId) {
  const state = req(botId)
  const pos = state.position
  let livePnl = null

  if (pos && pos._lastPrice) {
    const isLong = pos.direction === 'LONG'
    const pnlPct = isLong
      ? (pos._lastPrice - pos.entry) / pos.entry
      : (pos.entry - pos._lastPrice) / pos.entry

    const maxHoldMs  = getMaxHoldMs(pos.interval)
    const elapsed    = Date.now() - pos.openTime
    const remaining  = Math.max(0, maxHoldMs - elapsed)
    const timeoutPct = Math.min(100, Math.round(elapsed / maxHoldMs * 100))
    const rH = Math.floor(remaining / 3600000)
    const rM = Math.floor((remaining % 3600000) / 60000)

    livePnl = {
      pct:   +(pnlPct * 100).toFixed(2),
      usd:   +(pos.size * pnlPct).toFixed(2),
      price: pos._lastPrice,
      timeout: {
        pct:   timeoutPct,
        label: rH > 0 ? `${rH}h ${rM}m` : `${rM}m`,
      },
    }
  }

  const wins      = state.trades.filter(t => t.outcome === 'WIN' || t.outcome === 'BE')
  const losses    = state.trades.filter(t => t.outcome === 'LOSS')
  const totalPnl  = state.trades.reduce((s, t) => s + t.pnlUSD, 0)

  return {
    botId,
    enabled:      state.enabled,
    paperMode:    state.paperMode,
    capital:      +state.capital.toFixed(2),
    startCapital: state.startCapital,
    riskPct:      state.riskPct,
    interval:     state.interval,
    minStrength:  state.minStrength,
    position:     pos ? { ...pos, _lastPrice: undefined, livePnl } : null,
    stats: {
      totalTrades: state.trades.length,
      wins:        wins.length,
      losses:      losses.length,
      winRate:     state.trades.length ? +(wins.length / state.trades.length * 100).toFixed(1) : null,
      totalPnl:    +totalPnl.toFixed(2),
      totalPnlPct: +((state.capital - state.startCapital) / state.startCapital * 100).toFixed(2),
    },
    trades: state.trades.slice(-20).reverse(),
  }
}

function getAllStates() {
  return Object.fromEntries(BOT_IDS.map(id => [id, getState(id)]))
}

// ─── Configuración ────────────────────────────────────────────────────────────
function configure(botId, { enabled, paperMode, capital, riskPct, minStrength }) {
  const state = req(botId)
  if (enabled     !== undefined) state.enabled     = enabled
  if (paperMode   !== undefined) state.paperMode   = paperMode
  if (riskPct     !== undefined) state.riskPct     = riskPct
  if (minStrength !== undefined) state.minStrength = minStrength
  if (capital !== undefined && !state.position) {
    state.capital      = capital
    state.startCapital = capital
  }
}

// ─── Entrada ──────────────────────────────────────────────────────────────────
function processSignal(botId, { symbol, interval, overall, score, entry, strength }) {
  const state = req(botId)
  if (!state.enabled)              return { triggered: false, reason: 'Bot desactivado' }
  if (interval !== state.interval) return { triggered: false, reason: `Bot opera en ${state.interval}` }
  if (state.position)              return { triggered: false, reason: 'Ya hay posición abierta' }

  const numStrength = parseInt(strength || '0', 10)
  if (numStrength < state.minStrength) return { triggered: false, reason: `Magnitud ${numStrength} < mínimo ${state.minStrength}` }

  const isLong = overall.includes('COMPRA')
  const risk   = getRisk(interval)
  const tp = isLong ? +(entry * (1 + risk.tp)).toFixed(2) : +(entry * (1 - risk.tp)).toFixed(2)
  const sl = isLong ? +(entry * (1 - risk.sl)).toFixed(2) : +(entry * (1 + risk.sl)).toFixed(2)

  const riskUSD      = state.capital * state.riskPct / 100
  const positionSize = Math.min(+(riskUSD / risk.sl).toFixed(2), state.capital)

  const position = {
    id:        Date.now(),
    symbol, interval, overall,
    direction: isLong ? 'LONG' : 'SHORT',
    strength:  numStrength,
    entry:     +entry,
    tp, sl, rr: 2.0,
    size:      positionSize,
    openTime:  Date.now(),
    paperMode: state.paperMode,
    _lastPrice: entry,
    breakEvenTriggered: false,
  }

  state.position = position
  console.log(`[BOT ${botId}] ${state.paperMode ? 'PAPER' : 'REAL'} ${position.direction} ${symbol} @ ${entry} | TP ${tp} | SL ${sl} | $${positionSize}`)
  return { triggered: true, position: { ...position, _lastPrice: undefined }, paperMode: state.paperMode }
}

// ─── Precio en tiempo real ────────────────────────────────────────────────────
function updatePrice(botId, symbol, currentPrice) {
  const state = req(botId)
  if (!state.position || state.position.symbol !== symbol) return null

  state.position._lastPrice = currentPrice
  const pos     = state.position
  const isLong  = pos.direction === 'LONG'
  const { tp, entry, size, interval: posInterval, openTime } = pos

  if (!pos.breakEvenTriggered) {
    const risk    = getRisk(pos.interval)
    const gainPct = isLong ? (currentPrice - entry) / entry : (entry - currentPrice) / entry
    if (gainPct >= risk.beTrigger) {
      pos.sl = isLong
        ? +(entry * (1 + risk.beSl)).toFixed(2)
        : +(entry * (1 - risk.beSl)).toFixed(2)
      pos.breakEvenTriggered = true
      console.log(`[BOT ${botId}] BREAK-EVEN ${symbol} — SL → ${pos.sl}`)
    }
  }

  const sl      = pos.sl
  const elapsed = Date.now() - openTime
  let closed = false, outcome = null, exitPrice = currentPrice

  if (elapsed > getMaxHoldMs(posInterval)) {
    closed = true; outcome = 'TIMEOUT'
  } else if (isLong) {
    if (currentPrice >= tp) { closed = true; outcome = 'WIN';  exitPrice = tp }
    if (currentPrice <= sl) { closed = true; outcome = pos.breakEvenTriggered ? 'BE' : 'LOSS'; exitPrice = sl }
  } else {
    if (currentPrice <= tp) { closed = true; outcome = 'WIN';  exitPrice = tp }
    if (currentPrice >= sl) { closed = true; outcome = pos.breakEvenTriggered ? 'BE' : 'LOSS'; exitPrice = sl }
  }

  if (!closed) return null

  const pnlPct = isLong ? (exitPrice - entry) / entry : (entry - exitPrice) / entry
  const pnlUSD = +(size * pnlPct).toFixed(2)
  const trade  = { ...state.position, _lastPrice: undefined, exitPrice, outcome, pnlPct: +(pnlPct * 100).toFixed(2), pnlUSD, closeTime: Date.now() }

  state.capital  = +(state.capital + pnlUSD).toFixed(2)
  state.trades.push(trade)
  state.position = null
  console.log(`[BOT ${botId}] CERRADO ${outcome} ${trade.symbol} | P&L $${pnlUSD} | Capital $${state.capital}`)
  return trade
}

function forceClose(botId, price) {
  const state = req(botId)
  if (!state.position) return null
  return updatePrice(botId, state.position.symbol, price) || (() => {
    const { direction, entry, size } = state.position
    const isLong = direction === 'LONG'
    const pnlPct = isLong ? (price - entry) / entry : (entry - price) / entry
    const pnlUSD = +(size * pnlPct).toFixed(2)
    const trade  = { ...state.position, _lastPrice: undefined, exitPrice: price, outcome: 'MANUAL', pnlPct: +(pnlPct * 100).toFixed(2), pnlUSD, closeTime: Date.now() }
    state.capital  = +(state.capital + pnlUSD).toFixed(2)
    state.trades.push(trade)
    state.position = null
    return trade
  })()
}

module.exports = { BOT_IDS, getState, getAllStates, configure, processSignal, updatePrice, forceClose }
