const RISK_CONFIG = {
  '5m':  { sl: 0.015, tp1: 0.015, tp2: 0.030, tp3: 0.045, beSl: 0.003 },
  '15m': { sl: 0.025, tp1: 0.025, tp2: 0.050, tp3: 0.075, beSl: 0.005 },
  '1h':  { sl: 0.040, tp1: 0.040, tp2: 0.080, tp3: 0.120, beSl: 0.008 },
  '4h':  { sl: 0.070, tp1: 0.070, tp2: 0.140, tp3: 0.210, beSl: 0.014 },
  '1d':  { sl: 0.100, tp1: 0.100, tp2: 0.200, tp3: 0.300, beSl: 0.020 },
}
// TP1=50% | TP2=30% | TP3=20% del tamaño original
const TP_ALLOC = { tp1: 0.50, tp2: 0.30, tp3: 0.20 }

function getRisk(interval) { return RISK_CONFIG[interval] || RISK_CONFIG['1h'] }

const INTERVAL_MS = {
  '5m': 5*60*1000, '15m': 15*60*1000, '1h': 60*60*1000,
  '4h': 4*60*60*1000, '1d': 24*60*60*1000, '1w': 7*24*60*60*1000,
}
const MAX_HOLD_CANDLES = { '5m': 48, '15m': 96, '1h': 72, '4h': 30, '1d': 15, '1w': 10 }
function getMaxHoldMs(interval) {
  return (INTERVAL_MS[interval] || INTERVAL_MS['15m']) * (MAX_HOLD_CANDLES[interval] || 15)
}

// ─── Bots disponibles ─────────────────────────────────────────────────────────
const BOT_IDS = ['5m', '15m', '1h']

function mkState(interval) {
  return {
    enabled: true, paperMode: true,
    capital: 100, startCapital: 100,
    riskPct: 5, interval, minStrength: 3,
    position: null, trades: [],
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
  const pos   = state.position
  let livePnl = null

  if (pos && pos._lastPrice) {
    const isLong        = pos.direction === 'LONG'
    const openPnlPct    = isLong
      ? (pos._lastPrice - pos.entry) / pos.entry
      : (pos.entry - pos._lastPrice) / pos.entry
    const unrealizedUSD = pos.remainingSize * openPnlPct
    const totalUSD      = +(pos.realizedPnl + unrealizedUSD).toFixed(2)

    const maxHoldMs = getMaxHoldMs(pos.interval)
    const elapsed   = Date.now() - pos.openTime
    const remaining = Math.max(0, maxHoldMs - elapsed)
    const rH = Math.floor(remaining / 3600000)
    const rM = Math.floor((remaining % 3600000) / 60000)

    livePnl = {
      pct:         +((totalUSD / pos.originalSize) * 100).toFixed(2),
      usd:         totalUSD,
      realizedUSD: pos.realizedPnl,
      price:       pos._lastPrice,
      timeout: {
        pct:   Math.min(100, Math.round(elapsed / maxHoldMs * 100)),
        label: rH > 0 ? `${rH}h ${rM}m` : `${rM}m`,
      },
    }
  }

  const wins     = state.trades.filter(t => t.outcome === 'WIN' || t.outcome === 'BE')
  const losses   = state.trades.filter(t => t.outcome === 'LOSS')
  const totalPnl = state.trades.reduce((s, t) => s + t.pnlUSD, 0)

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
function processSignal(botId, { symbol, interval, overall, score, entry, strength, tags = [] }) {
  const state = req(botId)
  if (!state.enabled)              return { triggered: false, reason: 'Bot desactivado' }
  if (interval !== state.interval) return { triggered: false, reason: `Bot opera en ${state.interval}` }
  if (state.position)              return { triggered: false, reason: 'Ya hay posición abierta' }

  const numStrength = parseInt(strength || '0', 10)
  if (numStrength < state.minStrength) return { triggered: false, reason: `Magnitud ${numStrength} < mínimo ${state.minStrength}` }

  const isLong = overall.includes('COMPRA')
  const risk   = getRisk(interval)
  const dir    = isLong ? 1 : -1

  const tp1 = +(entry * (1 + dir * risk.tp1)).toFixed(2)
  const tp2 = +(entry * (1 + dir * risk.tp2)).toFixed(2)
  const tp3 = +(entry * (1 + dir * risk.tp3)).toFixed(2)
  const sl  = +(entry * (1 - dir * risk.sl )).toFixed(2)

  const riskUSD  = state.capital * state.riskPct / 100
  const origSize = Math.min(+(riskUSD / risk.sl).toFixed(2), state.capital)

  const position = {
    id:           Date.now(),
    symbol, interval, overall,
    direction:    isLong ? 'LONG' : 'SHORT',
    strength:     numStrength,
    entry:        +entry,
    sl, tp1, tp2, tp3,
    tp:           tp3,                          // alias para código legacy
    rr:           +(risk.tp3 / risk.sl).toFixed(1),
    originalSize: origSize,
    remainingSize: origSize,
    size:         origSize,                     // alias para código legacy
    realizedPnl:  0,
    tp1Hit:       false,
    tp2Hit:       false,
    openTime:     Date.now(),
    paperMode:    state.paperMode,
    _lastPrice:   entry,
    breakEvenTriggered: false,
    tags,
  }

  state.position = position
  console.log(`[BOT ${botId}] ${state.paperMode ? 'PAPER' : 'REAL'} ${position.direction} ${symbol} @ ${entry} | TP1 ${tp1} TP2 ${tp2} TP3 ${tp3} | SL ${sl} | $${origSize}`)
  return { triggered: true, position: { ...position, _lastPrice: undefined }, paperMode: state.paperMode }
}

// ─── Precio en tiempo real ────────────────────────────────────────────────────
function updatePrice(botId, symbol, currentPrice) {
  const state = req(botId)
  if (!state.position || state.position.symbol !== symbol) return null

  state.position._lastPrice = currentPrice
  const pos    = state.position
  const isLong = pos.direction === 'LONG'
  const { entry, originalSize, openTime } = pos
  const risk   = getRisk(pos.interval)

  // ── TP1: cerrar 50% ────────────────────────────────────────────────────────
  if (!pos.tp1Hit) {
    const hit = isLong ? currentPrice >= pos.tp1 : currentPrice <= pos.tp1
    if (hit) {
      const closeSize = +(originalSize * TP_ALLOC.tp1).toFixed(2)
      const pnlPct    = isLong ? (pos.tp1 - entry) / entry : (entry - pos.tp1) / entry
      const pnlUSD    = +(closeSize * pnlPct).toFixed(2)
      pos.tp1Hit         = true
      pos.remainingSize  = +(pos.remainingSize - closeSize).toFixed(2)
      pos.realizedPnl    = +(pos.realizedPnl + pnlUSD).toFixed(2)
      state.capital      = +(state.capital + pnlUSD).toFixed(2)
      pos.sl = isLong
        ? +(entry * (1 + risk.beSl)).toFixed(2)
        : +(entry * (1 - risk.beSl)).toFixed(2)
      pos.breakEvenTriggered = true
      console.log(`[BOT ${botId}] TP1 50% @ ${pos.tp1} | +$${pnlUSD} | SL→BE ${pos.sl}`)
    }
  }

  // ── TP2: cerrar 30% ────────────────────────────────────────────────────────
  if (pos.tp1Hit && !pos.tp2Hit) {
    const hit = isLong ? currentPrice >= pos.tp2 : currentPrice <= pos.tp2
    if (hit) {
      const closeSize = +(originalSize * TP_ALLOC.tp2).toFixed(2)
      const pnlPct    = isLong ? (pos.tp2 - entry) / entry : (entry - pos.tp2) / entry
      const pnlUSD    = +(closeSize * pnlPct).toFixed(2)
      pos.tp2Hit        = true
      pos.remainingSize = +(pos.remainingSize - closeSize).toFixed(2)
      pos.realizedPnl   = +(pos.realizedPnl + pnlUSD).toFixed(2)
      state.capital     = +(state.capital + pnlUSD).toFixed(2)
      console.log(`[BOT ${botId}] TP2 30% @ ${pos.tp2} | +$${pnlUSD}`)
    }
  }

  // ── Cierre final: TP3, SL, timeout ────────────────────────────────────────
  const elapsed = Date.now() - openTime
  let closed = false, outcome = null, exitPrice = currentPrice

  if (elapsed > getMaxHoldMs(pos.interval)) {
    closed = true; outcome = 'TIMEOUT'
  } else if (isLong) {
    if (currentPrice >= pos.tp3) { closed = true; outcome = 'WIN';  exitPrice = pos.tp3 }
    if (currentPrice <= pos.sl)  { closed = true; outcome = pos.breakEvenTriggered ? 'BE' : 'LOSS'; exitPrice = pos.sl }
  } else {
    if (currentPrice <= pos.tp3) { closed = true; outcome = 'WIN';  exitPrice = pos.tp3 }
    if (currentPrice >= pos.sl)  { closed = true; outcome = pos.breakEvenTriggered ? 'BE' : 'LOSS'; exitPrice = pos.sl }
  }

  if (!closed) return null

  const finalPnlPct = isLong ? (exitPrice - entry) / entry : (entry - exitPrice) / entry
  const finalPnlUSD = +(pos.remainingSize * finalPnlPct).toFixed(2)
  const totalPnlUSD = +(pos.realizedPnl + finalPnlUSD).toFixed(2)

  const trade = {
    ...state.position, _lastPrice: undefined,
    exitPrice, outcome,
    pnlPct:    +((totalPnlUSD / originalSize) * 100).toFixed(2),
    pnlUSD:    totalPnlUSD,
    closeTime: Date.now(),
  }

  state.capital  = +(state.capital + finalPnlUSD).toFixed(2)
  state.trades.push(trade)
  state.position = null
  console.log(`[BOT ${botId}] CERRADO ${outcome} | P&L $${totalPnlUSD} (TP1:${pos.tp1Hit} TP2:${pos.tp2Hit}) | Capital $${state.capital}`)
  return trade
}

// ─── Cierre forzado ───────────────────────────────────────────────────────────
function forceClose(botId, price) {
  const state = req(botId)
  if (!state.position) return null

  const auto = updatePrice(botId, state.position.symbol, price)
  if (auto) return auto

  const pos    = state.position
  const isLong = pos.direction === 'LONG'
  const pnlPct = isLong ? (price - pos.entry) / pos.entry : (pos.entry - price) / pos.entry
  const finalPnlUSD = +(pos.remainingSize * pnlPct).toFixed(2)
  const totalPnlUSD = +(pos.realizedPnl + finalPnlUSD).toFixed(2)

  const trade = {
    ...pos, _lastPrice: undefined,
    exitPrice: price, outcome: 'MANUAL',
    pnlPct:    +((totalPnlUSD / pos.originalSize) * 100).toFixed(2),
    pnlUSD:    totalPnlUSD,
    closeTime: Date.now(),
  }
  state.capital  = +(state.capital + finalPnlUSD).toFixed(2)
  state.trades.push(trade)
  state.position = null
  return trade
}

module.exports = { BOT_IDS, getState, getAllStates, configure, processSignal, updatePrice, forceClose }
