import { useEffect, useRef, useMemo } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'
import { analyzeTrendlines } from '../services/trendlines'
import { ema, toSeries } from '../services/indicators'

const CHART_BG   = '#131722'
const GRID_COLOR = '#1e2130'
const TEXT_COLOR = '#b2b5be'

function fmt(n, d = 2) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function TrendlineCard({ tl, active }) {
  if (!tl) return null
  const isDesc = tl.type === 'DESCENDING'
  const color  = isDesc ? '#ef5350' : '#26a69a'
  const label  = isDesc ? '▼ BAJISTA' : '▲ ALCISTA'

  return (
    <div style={{
      background: '#13172295', backdropFilter: 'blur(4px)',
      border: `1px solid ${active ? color : color + '44'}`,
      borderRadius: 8, padding: '8px 12px', minWidth: 165,
    }}>
      <div style={{ color, fontSize: '0.7rem', fontWeight: 700, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
        TRENDLINE {label}
        {active && (
          <span style={{
            background: color + '25', border: `1px solid ${color}`,
            borderRadius: 4, padding: '0 5px', fontSize: '0.6rem',
          }}>
            ⚡ TOQUE
          </span>
        )}
      </div>
      <div style={{ color: '#e2e8f0', fontSize: '0.75rem', marginBottom: 3 }}>
        Valor actual: <b>${fmt(tl.currentValue)}</b>
      </div>
      <div style={{ color: '#718096', fontSize: '0.67rem', marginBottom: 2 }}>
        SL: ${fmt(tl.slLevel)}
      </div>
      {tl.touches.length > 0 && (
        <div style={{ color: '#718096', fontSize: '0.65rem' }}>
          Toques previos: {tl.touches.length}
        </div>
      )}
    </div>
  )
}

export default function TrendlineView({ candles }) {
  const containerRef = useRef(null)
  const analysis = useMemo(() => analyzeTrendlines(candles), [candles])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !candles || candles.length === 0) return

    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: CHART_BG }, textColor: TEXT_COLOR },
      grid:   { vertLines: { color: GRID_COLOR }, horzLines: { color: GRID_COLOR } },
      crosshair:        { mode: CrosshairMode.Magnet },
      rightPriceScale:  { borderColor: GRID_COLOR },
      timeScale:        { borderColor: GRID_COLOR, timeVisible: true, secondsVisible: false },
      width:  container.clientWidth,
      height: container.clientHeight,
    })

    // Velas
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a', downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    })
    candleSeries.setData(candles)

    // EMA 20
    const closes = candles.map(c => c.close)
    const times  = candles.map(c => c.time)
    const ema20Line = chart.addLineSeries({
      color: '#2196F3', lineWidth: 1,
      priceLineVisible: false, lastValueVisible: false,
    })
    ema20Line.setData(toSeries(ema(closes, 20), times))

    const allMarkers = []

    // Trendline bajista — rojo punteado
    const { descending, ascending } = analysis

    if (descending) {
      const line = chart.addLineSeries({
        color: '#ef5350', lineWidth: 2, lineStyle: LineStyle.Dashed,
        priceLineVisible: false, lastValueVisible: false,
      })
      line.setData(descending.linePoints)

      descending.pivots.forEach((p, idx) => {
        allMarkers.push({
          time: p.time, position: 'aboveBar',
          color: '#ef5350', shape: 'circle', size: 1,
          text: `H${idx + 1}`,
        })
      })
      descending.touches.forEach(t => {
        allMarkers.push({ time: t, position: 'aboveBar', color: '#ef535060', shape: 'arrowDown', size: 1, text: '' })
      })
    }

    // Trendline alcista — verde punteado
    if (ascending) {
      const line = chart.addLineSeries({
        color: '#26a69a', lineWidth: 2, lineStyle: LineStyle.Dashed,
        priceLineVisible: false, lastValueVisible: false,
      })
      line.setData(ascending.linePoints)

      ascending.pivots.forEach((p, idx) => {
        allMarkers.push({
          time: p.time, position: 'belowBar',
          color: '#26a69a', shape: 'circle', size: 1,
          text: `L${idx + 1}`,
        })
      })
      ascending.touches.forEach(t => {
        allMarkers.push({ time: t, position: 'belowBar', color: '#26a69a60', shape: 'arrowUp', size: 1, text: '' })
      })
    }

    if (allMarkers.length > 0) {
      candleSeries.setMarkers(allMarkers.sort((a, b) => a.time - b.time))
    }

    chart.timeScale().fitContent()

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight })
    })
    observer.observe(container)

    return () => { observer.disconnect(); chart.remove() }
  }, [candles, analysis])

  const { descending, ascending, signal } = analysis

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Overlay señal activa */}
      {signal && (
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 10,
          background: signal.direction === 'SHORT' ? '#ef535018' : '#26a69a18',
          border: `1px solid ${signal.direction === 'SHORT' ? '#ef5350' : '#26a69a'}`,
          borderRadius: 8, padding: '9px 14px',
          pointerEvents: 'none',
        }}>
          <div style={{
            color: signal.direction === 'SHORT' ? '#ef5350' : '#26a69a',
            fontWeight: 800, fontSize: '1rem', marginBottom: 5,
          }}>
            {signal.direction === 'SHORT' ? '▼ SHORT' : '▲ LONG'}
          </div>
          <div style={{ color: '#e2e8f0', fontSize: '0.75rem', marginBottom: 2 }}>
            Entrada: ${fmt(signal.entry)}
          </div>
          <div style={{ color: '#ef5350', fontSize: '0.72rem', marginBottom: 4 }}>
            SL: ${fmt(signal.sl)}
          </div>
          <div style={{ color: '#718096', fontSize: '0.63rem' }}>
            {signal.reason}
          </div>
        </div>
      )}

      {/* Cards de trendlines detectadas */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 10,
        display: 'flex', gap: 8, pointerEvents: 'none',
      }}>
        <TrendlineCard tl={descending} active={signal?.direction === 'SHORT'} />
        <TrendlineCard tl={ascending}  active={signal?.direction === 'LONG'} />
        {!descending && !ascending && (
          <div style={{
            background: '#13172295', backdropFilter: 'blur(4px)',
            border: '1px solid #2a2d3e', borderRadius: 8,
            padding: '8px 12px', color: '#4a5568', fontSize: '0.78rem',
          }}>
            Sin trendline válida — se necesitan 3 pivots confirmados
          </div>
        )}
      </div>
    </div>
  )
}
