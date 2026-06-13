// ─── Parámetros de riesgo por temporalidad (ratio TP/SL siempre 2:1) ─────────
//   sl:        % de caída desde entrada para stop loss
//   tp:        % de subida desde entrada para take profit
//   beTrigger: ganancia necesaria para activar break-even (= sl)
//   beSl:      nuevo SL al activarse break-even (~20% del sl)
const RISK_CONFIG = {
  '5m':  { sl: 0.015, tp: 0.030, beTrigger: 0.015, beSl: 0.003 },
  '15m': { sl: 0.025, tp: 0.050, beTrigger: 0.025, beSl: 0.005 },
  '1h':  { sl: 0.040, tp: 0.080, beTrigger: 0.040, beSl: 0.008 },
  '4h':  { sl: 0.070, tp: 0.140, beTrigger: 0.070, beSl: 0.014 },
  '1d':  { sl: 0.100, tp: 0.200, beTrigger: 0.100, beSl: 0.020 },
  '1w':  { sl: 0.150, tp: 0.300, beTrigger: 0.150, beSl: 0.030 },
}
function getRisk(interval) { return RISK_CONFIG[interval] || RISK_CONFIG['1h'] }

// Duración en ms de cada vela por temporalidad
const INTERVAL_MS = {
  '5m':  5  * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h':  60 * 60 * 1000,
  '4h':  4  * 60 * 60 * 1000,
  '1d':  24 * 60 * 60 * 1000,
  '1w':  7  * 24 * 60 * 60 * 1000,
}
// Timeout escalado al tiempo que necesita cada target para desarrollarse
const MAX_HOLD_CANDLES = {
  '5m': 48, '15m': 96, '1h': 72, '4h': 30, '1d': 15, '1w': 10,
}

function getMaxHoldMs(interval) {
  const ms = INTERVAL_MS[interval] || INTERVAL_MS['15m']
  const n  = MAX_HOLD_CANDLES[interval] || 15
  return ms * n
}

// Estado en memoria — persiste mientras Railway no reinicie el servicio
const state = {
  enabled:    true,
  paperMode:  true,          // true = simulado, false = real (Binance API)
  capital:    100,           // USD disponible
  startCapital: 100,
  riskPct:    5,             // % del capital a arriesgar por trade
  interval:   '15m',        // temporalidad que activa el bot
  minStrength: 4,            // magnitud mínima para operar
  position:   null,          // posición abierta actual
  trades:     [],            // historial de trades cerrados
}

// ─── Configuración ──────────────────────────────────────────────────────────

function getState() {
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

  const closedTrades = state.trades
  const wins   = closedTrades.filter(t => t.outcome === 'WIN' || t.outcome === 'BE')
  const losses = closedTrades.filter(t => t.outcome === 'LOSS')
  const totalPnl = closedTrades.reduce((s, t) => s + t.pnlUSD, 0)

  return {
    enabled:     state.enabled,
    paperMode:   state.paperMode,
    capital:     +state.capital.toFixed(2),
    startCapital: state.startCapital,
    riskPct:     state.riskPct,
    interval:    state.interval,
    minStrength: state.minStrength,
    position:    pos ? { ...pos, _lastPrice: undefined, livePnl } : null,
    stats: {
      totalTrades: closedTrades.length,
      wins:        wins.length,
      losses:      losses.length,
      winRate:     closedTrades.length ? +(wins.length / closedTrades.length * 100).toFixed(1) : null,
      totalPnl:    +totalPnl.toFixed(2),
      totalPnlPct: +((state.capital - state.startCapital) / state.startCapital * 100).toFixed(2),
    },
    trades: closedTrades.slice(-20).reverse(),  // últimos 20
  }
}

function configure({ enabled, paperMode, capital, riskPct, interval, minStrength }) {
  if (enabled    !== undefined) state.enabled    = enabled
  if (paperMode  !== undefined) state.paperMode  = paperMode
  if (riskPct    !== undefined) state.riskPct    = riskPct
  if (interval   !== undefined) state.interval   = interval
  if (minStrength !== undefined) state.minStrength = minStrength

  // Cambiar capital solo si no hay posición abierta
  if (capital !== undefined && !state.position) {
    state.capital      = capital
    state.startCapital = capital
  }
}

// ─── Lógica de entrada ──────────────────────────────────────────────────────

function processSignal({ symbol, interval, overall, score, entry, strength }) {
  if (!state.enabled)                    return { triggered: false, reason: 'Bot desactivado' }
  if (interval !== state.interval)       return { triggered: false, reason: `Bot opera solo en ${state.interval}` }
  if (state.position)                    return { triggered: false, reason: 'Ya hay una posición abierta' }

  const numStrength = parseInt(strength || '0', 10)
  if (numStrength < state.minStrength)   return { triggered: false, reason: `Magnitud ${numStrength} < mínimo ${state.minStrength}` }

  const isLong = overall.includes('COMPRA')
  const risk   = getRisk(interval)

  // SL y TP en % según temporalidad
  const tp = isLong
    ? +(entry * (1 + risk.tp)).toFixed(2)
    : +(entry * (1 - risk.tp)).toFixed(2)
  const sl = isLong
    ? +(entry * (1 - risk.sl)).toFixed(2)
    : +(entry * (1 + risk.sl)).toFixed(2)

  // Tamaño de posición: arriesgar riskPct% del capital sobre el SL de la temporalidad
  const riskUSD      = state.capital * state.riskPct / 100
  const positionSize = Math.min(+(riskUSD / risk.sl).toFixed(2), state.capital)

  const position = {
    id:        Date.now(),
    symbol, interval, overall,
    direction: isLong ? 'LONG' : 'SHORT',
    strength:  numStrength,
    entry:     +entry,
    tp, sl,
    rr:        2.0,
    size:      positionSize,
    openTime:  Date.now(),
    paperMode: state.paperMode,
    _lastPrice: entry,
    breakEvenTriggered: false,
  }

  state.position = position
  console.log(`[BOT] ${state.paperMode ? 'PAPER' : 'REAL'} ${position.direction} ${symbol} @ ${entry} | TP ${tp} (+${risk.tp*100}%) | SL ${sl} (-${risk.sl*100}%) | Size $${positionSize}`)

  return { triggered: true, position: { ...position, _lastPrice: undefined }, paperMode: state.paperMode }
}

// ─── Actualización de precio en tiempo real ─────────────────────────────────

function updatePrice(symbol, currentPrice) {
  if (!state.position || state.position.symbol !== symbol) return null

  state.position._lastPrice = currentPrice

  const pos = state.position
  const { direction, tp, entry, size, interval: posInterval, openTime } = pos
  const isLong = direction === 'LONG'

  // Break-even: cuando la ganancia supera beTrigger, mover SL a beSl
  if (!pos.breakEvenTriggered) {
    const risk    = getRisk(pos.interval)
    const gainPct = isLong
      ? (currentPrice - entry) / entry
      : (entry - currentPrice) / entry
    if (gainPct >= risk.beTrigger) {
      const newSl = isLong
        ? +(entry * (1 + risk.beSl)).toFixed(2)
        : +(entry * (1 - risk.beSl)).toFixed(2)
      pos.sl = newSl
      pos.breakEvenTriggered = true
      console.log(`[BOT] BREAK-EVEN ${symbol} — SL movido a ${newSl} (+${risk.beSl * 100}%)`)
    }
  }

  const sl = pos.sl  // leer después del posible update de break-even

  // Timeout: si el trade superó el equivalente a maxHold velas, cerrar a precio de mercado
  const elapsed   = Date.now() - openTime
  const maxHoldMs = getMaxHoldMs(posInterval)

  let closed = false, outcome = null, exitPrice = currentPrice

  if (elapsed > maxHoldMs) {
    closed = true; outcome = 'TIMEOUT'; exitPrice = currentPrice
  } else if (isLong) {
    if (currentPrice >= tp) { closed = true; outcome = 'WIN';  exitPrice = tp }
    if (currentPrice <= sl) { closed = true; outcome = pos.breakEvenTriggered ? 'BE' : 'LOSS'; exitPrice = sl }
  } else {
    if (currentPrice <= tp) { closed = true; outcome = 'WIN';  exitPrice = tp }
    if (currentPrice >= sl) { closed = true; outcome = pos.breakEvenTriggered ? 'BE' : 'LOSS'; exitPrice = sl }
  }

  if (!closed) return null

  const pnlPct = isLong
    ? (exitPrice - entry) / entry
    : (entry - exitPrice) / entry
  const pnlUSD = +(size * pnlPct).toFixed(2)

  const trade = {
    ...state.position,
    _lastPrice: undefined,
    exitPrice,
    outcome,
    pnlPct: +(pnlPct * 100).toFixed(2),
    pnlUSD,
    closeTime: Date.now(),
  }

  state.capital  = +(state.capital + pnlUSD).toFixed(2)
  state.trades.push(trade)
  state.position = null

  console.log(`[BOT] CERRADO ${outcome} ${trade.symbol} | P&L $${pnlUSD} (${(pnlPct * 100).toFixed(2)}%) | Capital: $${state.capital}`)
  return trade
}

// Cierra la posición abierta manualmente al precio dado
function forceClose(price) {
  if (!state.position) return null
  return updatePrice(state.position.symbol, price) || (() => {
    const { direction, entry, size } = state.position
    const isLong = direction === 'LONG'
    const pnlPct = isLong ? (price - entry) / entry : (entry - price) / entry
    const pnlUSD = +(size * pnlPct).toFixed(2)
    const trade = {
      ...state.position, _lastPrice: undefined,
      exitPrice: price, outcome: 'MANUAL',
      pnlPct: +(pnlPct * 100).toFixed(2), pnlUSD,
      closeTime: Date.now(),
    }
    state.capital  = +(state.capital + pnlUSD).toFixed(2)
    state.trades.push(trade)
    state.position = null
    return trade
  })()
}

module.exports = { getState, configure, processSignal, updatePrice, forceClose }
