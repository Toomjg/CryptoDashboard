import { useState, useEffect, useRef } from 'react'
import { getKlines, getTicker } from '../services/binance'
import {
  ema, rsi, macd, volumeAvg,
  generateSignal, scoreToOverall,
  generateMarkers,
  toSeries, toHistogramSeries,
} from '../services/indicators'

const HIGHER_TF = { '15m': '1h', '1h': '4h', '4h': '1d' }
const STRONG_SIGNALS = new Set(['COMPRA', 'COMPRA_FUERTE', 'VENTA', 'VENTA_FUERTE'])
const ALERT_DEBOUNCE_MS = 4 * 60 * 60 * 1000 // 4 horas

async function fetchNews(symbol) {
  try {
    const res = await fetch(`/api/market/news?symbol=${symbol}`)
    if (!res.ok) return { score: 0, signal: 'NEUTRAL', news: [], available: false }
    return await res.json()
  } catch {
    return { score: 0, signal: 'NEUTRAL', news: [], available: false }
  }
}

async function maybeAlert(symbol, interval, signal, candles) {
  if (!STRONG_SIGNALS.has(signal.overall)) return

  // Debounce por par + temporalidad
  const key       = `alert_${symbol}_${interval}`
  const lastAlert = localStorage.getItem(key)
  if (lastAlert && Date.now() - parseInt(lastAlert) < ALERT_DEBOUNCE_MS) return

  // Verificar en la temporalidad superior
  const higherTf = HIGHER_TF[interval]
  if (!higherTf) return

  try {
    const higherCandles = await getKlines(symbol, higherTf, 300)
    const higherSignal  = generateSignal(higherCandles)
    const isBull        = signal.overall.includes('COMPRA')
    const higherConfirms = isBull
      ? higherSignal.overall === 'COMPRA' || higherSignal.overall === 'COMPRA_FUERTE'
      : higherSignal.overall === 'VENTA'  || higherSignal.overall === 'VENTA_FUERTE'
    if (!higherConfirms) return

    localStorage.setItem(key, String(Date.now()))

    const entry = candles[candles.length - 1].close
    await fetch('/api/market/alert', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol, interval,
        overall:      signal.overall,
        score:        signal.score,
        entry,
        tp:           signal.target?.tp   ?? null,
        sl:           signal.target?.sl   ?? null,
        rr:           signal.target?.rr   ?? null,
        fromAtr:      signal.target?.fromAtr ?? false,
        higherTf,
        higherOverall: higherSignal.overall,
      }),
    })
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

  const signal = generateSignal(candles)

  // Integrar sentimiento al score
  signal.score   += newsData.score
  signal.maxScore = 13
  signal.overall  = scoreToOverall(signal.score)
  signal.details.noticias = {
    score: newsData.score, signal: newsData.signal, available: newsData.available,
  }

  const markers = generateMarkers(candles, interval)

  return {
    ticker,
    candles,
    markers,
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
          // Verificar si hay señal fuerte confirmada en 2 TF → alerta Telegram
          maybeAlert(symbol, interval, built.signal, candles)
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

  // WebSocket precio en vivo
  useEffect(() => {
    if (wsRef.current) wsRef.current.close()
    const ws = new WebSocket(
      `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`
    )
    wsRef.current = ws
    ws.onmessage = e => {
      const t = JSON.parse(e.data)
      setLivePrice({
        price:  parseFloat(t.c),
        change: parseFloat(t.P),
        high:   parseFloat(t.h),
        low:    parseFloat(t.l),
        volume: parseFloat(t.q),
      })
    }
    return () => ws.close()
  }, [symbol])

  return { data, loading, error, livePrice }
}
