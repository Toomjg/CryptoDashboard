const { getKlines, getTicker } = require('./binance')
const { ema, rsi, macd, volumeAvg } = require('./indicators')
const trader = require('./trader')
const { sendSignalAlert } = require('./telegram')

// ─── ATR ─────────────────────────────────────────────────────────────────────
function atr(highs, lows, closes, period = 14) {
  const n = closes.length
  const result = new Array(n).fill(null)
  if (n < period + 1) return result
  for (let i = 1; i < n; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    )
    if (i === period) {
      let sum = 0
      for (let j = 1; j <= period; j++)
        sum += Math.max(highs[j] - lows[j], Math.abs(highs[j] - closes[j-1]), Math.abs(lows[j] - closes[j-1]))
      result[period] = sum / period
    } else if (i > period && result[i - 1] !== null) {
      result[i] = (result[i - 1] * (period - 1) + tr) / period
    }
  }
  return result
}

// ─── Pivot detection ─────────────────────────────────────────────────────────
function getPivots(candles, lookback = 4) {
  const highs = [], lows = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true, isLow = true
    for (let j = 1; j <= lookback; j++) {
      if (candles[i-j].high >= candles[i].high || candles[i+j].high >= candles[i].high) isHigh = false
      if (candles[i-j].low  <= candles[i].low  || candles[i+j].low  <= candles[i].low ) isLow  = false
    }
    if (isHigh) highs.push({ i, price: candles[i].high })
    if (isLow)  lows.push({ i, price: candles[i].low  })
  }
  return { highs, lows }
}

// ─── Estructura: HH+HL (bull) | LH+LL (bear) ─────────────────────────────────
function getTrendStructure(highs, lows, count = 3) {
  if (highs.length < count || lows.length < count) return 'neutral'
  const rH = highs.slice(-count), rL = lows.slice(-count)
  const bull = rH.every((h, i) => i === 0 || h.price > rH[i-1].price) &&
               rL.every((l, i) => i === 0 || l.price > rL[i-1].price)
  const bear = rH.every((h, i) => i === 0 || h.price < rH[i-1].price) &&
               rL.every((l, i) => i === 0 || l.price < rL[i-1].price)
  return bull ? 'bull' : bear ? 'bear' : 'neutral'
}

// ─── Contexto S/R ─────────────────────────────────────────────────────────────
function getSRContext(highs, lows, currentPrice, atrVal) {
  const tol = atrVal * 1.5

  const nearestRes = highs
    .filter(p => p.price > currentPrice)
    .sort((a, b) => a.price - b.price)[0] || null
  const nearestSup = lows
    .filter(p => p.price < currentPrice)
    .sort((a, b) => b.price - a.price)[0] || null

  return {
    nearestRes,
    nearestSup,
    // Comprar cerca de soporte = bueno para LONG
    longFriendly:  nearestSup && (currentPrice - nearestSup.price) < tol,
    // Vender cerca de resistencia = bueno para SHORT
    shortFriendly: nearestRes && (nearestRes.price - currentPrice) < tol,
    // Resistencia muy encima = techo inmediato, malo para LONG
    longBlocked:   nearestRes && (nearestRes.price - currentPrice) < tol * 0.3,
    // Soporte muy abajo = piso inmediato, malo para SHORT
    shortBlocked:  nearestSup && (currentPrice - nearestSup.price) < tol * 0.3,
  }
}

// ─── Estrategia 5m: EMA 9/21 crossover ───────────────────────────────────────
function generateMarkers5m(candles) {
  const closes  = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)
  const ema9v   = ema(closes,   9)
  const ema21v  = ema(closes,  21)
  const ema20v  = ema(closes,  20)
  const ema50v  = ema(closes,  50)
  const ema200v = ema(closes, 200)
  const rsiV    = rsi(closes, 14)
  const volAvgV = volumeAvg(volumes, 20)

  const minGap = 6
  const markers = []
  let lastIdx = -minGap

  for (let i = 55; i < candles.length; i++) {
    const e9 = ema9v[i], e9p = ema9v[i - 1]
    const e21 = ema21v[i], e21p = ema21v[i - 1]
    if (e9 === null || e21 === null || e9p === null || e21p === null) continue
    if (i - lastIdx < minGap) continue

    const freshBull = e9p <= e21p && e9 > e21
    const freshBear = e9p >= e21p && e9 < e21
    if (!freshBull && !freshBear) continue

    const close = closes[i]
    const e20 = ema20v[i], e50 = ema50v[i], e200 = ema200v[i]
    const r = rsiV[i], va = volAvgV[i]

    let isBounce = false
    if (e200 !== null) {
      if (freshBull && close < e200) {
        if (r === null || r >= 28) continue
        isBounce = true
      } else if (freshBear && close > e200) {
        if (r === null || r <= 72) continue
        isBounce = true
      }
    }

    if (!isBounce) {
      if (freshBull && e20 !== null && e50 !== null && close < e20 && close < e50) continue
      if (freshBear && e20 !== null && e50 !== null && close > e20 && close > e50) continue
      if (r !== null && freshBull && r >= 70) continue
      if (r !== null && freshBear && r <= 30) continue
    }

    let strength = isBounce ? 2 : 1
    if (r !== null) {
      if (!isBounce) {
        if (freshBull && r <= 55) strength++
        if (freshBear && r >= 45) strength++
      } else {
        if (freshBull && r < 20) strength++
        if (freshBear && r > 80) strength++
      }
    }
    if (!isBounce && e20 !== null) {
      if (freshBull && close > e20) strength++
      if (freshBear && close < e20) strength++
    }
    if (!isBounce && e50 !== null) {
      if (freshBull && close > e50) strength++
      if (freshBear && close < e50) strength++
    }
    if (va !== null && volumes[i] > va * 1.3) strength++
    strength = Math.min(5, strength)
    if (strength < 3) { lastIdx = i; continue }

    markers.push({ time: candles[i].time, isLong: freshBull, text: String(strength), bounce: isBounce })
    lastIdx = i
  }
  return markers.slice(-60)
}

// ─── Estrategia general: MACD crossover (15m, 1h, 4h) ────────────────────────
function generateMarkersGeneral(candles) {
  const closes  = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)
  const ema50v  = ema(closes, 50)
  const ema200v = ema(closes, 200)
  const rsiV    = rsi(closes, 14)
  const { macdLine, signalLine } = macd(closes)
  const volAvgV = volumeAvg(volumes, 20)

  const minGap = 5
  const markers = []
  let lastIdx = -minGap

  for (let i = 55; i < candles.length; i++) {
    const ml = macdLine[i], ml0 = macdLine[i - 1]
    const sig = signalLine[i], sig0 = signalLine[i - 1]
    if (ml === null || sig === null || ml0 === null || sig0 === null) continue
    if (i - lastIdx < minGap) continue

    const freshBull = ml0 <= sig0 && ml > sig
    const freshBear = ml0 >= sig0 && ml < sig
    if (!freshBull && !freshBear) continue

    const close = closes[i]
    const e50 = ema50v[i], e200 = ema200v[i]
    const r = rsiV[i], va = volAvgV[i]

    if (freshBull && r !== null && r >= 65) continue
    if (freshBear && r !== null && r <= 35) continue
    if (freshBull && e50 !== null && e200 !== null && close < e50 && close < e200) continue
    if (freshBear && e50 !== null && e200 !== null && close > e50 && close > e200) continue

    let strength = 1
    if (r !== null) {
      if (freshBull && r <= 50) strength++
      if (freshBear && r >= 50) strength++
    }
    if (e50 !== null) {
      if (freshBull && close > e50) strength++
      if (freshBear && close < e50) strength++
    }
    if (e200 !== null) {
      if (freshBull && close > e200) strength++
      if (freshBear && close < e200) strength++
    }
    if (va !== null && volumes[i] > va * 1.5) strength++
    strength = Math.min(5, strength)
    if (strength < 3) { lastIdx = i; continue }

    markers.push({ time: candles[i].time, isLong: freshBull, text: String(strength), bounce: false })
    lastIdx = i
  }
  return markers.slice(-60)
}

// ─── Señal activa: marcador fresco en las últimas 8 velas cerradas ────────────
function getActiveSignal(candles, markers) {
  if (!markers || markers.length === 0) return null
  const freshTs = new Set(candles.slice(0, -1).slice(-8).map(c => c.time))

  for (let i = markers.length - 1; i >= 0; i--) {
    const m         = markers[i]
    const magnitude = parseInt(m.text, 10)
    if (!freshTs.has(m.time)) break
    if (magnitude < 3) return null

    const isLong   = m.isLong
    const isBounce = m.bounce === true
    const overall  = isBounce
      ? (isLong ? 'REBOTE_LARGO' : 'REBOTE_CORTO')
      : (magnitude >= 4
          ? (isLong ? 'COMPRA_FUERTE' : 'VENTA_FUERTE')
          : (isLong ? 'COMPRA'        : 'VENTA'))

    return { overall, magnitude, isLong, isBounce, direction: isLong ? 'LONG' : 'SHORT' }
  }
  return null
}

// ─── Estado del último scan por bot ──────────────────────────────────────────
const lastScan = Object.fromEntries(
  trader.BOT_IDS.map(id => [id, { time: null, result: 'sin datos', detail: null }])
)
function getLastScan() { return lastScan }

// ─── Poll de un bot ───────────────────────────────────────────────────────────
async function poll(botId) {
  const state = trader.getState(botId)
  if (!state.enabled) {
    lastScan[botId] = { time: new Date().toISOString(), result: 'bot desactivado' }
    return
  }

  const { interval, minStrength } = state
  const symbol = 'BTCUSDT'

  try {
    // Actualizar precio para TP / SL / timeout
    const ticker = await getTicker(symbol)
    const closed = trader.updatePrice(botId, symbol, ticker.price)
    if (closed) {
      console.log(`[SCANNER ${botId}] Cerrado ${closed.outcome} P&L $${closed.pnlUSD}`)
      sendSignalAlert({ ...closed, isClose: true }).catch(() => {})
    }

    if (trader.getState(botId).position) {
      lastScan[botId] = { time: new Date().toISOString(), result: 'posición abierta', detail: { price: ticker.price } }
      return
    }

    // Velas y señal
    const candles = await getKlines(symbol, interval, 300)
    const markers = interval === '5m'
      ? generateMarkers5m(candles)
      : generateMarkersGeneral(candles)
    const active  = getActiveSignal(candles, markers)

    if (!active) {
      lastScan[botId] = { time: new Date().toISOString(), result: 'sin señal activa', detail: { price: ticker.price, markersTotal: markers.length } }
      return
    }
    if (active.magnitude < minStrength) {
      lastScan[botId] = { time: new Date().toISOString(), result: `mag=${active.magnitude} < mínimo ${minStrength}`, detail: active }
      return
    }
    if (active.isBounce) {
      lastScan[botId] = { time: new Date().toISOString(), result: 'rebote ignorado', detail: active }
      return
    }

    // ── Ajuste de score por estructura de tendencia y S/R ─────────────────────
    const highs_ = candles.map(c => c.high)
    const lows_  = candles.map(c => c.low)
    const close_ = candles.map(c => c.close)
    const atrVals   = atr(highs_, lows_, close_)
    const atrNow    = atrVals.filter(v => v !== null).at(-1) || (ticker.price * 0.01)
    const pivots    = getPivots(candles)
    const structure = getTrendStructure(pivots.highs, pivots.lows)
    const sr        = getSRContext(pivots.highs, pivots.lows, ticker.price, atrNow)

    let score = active.magnitude
    if (active.isLong) {
      if (structure === 'bull') score += 1
      if (structure === 'bear') score -= 1
      if (sr.longFriendly)     score += 1
      if (sr.longBlocked)      score -= 2
    } else {
      if (structure === 'bear') score += 1
      if (structure === 'bull') score -= 1
      if (sr.shortFriendly)    score += 1
      if (sr.shortBlocked)     score -= 2
    }
    score = Math.max(1, Math.min(5, score))

    const structureInfo = `${structure.toUpperCase()} · sup=${sr.nearestSup ? sr.nearestSup.price.toFixed(0) : '—'} · res=${sr.nearestRes ? sr.nearestRes.price.toFixed(0) : '—'}`

    if (score < minStrength) {
      lastScan[botId] = {
        time: new Date().toISOString(),
        result: `mag ${active.magnitude}→${score} < mínimo ${minStrength} [${structureInfo}]`,
        detail: { active, structure, sr }
      }
      return
    }
    // ── ────────────────────────────────────────────────────────────────────────

    const entry  = candles[candles.length - 1].close
    const result = trader.processSignal(botId, {
      symbol, interval,
      overall:  active.overall,
      score,
      entry,
      strength: String(score),
    })

    if (result.triggered) {
      lastScan[botId] = { time: new Date().toISOString(), result: `TRADE ${active.direction} @ ${entry} [${structureInfo}]`, detail: result.position }
      console.log(`[SCANNER ${botId}] SEÑAL ${active.direction} mag=${active.magnitude}→${score} @ ${entry} | ${structureInfo}`)
      sendSignalAlert({
        symbol, interval,
        overall:  active.overall,
        score,
        entry,
        tp:       result.position.tp,
        sl:       result.position.sl,
        rr:       result.position.rr,
      }).catch(() => {})
    } else {
      lastScan[botId] = { time: new Date().toISOString(), result: `rechazado: ${result.reason}`, detail: active }
    }

  } catch (err) {
    lastScan[botId] = { time: new Date().toISOString(), result: `error: ${err.message}` }
    console.error(`[SCANNER ${botId}] Error:`, err.message)
  }
}

// ─── Arranque ─────────────────────────────────────────────────────────────────
function start() {
  console.log(`[SCANNER] Iniciando bots: ${trader.BOT_IDS.join(', ')} — poll cada 60s`)
  for (const botId of trader.BOT_IDS) {
    poll(botId)
    setInterval(() => poll(botId), 60 * 1000)
  }
}

module.exports = { start, getLastScan }
