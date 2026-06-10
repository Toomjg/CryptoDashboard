import { useState, useEffect } from 'react'
import { getKlines } from '../services/binance'
import { generateSignal, scoreToOverall } from '../services/indicators'

const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT']
const INTERVALS = [
  { value: '15m', label: '15m' },
  { value: '1h',  label: '1H'  },
  { value: '4h',  label: '4H'  },
  { value: '1d',  label: '1D'  },
]

const SIG_COLOR = {
  COMPRA_FUERTE: '#26a69a', COMPRA: '#4caf50', COMPRA_DEBIL: '#8bc34a',
  NEUTRAL:       '#718096',
  VENTA_DEBIL:   '#ff9800', VENTA: '#f44336',  VENTA_FUERTE: '#b71c1c',
}
const SIG_LABEL = {
  COMPRA_FUERTE: '▲▲ COMPRA FUERTE', COMPRA: '▲ COMPRA', COMPRA_DEBIL: '△ COMPRA DÉBIL',
  NEUTRAL:       '— NEUTRAL',
  VENTA_DEBIL:   '▽ VENTA DÉBIL',   VENTA: '▼ VENTA',   VENTA_FUERTE: '▼▼ VENTA FUERTE',
}

function fmtP(v) {
  if (v == null) return '—'
  if (v >= 10000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 1)     return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

async function fetchSignal(symbol, interval) {
  try {
    const candles = await getKlines(symbol, interval, 300)
    const signal  = generateSignal(candles)
    const entry   = candles[candles.length - 1].close
    return { symbol, overall: signal.overall, score: signal.score, target: signal.target, entry, ok: true }
  } catch {
    return { symbol, ok: false }
  }
}

export default function SignalsTable({ onSelectSymbol }) {
  const [interval,  setInterval]  = useState('1h')
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)

  async function refresh(iv) {
    setLoading(true)
    const results = await Promise.all(SYMBOLS.map(s => fetchSignal(s, iv || interval)))
    // Ordenar: señales fuertes primero (por score absoluto)
    results.sort((a, b) => Math.abs(b.score || 0) - Math.abs(a.score || 0))
    setRows(results)
    setUpdatedAt(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }))
    setLoading(false)
  }

  useEffect(() => { refresh() }, [interval])

  return (
    <div style={{ padding: '1rem', height: '100%', overflowY: 'auto' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#e2e8f0' }}>
          Escáner de señales
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {INTERVALS.map(iv => (
            <button key={iv.value} onClick={() => setInterval(iv.value)} style={{
              border: 'none', borderRadius: 6, padding: '4px 12px',
              fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              background: interval === iv.value ? '#2196F3' : '#1e2130',
              color:      interval === iv.value ? '#fff'    : '#718096',
            }}>
              {iv.label}
            </button>
          ))}
        </div>
        <button onClick={() => refresh()} style={{
          border: 'none', borderRadius: 6, padding: '4px 12px',
          background: '#1e2130', color: '#718096',
          fontSize: '0.8rem', cursor: 'pointer',
        }}>
          ↻ Actualizar
        </button>
        {updatedAt && <span style={{ fontSize: '0.72rem', color: '#4a5568' }}>Última actualización: {updatedAt}</span>}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#4a5568' }}>
          Escaneando {SYMBOLS.length} pares...
        </div>
      )}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {rows.map(row => {
            if (!row.ok) return null
            const color = SIG_COLOR[row.overall] || '#718096'
            const label = SIG_LABEL[row.overall] || row.overall
            const isNeutral = row.overall === 'NEUTRAL'
            return (
              <div
                key={row.symbol}
                onClick={() => !isNeutral && onSelectSymbol?.(row.symbol)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 1fr 90px 90px 60px',
                  alignItems: 'center', gap: '0.75rem',
                  background: isNeutral ? '#131722' : '#1a1d2e',
                  border: `1px solid ${isNeutral ? '#1e2130' : color + '40'}`,
                  borderRadius: 8, padding: '0.65rem 1rem',
                  cursor: isNeutral ? 'default' : 'pointer',
                  opacity: isNeutral ? 0.6 : 1,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { if (!isNeutral) e.currentTarget.style.borderColor = color + '90' }}
                onMouseLeave={e => { if (!isNeutral) e.currentTarget.style.borderColor = color + '40' }}
              >
                {/* Par */}
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>
                    {row.symbol.replace('USDT', '/USDT')}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#718096', fontFamily: 'monospace' }}>
                    {fmtP(row.entry)}
                  </div>
                </div>

                {/* Señal */}
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color }}>
                  {label}
                </div>

                {/* TP */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.65rem', color: '#4a5568' }}>Objetivo</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: color, fontFamily: 'monospace' }}>
                    {row.target ? fmtP(row.target.tp) : '—'}
                  </div>
                </div>

                {/* SL */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.65rem', color: '#4a5568' }}>Stop</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef5350', fontFamily: 'monospace' }}>
                    {row.target ? fmtP(row.target.sl) : '—'}
                  </div>
                </div>

                {/* R/R */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.65rem', color: '#4a5568' }}>R/R</div>
                  <div style={{
                    fontSize: '0.8rem', fontWeight: 700,
                    color: row.target?.rr >= 2 ? '#26a69a' : row.target?.rr >= 1.2 ? '#ff9800' : '#718096',
                  }}>
                    {row.target?.rr ?? '—'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
