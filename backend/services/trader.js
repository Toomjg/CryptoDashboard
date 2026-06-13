// ─── Parámetros de riesgo fijos ─────────────────────────────────────────────
const SL_PCT     = 0.10  // Stop loss: 10% desde la entrada
const TP_PCT     = 0.20  // Take profit: 20% desde la entrada
const BE_TRIGGER = 0.10  // Activar break-even al +10% de ganancia
const BE_SL      = 0.02  // SL se mueve a +2% al activarse break-even

// Duración en ms de cada vela por temporalidad
const INTERVAL_MS = {
  '5m':  5  * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h':  60 * 60 * 1000,
  '4h':  4  * 60 * 60 * 1000,
  '1d':  24 * 60 * 60 * 1000,
  '1w':  7  * 24 * 60 * 60 * 1000,
}
// Máximo de velas a esperar antes de cerrar por timeout (igual que el backtest)
const MAX_HOLD_CANDLES = {
  '5m': 24, '15m': 24, '1h': 15, '4h': 15, '1d': 10, '1w': 8,
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

  // SL y TP fijos en % desde el precio de entrada
  const tp = isLong
    ? +(entry * (1 + TP_PCT)).toFixed(2)
    : +(entry * (1 - TP_PCT)).toFixed(2)
  const sl = isLong
    ? +(entry * (1 - SL_PCT)).toFixed(2)
    : +(entry * (1 + SL_PCT)).toFixed(2)

  // Tamaño de posición: arriesgar riskPct% del capital (SL fijo en 10%)
  const riskUSD      = state.capital * state.riskPct / 100
  const positionSize = Math.min(+(riskUSD / SL_PCT).toFixed(2), state.capital)

  const position = {
    id:        Date.now(),
    symbol, interval, overall,
    direction: isLong ? 'LONG' : 'SHORT',
    strength:  numStrength,
    entry:     +entry,
    tp, sl,
    rr:        TP_PCT / SL_PCT,  // siempre 2.0
    size:      positionSize,
    openTime:  Date.now(),
    paperMode: state.paperMode,
    _lastPrice: entry,
    breakEvenTriggered: false,
  }

  state.position = position
  console.log(`[BOT] ${state.paperMode ? 'PAPER' : 'REAL'} ${position.direction} ${symbol} @ ${entry} | TP ${tp} (+${TP_PCT*100}%) | SL ${sl} (-${SL_PCT*100}%) | Size $${positionSize}`)

  return { triggered: true, position: { ...position, _lastPrice: undefined }, paperMode: state.paperMode }
}

// ─── Actualización de precio en tiempo real ─────────────────────────────────

function updatePrice(symbol, currentPrice) {
  if (!state.position || state.position.symbol !== symbol) return null

  state.position._lastPrice = currentPrice

  const pos = state.position
  const { direction, tp, entry, size, interval: posInterval, openTime } = pos
  const isLong = direction === 'LONG'

  // Break-even: cuando la ganancia supera BE_TRIGGER, mover SL a +BE_SL
  if (!pos.breakEvenTriggered) {
    const gainPct = isLong
      ? (currentPrice - entry) / entry
      : (entry - currentPrice) / entry
    if (gainPct >= BE_TRIGGER) {
      const newSl = isLong
        ? +(entry * (1 + BE_SL)).toFixed(2)
        : +(entry * (1 - BE_SL)).toFixed(2)
      pos.sl = newSl
      pos.breakEvenTriggered = true
      console.log(`[BOT] BREAK-EVEN ${symbol} — SL movido a ${newSl} (+${BE_SL * 100}%)`)
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
