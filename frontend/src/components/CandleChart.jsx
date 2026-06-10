import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'

const CHART_BG   = '#131722'
const GRID_COLOR = '#1e2130'
const TEXT_COLOR = '#b2b5be'

export default function CandleChart({ candles, indicators, sr }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !candles || candles.length === 0) return

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: TEXT_COLOR,
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      crosshair: { mode: CrosshairMode.Magnet },
      rightPriceScale: { borderColor: GRID_COLOR },
      timeScale: {
        borderColor: GRID_COLOR,
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: container.clientHeight,
    })

    // Velas
    const candleSeries = chart.addCandlestickSeries({
      upColor:      '#26a69a',
      downColor:    '#ef5350',
      borderVisible: false,
      wickUpColor:   '#26a69a',
      wickDownColor: '#ef5350',
    })
    candleSeries.setData(candles)

    // EMAs
    const emaConfigs = [
      { key: 'ema20',  color: '#2196F3', title: 'EMA 20'  },
      { key: 'ema50',  color: '#FF9800', title: 'EMA 50'  },
      { key: 'ema200', color: '#F44336', title: 'EMA 200' },
    ]
    for (const cfg of emaConfigs) {
      const d = indicators?.[cfg.key]
      if (d && d.length > 0) {
        const s = chart.addLineSeries({
          color: cfg.color,
          lineWidth: 1,
          title: cfg.title,
          priceLineVisible: false,
          lastValueVisible: true,
        })
        s.setData(d)
      }
    }

    // Líneas de soporte y resistencia
    if (sr) {
      for (const s of sr.supports) {
        candleSeries.createPriceLine({
          price: s.price,
          color: '#26a69a80',
          lineWidth: s.touches >= 4 ? 2 : 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `S ${s.touches}x`,
        })
      }
      for (const r of sr.resistances) {
        candleSeries.createPriceLine({
          price: r.price,
          color: '#ef535080',
          lineWidth: r.touches >= 4 ? 2 : 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `R ${r.touches}x`,
        })
      }
    }

    chart.timeScale().fitContent()
    chartRef.current = chart

    const observer = new ResizeObserver(() => {
      if (chartRef.current) {
        chartRef.current.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        })
      }
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [candles, indicators, sr])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
