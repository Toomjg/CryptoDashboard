import { useEffect, useRef } from 'react'
import { createChart, ColorType } from 'lightweight-charts'

const CHART_BG   = '#131722'
const GRID_COLOR = '#1e2130'
const TEXT_COLOR = '#b2b5be'

export default function RsiChart({ rsiData, macdData, macdSignalData, macdHistogram }) {
  const rsiRef  = useRef(null)
  const macdRef = useRef(null)

  useEffect(() => {
    const container = rsiRef.current
    if (!container || !rsiData || rsiData.length === 0) return

    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: CHART_BG }, textColor: TEXT_COLOR },
      grid: { vertLines: { color: GRID_COLOR }, horzLines: { color: GRID_COLOR } },
      rightPriceScale: { borderColor: GRID_COLOR, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: GRID_COLOR, timeVisible: true, secondsVisible: false },
      width: container.clientWidth,
      height: container.clientHeight,
    })

    const rsiLine = chart.addLineSeries({
      color: '#E91E63',
      lineWidth: 2,
      title: 'RSI 14',
      priceLineVisible: false,
    })
    rsiLine.setData(rsiData)

    // Niveles 70 y 30
    rsiLine.createPriceLine({ price: 70, color: '#ef535060', lineWidth: 1, lineStyle: 2, title: '70' })
    rsiLine.createPriceLine({ price: 30, color: '#26a69a60', lineWidth: 1, lineStyle: 2, title: '30' })
    rsiLine.createPriceLine({ price: 50, color: '#ffffff20', lineWidth: 1, lineStyle: 2, title: '50' })

    chart.timeScale().fitContent()

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight })
    })
    observer.observe(container)

    return () => { observer.disconnect(); chart.remove() }
  }, [rsiData])

  useEffect(() => {
    const container = macdRef.current
    if (!container || !macdData || macdData.length === 0) return

    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: CHART_BG }, textColor: TEXT_COLOR },
      grid: { vertLines: { color: GRID_COLOR }, horzLines: { color: GRID_COLOR } },
      rightPriceScale: { borderColor: GRID_COLOR },
      timeScale: { borderColor: GRID_COLOR, timeVisible: true, secondsVisible: false },
      width: container.clientWidth,
      height: container.clientHeight,
    })

    if (macdHistogram && macdHistogram.length > 0) {
      const hist = chart.addHistogramSeries({ priceLineVisible: false, title: 'Histograma' })
      hist.setData(macdHistogram)
    }

    const macdLine = chart.addLineSeries({ color: '#2196F3', lineWidth: 1, title: 'MACD', priceLineVisible: false })
    macdLine.setData(macdData)

    if (macdSignalData && macdSignalData.length > 0) {
      const sigLine = chart.addLineSeries({ color: '#FF9800', lineWidth: 1, title: 'Signal', priceLineVisible: false })
      sigLine.setData(macdSignalData)
    }

    chart.timeScale().fitContent()

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight })
    })
    observer.observe(container)

    return () => { observer.disconnect(); chart.remove() }
  }, [macdData, macdSignalData, macdHistogram])

  return (
    <>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: '0.7rem', color: '#718096', padding: '2px 8px' }}>RSI (14)</div>
          <div ref={rsiRef} style={{ width: '100%', height: 'calc(100% - 18px)' }} />
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: '0.7rem', color: '#718096', padding: '2px 8px' }}>MACD (12,26,9)</div>
          <div ref={macdRef} style={{ width: '100%', height: 'calc(100% - 18px)' }} />
        </div>
      </div>
    </>
  )
}
