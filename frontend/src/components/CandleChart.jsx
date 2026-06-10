import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'

const CHART_BG   = '#131722'
const GRID_COLOR = '#1e2130'
const TEXT_COLOR = '#b2b5be'

const EMA_CONFIGS = [
  { key: 'ema20',  color: '#2196F3', label: 'EMA 20'  },
  { key: 'ema50',  color: '#FF9800', label: 'EMA 50'  },
  { key: 'ema200', color: '#F44336', label: 'EMA 200' },
]

function lastVal(series) {
  if (!series) return null
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i]?.value != null) return series[i].value
  }
  return null
}

function fmtPrice(v) {
  if (v == null) return '—'
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 1)    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

export default function CandleChart({ candles, indicators, sr, markers }) {
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
      width:  container.clientWidth,
      height: container.clientHeight,
    })

    // Velas
    const candleSeries = chart.addCandlestickSeries({
      upColor:       '#26a69a',
      downColor:     '#ef5350',
      borderVisible: false,
      wickUpColor:   '#26a69a',
      wickDownColor: '#ef5350',
    })
    candleSeries.setData(candles)

    // EMAs — sin label en el eje de precios (se muestra en la leyenda overlay)
    for (const cfg of EMA_CONFIGS) {
      const d = indicators?.[cfg.key]
      if (d && d.length > 0) {
        const s = chart.addLineSeries({
          color:             cfg.color,
          lineWidth:         1,
          priceLineVisible:  false,
          lastValueVisible:  false,  // eliminado del eje de precios
        })
        s.setData(d)
      }
    }

    // Soporte y resistencia
    if (sr) {
      for (const s of sr.supports) {
        candleSeries.createPriceLine({
          price: s.price, color: '#26a69a80',
          lineWidth: s.touches >= 4 ? 2 : 1, lineStyle: 2,
          axisLabelVisible: true, title: `S ${s.touches}x`,
        })
      }
      for (const r of sr.resistances) {
        candleSeries.createPriceLine({
          price: r.price, color: '#ef535080',
          lineWidth: r.touches >= 4 ? 2 : 1, lineStyle: 2,
          axisLabelVisible: true, title: `R ${r.touches}x`,
        })
      }
    }

    // Marcadores de señal histórica
    if (markers && markers.length > 0) {
      const sorted = [...markers].sort((a, b) => a.time - b.time)
      candleSeries.setMarkers(sorted)
    }

    chart.timeScale().fitContent()
    chartRef.current = chart

    const observer = new ResizeObserver(() => {
      if (chartRef.current) {
        chartRef.current.applyOptions({
          width:  container.clientWidth,
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
  }, [candles, indicators, sr, markers])

  // Valores actuales de EMAs para la leyenda
  const emaValues = EMA_CONFIGS.map(cfg => ({
    ...cfg,
    val: lastVal(indicators?.[cfg.key]),
  }))

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Leyenda de EMAs — esquina superior derecha */}
      <div style={{
        position: 'absolute', top: 8, right: 8, zIndex: 10,
        background: '#13172292', backdropFilter: 'blur(4px)',
        borderRadius: 7, padding: '5px 10px',
        display: 'flex', flexDirection: 'column', gap: '3px',
        pointerEvents: 'none',
      }}>
        {emaValues.map(({ key, color, label, val }) => val != null && (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: 16, height: 2, background: color, borderRadius: 1, flexShrink: 0 }} />
            <span style={{ fontSize: '0.68rem', color: '#9e9e9e' }}>{label}</span>
            <span style={{ fontSize: '0.68rem', color, fontFamily: 'monospace' }}>
              {fmtPrice(val)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
