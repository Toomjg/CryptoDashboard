import { useState } from 'react'
import { useMarketData } from './hooks/useMarketData'
import CandleChart from './components/CandleChart'
import RsiChart from './components/RsiChart'
import SignalPanel from './components/SignalPanel'
import NewsPanel from './components/NewsPanel'

const SYMBOLS   = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT']
const INTERVALS = [
  { value: '15m', label: '15m' },
  { value: '1h',  label: '1H'  },
  { value: '4h',  label: '4H'  },
  { value: '1d',  label: '1D'  },
]

// Mapeo overall → número 1-10 + color (para vista simple)
const SCORE_MAP = {
  VENTA_FUERTE:  { num: 1, color: '#b71c1c', label: 'VENTA FUERTE'  },
  VENTA:         { num: 2, color: '#ef5350', label: 'VENTA'         },
  VENTA_DEBIL:   { num: 2, color: '#ff9800', label: 'VENTA DÉBIL'   },
  NEUTRAL:       { num: 3, color: '#9e9e9e', label: 'NEUTRAL'       },
  COMPRA_DEBIL:  { num: 4, color: '#8bc34a', label: 'COMPRA DÉBIL'  },
  COMPRA:        { num: 4, color: '#4caf50', label: 'COMPRA'        },
  COMPRA_FUERTE: { num: 5, color: '#26a69a', label: 'COMPRA FUERTE' },
}

function fmt(n, decimals = 2) {
  if (n === undefined || n === null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function PriceHeader({ livePrice }) {
  if (!livePrice) return null
  const pos = livePrice.change >= 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#e2e8f0' }}>
        ${fmt(livePrice.price, livePrice.price > 100 ? 2 : 4)}
      </span>
      <span style={{
        fontSize: '1rem', fontWeight: 700,
        color: pos ? '#26a69a' : '#ef5350',
        background: (pos ? '#26a69a' : '#ef5350') + '20',
        padding: '2px 10px', borderRadius: 999,
      }}>
        {pos ? '+' : ''}{fmt(livePrice.change, 2)}%
      </span>
      <span style={{ fontSize: '0.8rem', color: '#718096' }}>
        H: ${fmt(livePrice.high)}  L: ${fmt(livePrice.low)}
      </span>
    </div>
  )
}

// Overlay compacto en esquina superior izquierda para vista simple
function ScoreOverlay({ signal }) {
  if (!signal) return null
  const cfg = SCORE_MAP[signal.overall] || SCORE_MAP.NEUTRAL
  return (
    <div style={{
      position: 'absolute', top: 10, left: 10, zIndex: 10,
      background: '#13172290', backdropFilter: 'blur(4px)',
      borderRadius: 8, padding: '5px 11px',
      border: `1px solid ${cfg.color}55`,
      display: 'flex', alignItems: 'center', gap: '7px',
      pointerEvents: 'none',
    }}>
      <span style={{
        fontSize: '1.6rem', fontWeight: 900, color: cfg.color,
        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
      }}>
        {cfg.num}
      </span>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: cfg.color }}>
        {cfg.label}
      </div>
    </div>
  )
}

export default function App() {
  const [symbol,   setSymbol]   = useState('BTCUSDT')
  const [interval, setInterval] = useState('1h')
  const [view,     setView]     = useState('completo')
  const { data, loading, error, livePrice } = useMarketData(symbol, interval)

  const lastUpdate = data
    ? new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : null

  // Trade box para vista simple: entrada + TP + SL calculados por la señal
  const tradeBox = (data?.signal?.target && data.signal.overall !== 'NEUTRAL')
    ? {
        entry:     data.candles[data.candles.length - 1].close,
        tp:        data.signal.target.tp,
        sl:        data.signal.target.sl,
        direction: data.signal.target.direction,
      }
    : null

  return (
    <div style={{ background: '#0d0f1a', minHeight: '100vh', color: '#e2e8f0', fontFamily: 'Segoe UI, sans-serif' }}>

      {/* ─── Navbar ─────────────────────────────────────────────────────── */}
      <div style={{
        background: '#131722', borderBottom: '1px solid #1e2130',
        padding: '0.7rem 1.5rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>

          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#2196F3' }}>
            Crypto Dashboard
          </span>

          {/* Toggle Simple / Completo */}
          <div style={{ display: 'flex', gap: 3, background: '#0d0f1a', borderRadius: 8, padding: 3 }}>
            {[
              { value: 'simple',   label: 'Simple'   },
              { value: 'completo', label: 'Completo' },
            ].map(v => (
              <button
                key={v.value}
                onClick={() => setView(v.value)}
                style={{
                  ...btnStyle,
                  background: view === v.value ? '#9c27b0' : 'transparent',
                  color:      view === v.value ? '#fff'    : '#718096',
                  padding: '4px 14px',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Symbol */}
          <select value={symbol} onChange={e => setSymbol(e.target.value)} style={selectStyle}>
            {SYMBOLS.map(s => <option key={s} value={s}>{s.replace('USDT', '/USDT')}</option>)}
          </select>

          {/* Interval */}
          <div style={{ display: 'flex', gap: 4 }}>
            {INTERVALS.map(iv => (
              <button
                key={iv.value}
                onClick={() => setInterval(iv.value)}
                style={{
                  ...btnStyle,
                  background: interval === iv.value ? '#2196F3' : '#1e2130',
                  color:      interval === iv.value ? '#fff'    : '#718096',
                }}
              >
                {iv.label}
              </button>
            ))}
          </div>
        </div>

        <PriceHeader livePrice={livePrice} />
      </div>

      {/* ─── Vista Simple ────────────────────────────────────────────────── */}
      {view === 'simple' && (
        <div style={{ padding: '0.75rem', height: 'calc(100vh - 56px)' }}>
          <div style={{
            position: 'relative', height: '100%',
            background: '#131722', borderRadius: 10,
            border: '1px solid #1e2130', overflow: 'hidden',
          }}>
            {loading && <Loader text="Cargando datos..." />}
            {error   && <ErrorMsg text={error} />}
            {!loading && !error && data && (
              <>
                <CandleChart
                  candles={data.candles}
                  indicators={data.indicators}
                  markers={data.markers}
                  interval={interval}
                  tradeBox={tradeBox}
                />
                <ScoreOverlay signal={data.signal} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Vista Completa ──────────────────────────────────────────────── */}
      {view === 'completo' && (
        <div style={{ padding: '0.75rem', height: 'calc(100vh - 56px)', display: 'flex', gap: '0.75rem' }}>

          {/* Columna de gráficos */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 0 }}>
            <div style={{ flex: 3, background: '#131722', borderRadius: 10, border: '1px solid #1e2130', overflow: 'hidden' }}>
              {loading && <Loader text="Cargando datos..." />}
              {error   && <ErrorMsg text={error} />}
              {!loading && !error && data && (
                <CandleChart
                  candles={data.candles}
                  indicators={data.indicators}
                  sr={data.signal.details.sr}
                  markers={data.markers}
                  interval={interval}
                />
              )}
            </div>

            <div style={{ flex: 2, background: '#131722', borderRadius: 10, border: '1px solid #1e2130', overflow: 'hidden' }}>
              {!loading && !error && data && (
                <RsiChart
                  rsiData={data.indicators.rsi}
                  macdData={data.indicators.macd}
                  macdSignalData={data.indicators.macdSignal}
                  macdHistogram={data.indicators.macdHistogram}
                />
              )}
            </div>
          </div>

          {/* Panel derecho */}
          <div style={{ width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto' }}>
            {!loading && !error && data && (
              <>
                <SignalPanel signal={data.signal} lastUpdate={lastUpdate} />
                <NewsPanel news={data.news} />
              </>
            )}
            {loading && (
              <div style={{
                background: '#131722', border: '1px solid #1e2130',
                borderRadius: 12, flex: 1, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: '#4a5568', fontSize: '0.85rem',
              }}>
                Cargando...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Loader({ text }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5568' }}>
      {text}
    </div>
  )
}

function ErrorMsg({ text }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef5350', fontSize: '0.9rem' }}>
      {text}
    </div>
  )
}

const selectStyle = {
  background: '#1e2130', border: '1px solid #2a2d3e', color: '#e2e8f0',
  padding: '5px 10px', borderRadius: 6, fontSize: '0.9rem', cursor: 'pointer',
}

const btnStyle = {
  border: 'none', borderRadius: 6, padding: '4px 12px',
  fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
}
