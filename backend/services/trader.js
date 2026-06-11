// Estado en memoria — persiste mientras Railway no reinicie el servicio
const state = {
  enabled:    false,
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
    livePnl = {
      pct:  +(pnlPct * 100).toFixed(2),
      usd:  +(pos.size * pnlPct).toFixed(2),
      price: pos._lastPrice,
    }
  }

  const closedTrades = state.trades
  const wins   = closedTrades.filter(t => t.outcome === 'WIN')
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

function processSignal({ symbol, interval, overall, score, entry, tp, sl, rr, strength }) {
  if (!state.enabled)                    return { triggered: false, reason: 'Bot desactivado' }
  if (interval !== state.interval)       return { triggered: false, reason: `Bot opera solo en ${state.interval}` }
  if (state.position)                    return { triggered: false, reason: 'Ya hay una posición abierta' }
  if (!tp || !sl)                        return { triggered: false, reason: 'Sin TP/SL definidos' }

  const numStrength = parseInt(strength || '0', 10)
  if (numStrength < state.minStrength)   return { triggered: false, reason: `Magnitud ${numStrength} < mínimo ${state.minStrength}` }

  const isLong = overall.includes('COMPRA')
  const slDist = isLong ? entry - sl : sl - entry
  const slPct  = slDist / entry
  if (slPct <= 0)                        return { triggered: false, reason: 'SL inválido' }

  // Tamaño de posición: arriesgar riskPct% del capital
  const riskUSD     = state.capital * state.riskPct / 100
  const positionSize = Math.min(+(riskUSD / slPct).toFixed(2), state.capital)

  const position = {
    id:        Date.now(),
    symbol, interval, overall,
    direction: isLong ? 'LONG' : 'SHORT',
    strength:  numStrength,
    entry:     +entry,
    tp:        +tp,
    sl:        +sl,
    rr:        rr ?? null,
    size:      positionSize,
    openTime:  Date.now(),
    paperMode: state.paperMode,
    _lastPrice: entry,
  }

  state.position = position
  console.log(`[BOT] ${state.paperMode ? 'PAPER' : 'REAL'} ${position.direction} ${symbol} @ ${entry} | TP ${tp} | SL ${sl} | Size $${positionSize}`)

  return { triggered: true, position: { ...position, _lastPrice: undefined }, paperMode: state.paperMode }
}

// ─── Actualización de precio en tiempo real ─────────────────────────────────

function updatePrice(symbol, currentPrice) {
  if (!state.position || state.position.symbol !== symbol) return null

  state.position._lastPrice = currentPrice

  const { direction, tp, sl, entry, size } = state.position
  const isLong = direction === 'LONG'

  let closed = false, outcome = null, exitPrice = currentPrice

  if (isLong) {
    if (currentPrice >= tp) { closed = true; outcome = 'WIN';  exitPrice = tp }
    if (currentPrice <= sl) { closed = true; outcome = 'LOSS'; exitPrice = sl }
  } else {
    if (currentPrice <= tp) { closed = true; outcome = 'WIN';  exitPrice = tp }
    if (currentPrice >= sl) { closed = true; outcome = 'LOSS'; exitPrice = sl }
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
