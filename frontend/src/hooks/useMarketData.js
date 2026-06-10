import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

export function useMarketData(symbol, interval) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [livePrice, setLivePrice] = useState(null)
  const wsRef    = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      try {
        setLoading(true)
        setError(null)
        const { data: d } = await axios.get(`/api/market/candles?symbol=${symbol}&interval=${interval}`)
        if (!cancelled) {
          setData(d)
          setLivePrice(d.ticker)
        }
      } catch {
        if (!cancelled) setError('Error al cargar datos de Binance')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()

    // Refresca cada 60 segundos
    timerRef.current = setInterval(() => {
      if (!cancelled) fetchData()
    }, 60000)

    return () => {
      cancelled = true
      clearInterval(timerRef.current)
    }
  }, [symbol, interval])

  // WebSocket para precio en vivo
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
