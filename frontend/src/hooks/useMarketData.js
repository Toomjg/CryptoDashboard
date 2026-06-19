import { useState, useEffect, useRef } from 'react'
import { getKlines, getTicker } from '../services/binance'
import {
  ema, rsi, macd, volumeAvg,
  generateSignal, scoreToOverall,
  generateMarkers, getActiveSignal,
  toSeries, toHistogramSeries,
  RR_CONFIG,
} from '../services/indicators'

const HIGHER_TF = { '5m': '15m', '15m': '1h', '1h': '4h', '4h': '1d' }
const STRONG_SIGNALS = new Set(['COMPRA', 'COMPRA_FUERTE', 'VENTA', 'VENTA_FUERTE'])
const ALERT_DEBOUNCE_MS = {
  '5m':  45 * 60 * 1000,         // 45 min — scalp cierra rápido, permite re-entrada
  '15m': 90 * 60 * 1000,
  '1h':  2  * 60 * 60 * 1000,
  '4h':  4  * 60 * 60 * 1000,
  '1d':  8  * 60 * 60 * 1000,
}

async function fetchNews(symbol) {
  try {
    const res = await fetch(`/api/market/news?symbol=${symbol}`)
    if (!res.ok) return { score: 0, signal: 'NEUTRAL', news: [], available: false }
    return await res.json()
  } catch {
    return { score: 0, signal: 'NEUTRAL', news: [], available: false }
  }
}

// Alerta basada en el sistema de marcadores — mismo criterio que flechas y cuadro TP/SL.
// Dispara cuando hay un marcador fresco de magnitud ≥4 confirmado en la TF superior.
async function maybeAlert(symbol, interval, activeSignal, candles) {
  if (!activeSignal || activeSignal.magnitude < 3) return   // mag 3+ (bot puede filtrar por minStrength)
  if (activeSignal.isBounce) return                         // rebotes no se alertan (especulativos)

  const key       = `alert_${symbol}_${interval}`
  const lastAlert = localStorage.getItem(key)
  const debounce  = ALERT_DEBOUNCE_MS[interval] ?? ALERT_DEBOUNCE_MS['1h']
  if (lastAlert && Date.now() - parseInt(lastAlert) < debounce) return

  const higherTf = HIGHER_TF[interval]
  if (!higherTf) return

  try {
    // Verificar en TF superior con el mismo sistema de marcadores
    const higherCandles = await getKlines(symbol, higherTf, 500)
    const higherMarkers = generateMarkers(higherCandles, higherTf)
    const higherSignal  = getActiveSignal(higherCandles, higherMarkers, higherTf)

    // La TF superior debe confirmar la misma dirección (cualquier magnitud)
    if (!higherSignal || higherSignal.isLong !== activeSignal.isLong) return

    // TP/SL con R/R dinámico según temporalidad
    const entry  = candles[candles.length - 2].close
    const sigAtr = activeSignal.atr
    const isLong = activeSignal.isLong
    const rr     = RR_CONFIG[interval] || { tp: 2.0, sl: 1.0 }
    const tp = sigAtr ? +(entry + (isLong ? 1 : -1) * sigAtr * rr.tp).toFixed(2) : null
    const sl = sigAtr ? +(entry + (isLong ? -1 : 1) * sigAtr * rr.sl).toFixed(2) : null

    const res    = await fetch('/api/market/alert', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol, interval,
        overall:      activeSignal.overall,
        score:        activeSignal.magnitude,
        strength:     String(activeSignal.magnitude),
        entry, tp, sl, rr: rr.tp, fromAtr: true,
        higherTf,
        higherOverall: higherSignal.overall,
      }),
    })
    const result = await res.json().catch(() => ({}))

    // Solo debouncea si algo funcionó — evita bloquear 4h cuando el bot estaba
    // mal configurado o desactivado al momento de la señal
    if (result.ok || result.bot?.triggered) {
      localStorage.setItem(key, String(Date.now()))
    }
  } catch {
    // Error al enviar alerta — no bloquear la UI
  }
}

function buildData(candles, ticker, newsData, interval) {
  const closes  = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)
  const times   = candles.map(c => c.time)

  const ema20v  = ema(closes, 20)
  const ema50v  = ema(closes, 50)
  const ema200v = ema(closes, 200)
  const rsiV    = rsi(closes, 14)
  const { macdLine, signalLine, histogram } = macd(closes)
  const volAvgV = volumeAvg(volumes, 20)

  // Score compuesto — solo para el panel "Completo" con desglose de indicadores
  const compositeSignal = generateSignal(candles.slice(0, -1))
  compositeSignal.score   += newsData.score
  compositeSignal.maxScore = 13
  compositeSignal.overall  = scoreToOverall(compositeSignal.score)
  compositeSignal.details.noticias = {
    score: newsData.score, signal: newsData.signal, available: newsData.available,
  }

  const markers      = generateMarkers(candles, interval)
  // Señal activa unificada — fuente de verdad para overlay, cuadro TP/SL y alertas
  const activeSignal = getActiveSignal(candles, markers, interval)

  // Para el panel Completo seguimos exponiendo el score compuesto en signal.details
  const signal = {
    ...(activeSignal
      ? {
          overall:   activeSignal.overall,
          magnitude: activeSignal.magnitude,
          direction: activeSignal.direction,
          isBounce:  activeSignal.isBounce ?? false,
          target: activeSignal.atr
            ? { direction: activeSignal.direction, atr: activeSignal.atr }
            : null,
        }
      : { overall: 'NEUTRAL', magnitude: 0, target: null, isBounce: false }),
    score:    compositeSignal.score,
    maxScore: compositeSignal.maxScore,
    details:  compositeSignal.details,
  }

  return {
    ticker, candles, markers,
    activeSignal,  // expuesto para maybeAlert y tradeBox
    indicators: {
      ema20:         toSeries(ema20v,  times),
      ema50:         toSeries(ema50v,  times),
      ema200:        toSeries(ema200v, times),
      rsi:           toSeries(rsiV,    times),
      macd:          toSeries(macdLine,    times),
      macdSignal:    toSeries(signalLine,  times),
      macdHistogram: toHistogramSeries(histogram, times),
      volumeAvg:     toSeries(volAvgV, times),
    },
    signal,
    news: newsData,
  }
}

export function useMarketData(symbol, interval) {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [livePrice, setLivePrice] = useState(null)
  const wsRef    = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const [candles, ticker, newsData] = await Promise.all([
          getKlines(symbol, interval, 500),
          getTicker(symbol),
          fetchNews(symbol),
        ])
        if (!cancelled) {
          const built = buildData(candles, ticker, newsData, interval)
          setData(built)
          setLivePrice(ticker)
          // Alerta Telegram basada en el mismo sistema de marcadores que las flechas
          maybeAlert(symbol, interval, built.activeSignal, candles)
        }
      } catch (e) {
        if (!cancelled) setError('Error al cargar datos de Binance')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    timerRef.current = setInterval(() => { if (!cancelled) load() }, 60000)

    return () => {
      cancelled = true
      clearInterval(timerRef.current)
    }
  }, [symbol, interval])

  // WebSocket precio en vivo + precio tick al bot (cada 5s)
  useEffect(() => {
    if (wsRef.current) wsRef.current.close()
    let lastTick = 0
    const ws = new WebSocket(
      `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`
    )
    wsRef.current = ws
    ws.onmessage = e => {
      const t     = JSON.parse(e.data)
      const price = parseFloat(t.c)
      setLivePrice({
        price,
        change: parseFloat(t.P),
        high:   parseFloat(t.h),
        low:    parseFloat(t.l),
        volume: parseFloat(t.q),
      })
      const now = Date.now()
      if (now - lastTick > 5000) {
        lastTick = now
        fetch('/api/bot/tick', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ symbol, price }),
        }).catch(() => {})
      }
    }
    return () => ws.close()
  }, [symbol])

  return { data, loading, error, livePrice }
}
