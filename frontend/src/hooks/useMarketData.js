import { useState, useEffect, useRef } from 'react'
import { getKlines, getTicker } from '../services/binance'
import {
  ema, rsi, macd, volumeAvg,
  generateSignal, scoreToOverall,
  toSeries, toHistogramSeries,
} from '../services/indicators'

async function fetchNews(symbol) {
  try {
    const res = await fetch(`/api/market/news?symbol=${symbol}`)
    if (!res.ok) return { score: 0, signal: 'NEUTRAL', news: [], available: false }
    return await res.json()
  } catch {
    return { score: 0, signal: 'NEUTRAL', news: [], available: false }
  }
}

function buildData(candles, ticker, newsData) {
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

  // Integrar noticias al score
  signal.score   += newsData.score
  signal.maxScore = 11
  signal.overall  = scoreToOverall(signal.score)
  signal.details.noticias = {
    score: newsData.score, signal: newsData.signal, available: newsData.available,
  }

  return {
    ticker,
    candles,
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
          getKlines(symbol, interval, 300),
          getTicker(symbol),
          fetchNews(symbol),
        ])
        if (!cancelled) {
          setData(buildData(candles, ticker, newsData))
          setLivePrice(ticker)
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
