const { getKlines, getTicker } = require('./binance')
const { ema, rsi, macd, volumeAvg } = require('./indicators')
const trader = require('./trader')
const { sendSignalAlert } = require('./telegram')

// Timeframes superiores por intervalo de bot
const HTF_MAP = {
  '5m':  ['15m', '1h'],
  '15m': ['1h',  '4h'],
  '1h':  ['4h',  '1d'],
}

// ─── ATR ──────────────────────────────────────────────────────────────────────
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

// ─── Pivot detection (4 velas a cada lado) ───────────────────────────────────
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

// ─── Estructura de tendencia: HH+HL (bull) | LH+LL (bear) ────────────────────
function getTrendStructure(highs, lows, count = 3) {
  if (highs.length < count || lows.length < count) return 'neutral'
  const rH = highs.slice(-count), rL = lows.slice(-count)
  const bull = rH.every((h, i) => i === 0 || h.price > rH[i-1].price) &&
               rL.every((l, i) => i === 0 || l.price > rL[i-1].price)
  const bear = rH.every((h, i) => i === 0 || h.price < rH[i-1].price) &&
               rL.every((l, i) => i === 0 || l.price < rL[i-1].price)
  return bull ? 'bull' : bear ? 'bear' : 'neutral'
}

// ─── Contexto S/R en el mismo timeframe ──────────────────────────────────────
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
    longFriendly:  nearestSup && (currentPrice - nearestSup.price) < tol,
    shortFriendly: nearestRes && (nearestRes.price - currentPrice) < tol,
    longBlocked:   nearestRes && (nearestRes.price - currentPrice) < tol * 0.3,
    shortBlocked:  nearestSup && (currentPrice - nearestSup.price) < tol * 0.3,
  }
}

// ─── Fibonacci golden zone (0.382 – 0.618) ───────────────────────────────────
function getFiboContext(highs, lows, currentPrice, isLong) {
  if (!highs.length || !lows.length) return null

  if (isLong) {
    // Impuso alcista: last swing low → last swing high → pullback
    const lastHigh = highs[highs.length - 1]
    const prevLow  = lows.filter(l => l.i < lastHigh.i).at(-1)
    if (!prevLow) return null
    const range = lastHigh.price - prevLow.price
    if (range <= 0) return null
    const r382 = lastHigh.price - range * 0.382
    const r618 = lastHigh.price - range * 0.618
    return { swingHigh: lastHigh.price, swingLow: prevLow.price, r382, r618,
             inGoldenZone: currentPrice >= r618 && currentPrice <= r382 }
  } else {
    // Impulso bajista: last swing high → last swing low → pullback
    const lastLow  = lows[lows.length - 1]
    const prevHigh = highs.filter(h => h.i < lastLow.i).at(-1)
    if (!prevHigh) return null
    const range = prevHigh.price - lastLow.price
    if (range <= 0) return null
    const r382 = lastLow.price + range * 0.382
    const r618 = lastLow.price + range * 0.618
    return { swingHigh: prevHigh.price, swingLow: lastLow.price, r382, r618,
             inGoldenZone: currentPrice >= r382 && currentPrice <= r618 }
  }
}

// ─── Análisis de un timeframe superior ───────────────────────────────────────
async function analyzeHTF(symbol, interval, currentPrice) {
  try {
    const candles = await getKlines(symbol, interval, 200)
    const closes  = candles.map(c => c.close)
    const highs_  = candles.map(c => c.high)
    const lows_   = candles.map(c => c.low)

    const ema50v  = ema(closes, 50)
    const ema200v = ema(closes, 200)
    const ema50   = ema50v.filter(v => v !== null).at(-1)
    const ema200  = ema200v.filter(v => v !== null).at(-1)

    const atrVals = atr(highs_, lows_, closes)
    const atrNow  = atrVals.filter(v => v !== null).at(-1) || currentPrice * 0.01

    const pivots    = getPivots(candles)
    const structure = getTrendStructure(pivots.highs, pivots.lows)
    const sr        = getSRContext(pivots.highs, pivots.lows, currentPrice, atrNow)

    // Precio cerca de EMA50 = zona de pullback ideal
    const nearEMA50      = ema50  && Math.abs(currentPrice - ema50)  < atrNow * 1.5
    const priceAboveEMA50 = ema50  && currentPrice > ema50
    const priceAboveEMA200 = ema200 && currentPrice > ema200

    return { interval, structure, sr, ema50, ema200, nearEMA50, priceAboveEMA50, priceAboveEMA200, pivots, atrNow }
  } catch (err) {
    console.warn(`[HTF ${interval}] Error: ${err.message}`)
    return null
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

// ─── Divergencia RSI ─────────────────────────────────────────────────────────
// Retorna: +1 (confirma), -1 (diverge en contra), 0 (neutral)
function checkRSIDivergence(candles, pivots, isLong) {
  const rsiVals = rsi(candles.map(c => c.close), 14)
  const MIN_DIFF = 3  // diferencia mínima de RSI para considerar divergencia real

  if (isLong) {
    // Divergencia bajista en highs = señal LONG se debilita → -1
    // Confirmación alcista en highs → +1
    const lastHighs = pivots.highs.slice(-2)
    if (lastHighs.length >= 2) {
      const [h1, h2] = lastHighs
      const r1 = rsiVals[h1.i], r2 = rsiVals[h2.i]
      if (r1 && r2 && h2.price > h1.price && r2 < r1 - MIN_DIFF) return -1  // div bajista
      if (r1 && r2 && h2.price > h1.price && r2 > r1 + MIN_DIFF) return  1  // confirmación
    }
    // Divergencia alcista en lows = señal LONG se fortalece → +1
    const lastLows = pivots.lows.slice(-2)
    if (lastLows.length >= 2) {
      const [l1, l2] = lastLows
      const r1 = rsiVals[l1.i], r2 = rsiVals[l2.i]
      if (r1 && r2 && l2.price < l1.price && r2 > r1 + MIN_DIFF) return  1  // div alcista
      if (r1 && r2 && l2.price < l1.price && r2 < r1 - MIN_DIFF) return -1  // confirmación bajista
    }
  } else {
    // SHORT: divergencia alcista en lows = señal SHORT se debilita → -1
    const lastLows = pivots.lows.slice(-2)
    if (lastLows.length >= 2) {
      const [l1, l2] = lastLows
      const r1 = rsiVals[l1.i], r2 = rsiVals[l2.i]
      if (r1 && r2 && l2.price < l1.price && r2 > r1 + MIN_DIFF) return -1  // div alcista
      if (r1 && r2 && l2.price < l1.price && r2 < r1 - MIN_DIFF) return  1  // confirmación bajista
    }
    // Divergencia bajista en highs = señal SHORT se fortalece → +1
    const lastHighs = pivots.highs.slice(-2)
    if (lastHighs.length >= 2) {
      const [h1, h2] = lastHighs
      const r1 = rsiVals[h1.i], r2 = rsiVals[h2.i]
      if (r1 && r2 && h2.price > h1.price && r2 < r1 - MIN_DIFF) return  1  // div bajista
      if (r1 && r2 && h2.price > h1.price && r2 > r1 + MIN_DIFF) return -1  // confirmación alcista
    }
  }
  return 0
}

// ─── Score multi-timeframe ────────────────────────────────────────────────────
function adjustScore(baseScore, isLong, structure, sr, htfList) {
  let score = baseScore

  // Mismo TF
  if (structure === (isLong ? 'bull' : 'bear')) score += 1
  if (structure === (isLong ? 'bear' : 'bull')) score -= 1
  if (isLong ? sr.longFriendly  : sr.shortFriendly) score += 1
  if (isLong ? sr.longBlocked   : sr.shortBlocked)  score -= 2

  // HTF1 — peso medio
  const htf1 = htfList[0]
  if (htf1) {
    if (htf1.structure === (isLong ? 'bull' : 'bear')) score += 1
    if (htf1.structure === (isLong ? 'bear' : 'bull')) score -= 1
    // Cerca de EMA50 del HTF1 = zona ideal de pullback
    if (htf1.nearEMA50) score += 1
    // Precio del lado equivocado de EMA50 en HTF1
    if (isLong  && !htf1.priceAboveEMA50)  score -= 1
    if (!isLong && htf1.priceAboveEMA50)   score -= 1
  }

  // HTF2 — peso alto (timeframe más alto = más relevante)
  const htf2 = htfList[1]
  if (htf2) {
    if (htf2.structure === (isLong ? 'bull' : 'bear')) score += 2
    if (htf2.structure === (isLong ? 'bear' : 'bull')) score -= 2
    // EMA200 HTF2 como filtro de tendencia macro
    if (isLong  && htf2.priceAboveEMA200)  score += 1
    if (!isLong && !htf2.priceAboveEMA200) score += 1
  }

  return Math.max(1, Math.min(5, score))
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
    // Precio en vivo → actualizar TP/SL/timeout
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

    // Velas del intervalo del bot
    const candles = await getKlines(symbol, interval, 300)
    const markers = interval === '5m'
      ? generateMarkers5m(candles)
      : generateMarkersGeneral(candles)
    const active = getActiveSignal(candles, markers)

    if (!active) {
      lastScan[botId] = { time: new Date().toISOString(), result: 'sin señal activa', detail: { price: ticker.price, markersTotal: markers.length } }
      return
    }
    if (active.isBounce) {
      lastScan[botId] = { time: new Date().toISOString(), result: 'rebote ignorado', detail: active }
      return
    }

    // ── Contexto del mismo TF ─────────────────────────────────────────────────
    const h_ = candles.map(c => c.high)
    const l_ = candles.map(c => c.low)
    const c_ = candles.map(c => c.close)
    const atrVals   = atr(h_, l_, c_)
    const atrNow    = atrVals.filter(v => v !== null).at(-1) || (ticker.price * 0.01)
    const pivots    = getPivots(candles)
    const structure = getTrendStructure(pivots.highs, pivots.lows)
    const sr        = getSRContext(pivots.highs, pivots.lows, ticker.price, atrNow)

    // ── Análisis HTF en paralelo ───────────────────────────────────────────────
    const htfIntervals = HTF_MAP[interval] || []
    const htfResults   = await Promise.all(htfIntervals.map(tf => analyzeHTF(symbol, tf, ticker.price)))
    const [htf1, htf2] = htfResults

    // ── Fibonacci en HTF1 ─────────────────────────────────────────────────────
    const fibo = htf1 ? getFiboContext(htf1.pivots.highs, htf1.pivots.lows, ticker.price, active.isLong) : null

    // ── Divergencia RSI en el mismo TF ────────────────────────────────────────
    const rsiDiv = checkRSIDivergence(candles, pivots, active.isLong)

    // ── Ajuste de score ───────────────────────────────────────────────────────
    let score = adjustScore(active.magnitude, active.isLong, structure, sr, htfResults)
    if (fibo?.inGoldenZone) score = Math.min(5, score + 1)
    if (rsiDiv !== 0)       score = Math.max(1, Math.min(5, score + rsiDiv))

    // ── Tags para el historial ────────────────────────────────────────────────
    const tags = []
    if (structure === (active.isLong ? 'bull' : 'bear')) tags.push('struct_ok')
    if (htf1?.structure === (active.isLong ? 'bull' : 'bear')) tags.push(`${htfIntervals[0]}_ok`)
    if (htf2?.structure === (active.isLong ? 'bull' : 'bear')) tags.push(`${htfIntervals[1]}_ok`)
    if (htf1?.nearEMA50)       tags.push('ema50_pullback')
    if (fibo?.inGoldenZone)    tags.push('fibo_zone')
    if (rsiDiv > 0)            tags.push('rsi_confirm')
    if (rsiDiv < 0)            tags.push('rsi_div_warn')
    if (sr.longFriendly && active.isLong)   tags.push('near_support')
    if (sr.shortFriendly && !active.isLong) tags.push('near_resistance')

    // ── Log de contexto ───────────────────────────────────────────────────────
    const ctxParts = [
      `base:${structure}`,
      htf1 ? `${htfIntervals[0]}:${htf1.structure}${htf1.nearEMA50 ? '+EMA50' : ''}` : '',
      htf2 ? `${htfIntervals[1]}:${htf2.structure}` : '',
      fibo?.inGoldenZone ? 'FIBO✓' : '',
      rsiDiv > 0 ? 'RSI✓' : rsiDiv < 0 ? 'RSI⚠' : '',
    ].filter(Boolean)
    const ctxStr = ctxParts.join(' · ')

    if (score < minStrength) {
      lastScan[botId] = {
        time: new Date().toISOString(),
        result: `mag ${active.magnitude}→${score} < mínimo ${minStrength} [${ctxStr}]`,
        detail: { active, structure, htf1: htf1 ? { structure: htf1.structure, nearEMA50: htf1.nearEMA50 } : null, htf2: htf2 ? { structure: htf2.structure } : null, fibo }
      }
      return
    }

    // ── Abrir trade ───────────────────────────────────────────────────────────
    const entry  = candles[candles.length - 1].close
    const result = trader.processSignal(botId, {
      symbol, interval,
      overall:  active.overall,
      score,
      entry,
      strength: String(score),
      tags,
    })

    if (result.triggered) {
      lastScan[botId] = {
        time: new Date().toISOString(),
        result: `TRADE ${active.direction} @ ${entry} [${ctxStr}]`,
        detail: result.position
      }
      console.log(`[SCANNER ${botId}] SEÑAL ${active.direction} mag=${active.magnitude}→${score} @ ${entry} | ${ctxStr}`)
      sendSignalAlert({
        symbol, interval,
        overall:  active.overall,
        score,
        entry,
        tp:       result.position.tp,
        sl:       result.position.sl,
        rr:       result.position.rr,
        context:  ctxStr,
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
