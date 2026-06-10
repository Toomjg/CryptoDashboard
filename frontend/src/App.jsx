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

function fmt(n, decimals = 2) {
  if (n === undefined || n === null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function PriceHeader({ symbol, livePrice }) {
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

export default function App() {
  const [symbol,   setSymbol]   = useState('BTCUSDT')
  const [interval, setInterval] = useState('1h')
  const { data, loading, error, livePrice } = useMarketData(symbol, interval)

  const lastUpdate = data
    ? new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{ background: '#0d0f1a', minHeight: '100vh', color: '#e2e8f0', fontFamily: 'Segoe UI, sans-serif' }}>
      {/* Navbar */}
      <div style={{
        background: '#131722', borderBottom: '1px solid #1e2130',
        padding: '0.7rem 1.5rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#2196F3' }}>
            Crypto Dashboard
          </span>

          {/* Symbol selector */}
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            style={selectStyle}
          >
            {SYMBOLS.map(s => <option key={s} value={s}>{s.replace('USDT', '/USDT')}</option>)}
          </select>

          {/* Interval tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {INTERVALS.map(iv => (
              <button
                key={iv.value}
                onClick={() => setInterval(iv.value)}
                style={{
                  ...btnStyle,
                  background: interval === iv.value ? '#2196F3' : '#1e2130',
                  color: interval === iv.value ? '#fff' : '#718096',
                }}
              >
                {iv.label}
              </button>
            ))}
          </div>
        </div>

        <PriceHeader symbol={symbol} livePrice={livePrice} />
      </div>

      {/* Main content */}
      <div style={{ padding: '0.75rem', height: 'calc(100vh - 56px)', display: 'flex', gap: '0.75rem' }}>
        {/* Charts column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 0 }}>
          {/* Candle chart */}
          <div style={{ flex: 3, background: '#131722', borderRadius: 10, border: '1px solid #1e2130', overflow: 'hidden' }}>
            {loading && <Loader text="Cargando datos..." />}
            {error   && <ErrorMsg text={error} />}
            {!loading && !error && data && (
              <CandleChart candles={data.candles} indicators={data.indicators} />
            )}
          </div>

          {/* RSI + MACD */}
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

        {/* Panel derecho: señal + noticias */}
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
              color: '#4a5568', fontSize: '0.85rem'
            }}>
              Cargando...
            </div>
          )}
        </div>
      </div>
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
