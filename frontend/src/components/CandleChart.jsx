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
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 1)     return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

// Dibuja el trade box verde/rojo sobre el canvas overlay
function drawTradeBox(chart, canvas, container, tradeBox) {
  const dpr = window.devicePixelRatio || 1
  const w   = container.clientWidth
  const h   = container.clientHeight

  canvas.width        = w * dpr
  canvas.height       = h * dpr
  canvas.style.width  = w + 'px'
  canvas.style.height = h + 'px'

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)

  if (!tradeBox) return

  const { entry, tp, sl, direction } = tradeBox
  const isLong = direction === 'LONG'

  try {
    const ps = chart.priceScale('right')
    const ts = chart.timeScale()

    const yEntry = ps.priceToCoordinate(entry)
    const yTp    = ps.priceToCoordinate(tp)
    const ySl    = ps.priceToCoordinate(sl)

    if (yEntry == null || yTp == null || ySl == null) return

    const rightScaleW = 65
    const xEnd        = w - rightScaleW

    // Usar xStart al ~65% del área para mostrar el cuadro en la zona derecha
    const xStart = Math.round(xEnd * 0.62)

    if (xStart >= xEnd) return

    // ── Zonas ─────────────────────────────────────────────────────────────
    const profitColor = isLong ? '#26a69a' : '#ef5350'
    const lossColor   = isLong ? '#ef5350' : '#26a69a'
    const yProfitTop  = isLong ? yTp    : yEntry
    const yProfitBot  = isLong ? yEntry : yTp
    const yLossTop    = isLong ? yEntry : ySl
    const yLossBot    = isLong ? ySl    : yEntry
    const bw          = xEnd - xStart

    // Fondo zona ganancia
    ctx.fillStyle = isLong ? 'rgba(38,166,154,0.18)' : 'rgba(239,83,80,0.18)'
    ctx.fillRect(xStart, yProfitTop, bw, yProfitBot - yProfitTop)
    ctx.strokeStyle = profitColor + 'bb'
    ctx.lineWidth   = 1
    ctx.strokeRect(xStart, yProfitTop, bw, yProfitBot - yProfitTop)

    // Fondo zona pérdida
    ctx.fillStyle = isLong ? 'rgba(239,83,80,0.18)' : 'rgba(38,166,154,0.18)'
    ctx.fillRect(xStart, yLossTop, bw, yLossBot - yLossTop)
    ctx.strokeStyle = lossColor + 'bb'
    ctx.lineWidth   = 1
    ctx.strokeRect(xStart, yLossTop, bw, yLossBot - yLossTop)

    // ── Línea de entrada ──────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth   = 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(xStart, yEntry)
    ctx.lineTo(xEnd,   yEntry)
    ctx.stroke()
    ctx.setLineDash([])

    // ── Etiquetas ─────────────────────────────────────────────────────────
    ctx.font      = 'bold 11px monospace'
    ctx.textAlign = 'left'
    const lx = xStart + 8

    function label(text, x, y, color) {
      const tw = ctx.measureText(text).width
      ctx.fillStyle = color + '30'
      ctx.fillRect(x - 3, y - 12, tw + 6, 15)
      ctx.fillStyle = color
      ctx.fillText(text, x, y)
    }

    label(`TP  $${fmtPrice(tp)}`, lx, yProfitTop + 14, profitColor)
    label(isLong ? '▲ COMPRA' : '▼ VENTA',   lx, yEntry  - 5, '#ffffff')
    label(`SL  $${fmtPrice(sl)}`, lx, yLossBot  - 5, lossColor)
  } catch (e) {
    // Falla silenciosa si el chart aún no está listo
  }
}

export default function CandleChart({ candles, indicators, sr, markers, tradeBox }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const canvasRef    = useRef(null)

  // tradeBoxRef se actualiza en cada render sin disparar el effect principal
  const tradeBoxRef  = useRef(tradeBox)
  tradeBoxRef.current = tradeBox

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

    // Marcadores
    if (markers && markers.length > 0) {
      candleSeries.setMarkers([...markers].sort((a, b) => a.time - b.time))
    }

    chart.timeScale().fitContent()
    chartRef.current = chart

    // ── Canvas overlay para trade box ─────────────────────────────────────
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:5;'
    container.parentElement.appendChild(canvas)
    canvasRef.current = canvas

    function redraw() {
      drawTradeBox(chart, canvas, container, tradeBoxRef.current)
    }

    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw)
    setTimeout(redraw, 200)
    setTimeout(redraw, 600)

    // Resize
    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight })
      setTimeout(redraw, 50)
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(redraw)
      if (canvas.parentElement) canvas.parentElement.removeChild(canvas)
      chart.remove()
      chartRef.current = null
      canvasRef.current = null
    }
  }, [candles, indicators, sr, markers])

  // ── Redibujar cuando cambia el tradeBox (sin rebuild del gráfico) ─────────
  useEffect(() => {
    if (chartRef.current && canvasRef.current && containerRef.current) {
      drawTradeBox(chartRef.current, canvasRef.current, containerRef.current, tradeBox)
    }
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
