const { getKlines, getTicker } = require('./binance')
const { ema, rsi, macd, volumeAvg } = require('./indicators')
const trader = require('./trader')
const { sendSignalAlert } = require('./telegram')

// ─── ATR (no está en indicators.js del backend) ───────────────────────────────
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

// ─── Estrategia 5m: EMA 9/21 crossover (igual que frontend) ──────────────────
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

    markers.push({
      time:    candles[i].time,
      isLong:  freshBull,
      text:    String(strength),
      bounce:  isBounce,
    })
    lastIdx = i
  }

  return markers.slice(-60)
}

// ─── Estrategia general: MACD crossover (15m+) ───────────────────────────────
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

    if (freshBull) {
      if (r !== null && r >= 65) continue
      if (e50 !== null && e200 !== null && close < e50 && close < e200) continue
    }
    if (freshBear) {
      if (r !== null && r <= 35) continue
      if (e50 !== null && e200 !== null && close > e50 && close > e200) continue
    }

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

    markers.push({
      time:   candles[i].time,
      isLong: freshBull,
      text:   String(strength),
      bounce: false,
    })
    lastIdx = i
  }

  return markers.slice(-60)
}

// ─── Señal activa: marcador en las últimas 8 velas cerradas ──────────────────
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

// ─── Debounce en memoria ──────────────────────────────────────────────────────
const DEBOUNCE_MS = {
  '5m':  45 * 60 * 1000,
  '15m': 90 * 60 * 1000,
  '1h':  2  * 3600 * 1000,
  '4h':  4  * 3600 * 1000,
  '1d':  8  * 3600 * 1000,
}
const lastFired = {}

function isDebounced(key, interval) {
  const t = lastFired[key]
  return t && (Date.now() - t) < (DEBOUNCE_MS[interval] || DEBOUNCE_MS['1h'])
}

// ─── Confirmación TF superior: alineación de tendencia (EMA20/50) ─────────────
// Más estable que buscar un cruce de MACD en el TF superior, que raramente
// coincide en tiempo con un cruce EMA 9/21 en 5m.
function isTrendAligned(candles, isLong) {
  const closes = candles.map(c => c.close)
  const n      = closes.length - 1
  const ema20v = ema(closes, 20)
  const ema50v = ema(closes, 50)
  const e20 = ema20v[n], e50 = ema50v[n], price = closes[n]
  if (e20 === null) return true   // sin suficientes datos, no bloquear
  // LONG: precio sobre EMA20 o EMA20 sobre EMA50
  if (isLong)  return price > e20 || (e50 !== null && e20 > e50)
  // SHORT: precio bajo EMA20 o EMA20 bajo EMA50
  return price < e20 || (e50 !== null && e20 < e50)
}

// ─── TF superior ─────────────────────────────────────────────────────────────
const HIGHER_TF = { '5m': '15m', '15m': '1h', '1h': '4h', '4h': '1d' }

// ─── Estado del último scan (para diagnóstico) ────────────────────────────────
let lastScan = { time: null, result: 'sin datos', detail: null }
function getLastScan() { return lastScan }

// ─── Poll principal ───────────────────────────────────────────────────────────
async function poll() {
  const state = trader.getState()
  if (!state.enabled) {
    lastScan = { time: new Date().toISOString(), result: 'bot desactivado', detail: null }
    return
  }

  const { interval, minStrength } = state
  const symbol = 'BTCUSDT'

  try {
    // 1. Actualizar precio para detectar TP / SL / timeout
    const ticker = await getTicker(symbol)
    const closed = trader.updatePrice(symbol, ticker.price)
    if (closed) {
      console.log(`[SCANNER] Trade cerrado: ${closed.outcome} ${closed.symbol} P&L $${closed.pnlUSD}`)
      sendSignalAlert({ ...closed, isClose: true }).catch(() => {})
    }

    // 2. No buscar nuevas señales si hay posición abierta
    if (trader.getState().position) {
      lastScan = { time: new Date().toISOString(), result: 'posición abierta — esperando cierre', detail: { price: ticker.price } }
      return
    }

    // 3. Velas + marcadores
    const candles = await getKlines(symbol, interval, 300)
    const markers = interval === '5m'
      ? generateMarkers5m(candles)
      : generateMarkersGeneral(candles)
    const active = getActiveSignal(candles, markers)

    if (!active) {
      lastScan = { time: new Date().toISOString(), result: 'sin señal activa', detail: { price: ticker.price, markersTotal: markers.length } }
      return
    }
    if (active.magnitude < minStrength) {
      lastScan = { time: new Date().toISOString(), result: `señal mag=${active.magnitude} < mínimo ${minStrength}`, detail: active }
      return
    }
    if (active.isBounce) {
      lastScan = { time: new Date().toISOString(), result: 'señal de rebote — ignorada', detail: active }
      return
    }

    // 4. Debounce
    const key = `${symbol}_${interval}`
    if (isDebounced(key, interval)) {
      lastScan = { time: new Date().toISOString(), result: 'debounce activo — señal ya enviada recientemente', detail: active }
      return
    }

    // 5. Confirmación TF superior por alineación de tendencia
    const higherTf = HIGHER_TF[interval]
    if (higherTf) {
      const hCandles = await getKlines(symbol, higherTf, 300)
      const aligned  = isTrendAligned(hCandles, active.isLong)
      if (!aligned) {
        lastScan = { time: new Date().toISOString(), result: `${higherTf} no confirma tendencia`, detail: active }
        console.log(`[SCANNER] ${symbol} ${interval} mag=${active.magnitude} — ${higherTf} tendencia en contra`)
        return
      }
    }

    // 6. Disparar señal al bot
    const entry  = candles[candles.length - 1].close
    const result = trader.processSignal({
      symbol, interval,
      overall:  active.overall,
      score:    active.magnitude,
      entry,
      strength: String(active.magnitude),
    })

    if (result.triggered) {
      lastFired[key] = Date.now()
      lastScan = { time: new Date().toISOString(), result: `TRADE ABIERTO ${active.direction} @ ${entry}`, detail: result.position }
      console.log(`[SCANNER] SEÑAL ${active.direction} ${symbol} ${interval} mag=${active.magnitude} @ ${entry}`)
      sendSignalAlert({
        symbol, interval,
        overall:       active.overall,
        score:         active.magnitude,
        entry,
        tp:            result.position.tp,
        sl:            result.position.sl,
        rr:            result.position.rr,
        higherTf,
        higherOverall: 'confirmado',
      }).catch(() => {})
    } else {
      lastScan = { time: new Date().toISOString(), result: `rechazado por trader: ${result.reason}`, detail: active }
      console.log(`[SCANNER] Señal rechazada — ${result.reason}`)
    }

  } catch (err) {
    lastScan = { time: new Date().toISOString(), result: `error: ${err.message}`, detail: null }
    console.error('[SCANNER] Error:', err.message)
  }
}

function start() {
  console.log('[SCANNER] Iniciando — poll cada 60s')
  poll()
  setInterval(poll, 60 * 1000)
}

module.exports = { start, getLastScan }
