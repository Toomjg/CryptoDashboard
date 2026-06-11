import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'

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
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 1)     return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

export default function CandleChart({ candles, indicators, sr, markers, tradeBox }) {
  const containerRef     = useRef(null)
  const chartRef         = useRef(null)
  const candleSeriesRef  = useRef(null)
  const tradeLinesRef    = useRef([])

  // ── Efecto principal: construye el gráfico ────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container || !candles || candles.length === 0) return

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor:  TEXT_COLOR,
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      crosshair: { mode: CrosshairMode.Magnet },
      rightPriceScale: { borderColor: GRID_COLOR },
      timeScale: {
        borderColor:    GRID_COLOR,
        timeVisible:    true,
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
    candleSeriesRef.current = candleSeries

    // EMAs
    for (const cfg of EMA_CONFIGS) {
      const d = indicators?.[cfg.key]
      if (d && d.length > 0) {
        const s = chart.addLineSeries({
          color:            cfg.color,
          lineWidth:        1,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        s.setData(d)
      }
    }

    // S/R
    if (sr) {
      for (const s of sr.supports) {
        candleSeries.createPriceLine({
          price: s.price, color: '#26a69a80',
          lineWidth: s.touches >= 4 ? 2 : 1, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, title: `S ${s.touches}x`,
        })
      }
      for (const r of sr.resistances) {
        candleSeries.createPriceLine({
          price: r.price, color: '#ef535080',
          lineWidth: r.touches >= 4 ? 2 : 1, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, title: `R ${r.touches}x`,
        })
      }
    }

    // Marcadores
    if (markers && markers.length > 0) {
      candleSeries.setMarkers([...markers].sort((a, b) => a.time - b.time))
    }

    chart.timeScale().fitContent()
    chartRef.current = chart

    // Resize
    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight })
    })
    observer.observe(container)

    return () => {
      tradeLinesRef.current = []
      candleSeriesRef.current = null
      observer.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [candles, indicators, sr, markers])

  // ── Price lines para trade box (sin reconstruir el gráfico) ──────────────
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!series) return

    // Limpiar líneas anteriores
    tradeLinesRef.current.forEach(line => {
      try { series.removePriceLine(line) } catch {}
    })
    tradeLinesRef.current = []

    if (!tradeBox) return

    const { entry, tp, sl, direction } = tradeBox
    const isLong   = direction === 'LONG'
    const profitClr = isLong ? '#26a69a' : '#ef5350'
    const lossClr   = isLong ? '#ef5350' : '#26a69a'

    tradeLinesRef.current = [
      series.createPriceLine({
        price: tp, color: profitClr, lineWidth: 2,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true,
        title: isLong ? '▲ TP' : '▼ TP',
      }),
      series.createPriceLine({
        price: entry, color: 'rgba(255,255,255,0.55)', lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true,
        title: isLong ? '▲ ENTRADA' : '▼ ENTRADA',
      }),
      series.createPriceLine({
        price: sl, color: lossClr, lineWidth: 2,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true,
        title: '✕ SL',
      }),
    ]
  }, [tradeBox])

  const emaValues = EMA_CONFIGS.map(cfg => ({
    ...cfg, val: lastVal(indicators?.[cfg.key]),
  }))

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Leyenda EMAs — esquina superior derecha */}
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
