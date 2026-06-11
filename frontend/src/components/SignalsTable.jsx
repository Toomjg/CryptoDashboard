import { useState, useEffect } from 'react'
import { getKlines } from '../services/binance'
import { generateSignal, scoreToOverall } from '../services/indicators'

const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT']

// Timeframes a escanear — de mayor a menor peso
const SCAN_TFS = [
  { value: '4h',  label: '4H',  weight: 3 },
  { value: '1h',  label: '1H',  weight: 2 },
  { value: '15m', label: '15m', weight: 1 },
]

const BULL_SIGNALS = new Set(['COMPRA_FUERTE', 'COMPRA'])
const BEAR_SIGNALS = new Set(['VENTA_FUERTE',  'VENTA'])

function fmtP(v) {
  if (v == null) return '—'
  if (v >= 10000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 1)     return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

function calcRR(entry, tp, sl, isBull) {
  const risk   = isBull ? entry - sl : sl - entry
  const reward = isBull ? tp - entry : entry - tp
  if (risk <= 0 || reward <= 0) return null
  return +(reward / risk).toFixed(2)
}

async function fetchConsensus(symbol) {
  try {
    // Fetch todos los TFs simultáneamente
    const tfResults = await Promise.all(
      SCAN_TFS.map(async ({ value }) => {
        const candles = await getKlines(symbol, value, 300)
        // Solo velas cerradas para señal estable
        const signal  = generateSignal(candles.slice(0, -1))
        return {
          interval: value,
          overall:  signal.overall,
          score:    signal.score,
          target:   signal.target,
          entry:    candles[candles.length - 1].close,
        }
      })
    )

    const bullTfs = tfResults.filter(r => BULL_SIGNALS.has(r.overall))
    const bearTfs = tfResults.filter(r => BEAR_SIGNALS.has(r.overall))

    // Requiere al menos 2 TFs en la misma dirección
    const isBull    = bullTfs.length >= 2
    const isBear    = bearTfs.length >= 2
    if (!isBull && !isBear) return { symbol, overall: 'NEUTRAL', ok: true }

    const confirmedTfs = isBull ? bullTfs : bearTfs

    // TP del TF de mayor peso (resistencia/soporte más importante)
    const highestTf = confirmedTfs[0]  // ya ordenado 4h > 1h > 15m
    // SL del TF de menor peso (stop más ajustado)
    const lowestTf  = confirmedTfs[confirmedTfs.length - 1]

    const entry = highestTf.entry
    const tp    = highestTf.target?.tp ?? null
    const sl    = lowestTf.target?.sl  ?? highestTf.target?.sl ?? null
    const rr    = (tp && sl) ? calcRR(entry, tp, sl, isBull) : null

    const confirmedCount = confirmedTfs.length
    const overall = isBull
      ? (confirmedCount === 3 ? 'COMPRA_FUERTE' : 'COMPRA')
      : (confirmedCount === 3 ? 'VENTA_FUERTE'  : 'VENTA')

    return {
      symbol, ok: true, overall,
      entry, tp, sl, rr,
      confirmedTfs: confirmedTfs.map(r => r.interval),
      // Para navegar al TF más relevante al hacer click
      bestInterval: highestTf.interval,
    }
  } catch {
    return { symbol, ok: false }
  }
}

const SIG_COLOR = {
  COMPRA_FUERTE: '#26a69a', COMPRA: '#4caf50',
  VENTA_FUERTE:  '#b71c1c', VENTA:  '#f44336',
  NEUTRAL:       '#718096',
}
const SIG_LABEL = {
  COMPRA_FUERTE: '▲▲ COMPRA FUERTE (3 TF)',
  COMPRA:        '▲ COMPRA (2 TF)',
  VENTA_FUERTE:  '▼▼ VENTA FUERTE (3 TF)',
  VENTA:         '▼ VENTA (2 TF)',
  NEUTRAL:       '— NEUTRAL',
}

const TF_COLOR = { '4h': '#9c27b0', '1h': '#2196F3', '15m': '#ff9800' }

export default function SignalsTable({ onSelectSymbol }) {
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)

  async function refresh() {
    setLoading(true)
    // Escanear todos los símbolos en paralelo
    const results = await Promise.all(SYMBOLS.map(fetchConsensus))

    // Solo mostrar señales confirmadas, ordenadas por fuerza
    const sorted = results
      .filter(r => r.ok && r.overall !== 'NEUTRAL')
      .sort((a, b) => {
        const order = { COMPRA_FUERTE: 4, VENTA_FUERTE: 3, COMPRA: 2, VENTA: 1 }
        return (order[b.overall] || 0) - (order[a.overall] || 0)
      })

    setRows(sorted)
    setUpdatedAt(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  return (
    <div style={{ padding: '1rem', height: '100%', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#e2e8f0' }}>
            Escáner multi-temporalidad
          </span>
          <div style={{ fontSize: '0.72rem', color: '#4a5568', marginTop: 2 }}>
            Solo señales confirmadas en 2 o 3 TF simultáneamente — basadas en velas cerradas
          </div>
        </div>
        <button onClick={refresh} style={{
          marginLeft: 'auto', border: 'none', borderRadius: 6,
          padding: '5px 14px', background: '#1e2130', color: '#718096',
          fontSize: '0.82rem', cursor: 'pointer',
        }}>
          ↻ Actualizar
        </button>
        {updatedAt && (
          <span style={{ fontSize: '0.72rem', color: '#4a5568' }}>
            Última actualización: {updatedAt}
          </span>
        )}
      </div>

      {/* Leyenda TF */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        {SCAN_TFS.map(tf => (
          <div key={tf.value} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: TF_COLOR[tf.value] }} />
            <span style={{ fontSize: '0.72rem', color: '#718096' }}>{tf.label}</span>
          </div>
        ))}
        <span style={{ fontSize: '0.72rem', color: '#4a5568', marginLeft: 8 }}>
          TP = nivel del TF mayor · SL = nivel del TF menor
        </span>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#4a5568' }}>
          Escaneando {SYMBOLS.length} pares en 3 temporalidades...
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '3rem',
          color: '#4a5568', fontSize: '0.85rem',
        }}>
          Sin señales confirmadas en este momento.<br />
          <span style={{ fontSize: '0.75rem' }}>
            Se requieren 2+ temporalidades alineadas con velas cerradas.
          </span>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map(row => {
            const color = SIG_COLOR[row.overall] || '#718096'
            const label = SIG_LABEL[row.overall] || row.overall
            return (
              <div
                key={row.symbol}
                onClick={() => onSelectSymbol?.(row.symbol, row.bestInterval)}
                style={{
                  background: '#1a1d2e',
                  border: `1px solid ${color}50`,
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 8, padding: '0.8rem 1rem',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#1e2235' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#1a1d2e' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>

                  {/* Par + precio */}
                  <div style={{ minWidth: 110 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#e2e8f0' }}>
                      {row.symbol.replace('USDT', '/USDT')}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#718096', fontFamily: 'monospace' }}>
                      {fmtP(row.entry)}
                    </div>
                  </div>

                  {/* Señal */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color }}>{label}</div>
                    {/* Badges TF confirmados */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {row.confirmedTfs.map(tf => (
                        <span key={tf} style={{
                          fontSize: '0.65rem', fontWeight: 700,
                          background: TF_COLOR[tf] + '30',
                          color: TF_COLOR[tf],
                          padding: '1px 7px', borderRadius: 4,
                          border: `1px solid ${TF_COLOR[tf]}60`,
                        }}>
                          {tf.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* TP */}
                  <div style={{ textAlign: 'right', minWidth: 80 }}>
                    <div style={{ fontSize: '0.65rem', color: '#4a5568' }}>Objetivo</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color, fontFamily: 'monospace' }}>
                      {fmtP(row.tp)}
                    </div>
                  </div>

                  {/* SL */}
                  <div style={{ textAlign: 'right', minWidth: 80 }}>
                    <div style={{ fontSize: '0.65rem', color: '#4a5568' }}>Stop</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ef5350', fontFamily: 'monospace' }}>
                      {fmtP(row.sl)}
                    </div>
                  </div>

                  {/* R/R */}
                  <div style={{ textAlign: 'right', minWidth: 50 }}>
                    <div style={{ fontSize: '0.65rem', color: '#4a5568' }}>R/R</div>
                    <div style={{
                      fontSize: '0.85rem', fontWeight: 800,
                      color: row.rr >= 2 ? '#26a69a' : row.rr >= 1.2 ? '#ff9800' : '#718096',
                    }}>
                      {row.rr ?? '—'}
                    </div>
                  </div>

                  {/* Flecha navegar */}
                  <div style={{ color: '#4a5568', fontSize: '0.9rem', marginLeft: 4 }}>›</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
