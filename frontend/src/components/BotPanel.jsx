import { useState, useEffect, useRef, useCallback } from 'react'

function fmt(n, d = 2) {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function timeSince(ts) {
  if (!ts) return '—'
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)    return `${s}s`
  if (s < 3600)  return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

const POLL_MS = 8000  // refresco del estado

// ─── Tarjeta de posición abierta ─────────────────────────────────────────────
function PositionCard({ pos, onClose }) {
  const isLong  = pos.direction === 'LONG'
  const pnl     = pos.livePnl
  const pnlColor = pnl ? (pnl.usd >= 0 ? '#26a69a' : '#ef5350') : '#718096'
  const tpPct    = ((Math.abs(pos.tp - pos.entry) / pos.entry) * 100).toFixed(2)
  const slRaw    = ((pos.sl - pos.entry) / pos.entry * 100)
  const slPct    = Math.abs(slRaw).toFixed(2)
  const slAbove  = slRaw > 0  // true cuando el SL está por encima de entrada (break-even activo)

  // Progreso hacia TP/SL
  let progress = 0
  if (pnl) {
    const range = Math.abs(pos.tp - pos.entry)
    const move  = Math.abs((pnl.price ?? pos.entry) - pos.entry)
    progress = range > 0 ? Math.min((move / range) * 100, 100) : 0
  }
  const progressColor = pnl && pnl.usd >= 0 ? '#26a69a' : '#ef5350'

  return (
    <div style={{
      background: '#1a1d2e', border: `1px solid ${isLong ? '#26a69a' : '#ef5350'}44`,
      borderRadius: 10, padding: '14px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            background: isLong ? '#26a69a22' : '#ef535022',
            color: isLong ? '#26a69a' : '#ef5350',
            border: `1px solid ${isLong ? '#26a69a' : '#ef5350'}`,
            borderRadius: 4, padding: '1px 8px', fontSize: '0.7rem', fontWeight: 700,
          }}>
            {isLong ? '▲ LONG' : '▼ SHORT'}
          </span>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.9rem' }}>{pos.symbol}</span>
          {pos.paperMode && (
            <span style={{ background: '#2196F322', color: '#2196F3', border: '1px solid #2196F3', borderRadius: 4, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700 }}>
              PAPER
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {pos.breakEvenTriggered && (
            <span style={{ background: '#26a69a22', color: '#26a69a', border: '1px solid #26a69a', borderRadius: 4, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700 }}>
              BE ✓
            </span>
          )}
          <span style={{ color: '#4a5568', fontSize: '0.72rem' }}>{timeSince(pos.openTime)} atrás</span>
        </div>
      </div>

      {/* Precios */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
        {[
          { label: 'ENTRADA', value: pos.entry,    color: '#e2e8f0' },
          { label: `TP (+${tpPct}%)`, value: pos.tp, color: '#26a69a' },
          { label: `SL (${slAbove ? '+' : '-'}${slPct}%)`, value: pos.sl, color: slAbove ? '#26a69a' : '#ef5350' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#0d0f1a', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ color: '#4a5568', fontSize: '0.6rem', fontWeight: 600, marginBottom: 2 }}>{label}</div>
            <div style={{ color, fontWeight: 700, fontSize: '0.82rem' }}>${fmt(value, value > 100 ? 2 : 4)}</div>
          </div>
        ))}
      </div>

      {/* Barra de progreso hacia TP/SL */}
      <div style={{ background: '#0d0f1a', borderRadius: 4, height: 5, marginBottom: 6, overflow: 'hidden' }}>
        <div style={{
          width: `${progress}%`, height: '100%',
          background: progressColor, borderRadius: 4,
          transition: 'width 0.5s ease',
        }} />
      </div>

      {/* Barra de tiempo máximo del trade */}
      {pnl?.timeout && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ color: '#4a5568', fontSize: '0.6rem', fontWeight: 600 }}>TIEMPO MÁXIMO</span>
            <span style={{
              color: pnl.timeout.pct > 80 ? '#ef5350' : '#4a5568',
              fontSize: '0.6rem', fontWeight: 600,
            }}>
              {pnl.timeout.label} restantes
            </span>
          </div>
          <div style={{ background: '#0d0f1a', borderRadius: 4, height: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${pnl.timeout.pct}%`, height: '100%',
              background: pnl.timeout.pct > 80 ? '#ef5350' : '#4a5568',
              borderRadius: 4, transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {/* P&L en vivo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#4a5568', fontSize: '0.65rem', marginBottom: 2 }}>P&L ACTUAL</div>
          <div style={{ color: pnlColor, fontWeight: 800, fontSize: '1.1rem' }}>
            {pnl ? `${pnl.usd >= 0 ? '+' : ''}$${fmt(pnl.usd)}` : '—'}
            {pnl && <span style={{ fontSize: '0.75rem', marginLeft: 5 }}>({pnl.pct >= 0 ? '+' : ''}{fmt(pnl.pct)}%)</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#4a5568', fontSize: '0.65rem', marginBottom: 2 }}>TAMAÑO</div>
          <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.9rem' }}>${fmt(pos.size)}</div>
        </div>
      </div>

      <button
        onClick={onClose}
        style={{
          width: '100%', marginTop: 10,
          background: '#ef535015', border: '1px solid #ef535055',
          color: '#ef5350', borderRadius: 6, padding: '6px 0',
          fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
        }}
      >
        Cerrar posición manualmente
      </button>
    </div>
  )
}

// ─── Fila de trade en historial ───────────────────────────────────────────────
function TradeRow({ t }) {
  const isWin  = t.outcome === 'WIN' || t.outcome === 'BE'
  const isLoss = t.outcome === 'LOSS'
  const color  = isWin ? '#26a69a' : isLoss ? '#ef5350' : '#718096'

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 60px 70px 70px 55px',
      gap: 6, padding: '7px 10px',
      borderBottom: '1px solid #1e2130',
      fontSize: '0.75rem',
      background: isWin ? '#26a69a08' : isLoss ? '#ef535008' : 'transparent',
    }}>
      <div>
        <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{t.symbol}</span>
        <span style={{ color: '#718096', marginLeft: 6 }}>{t.interval}</span>
        <span style={{
          marginLeft: 6, padding: '0 4px', borderRadius: 3, fontSize: '0.65rem',
          background: t.direction === 'LONG' ? '#26a69a22' : '#ef535022',
          color: t.direction === 'LONG' ? '#26a69a' : '#ef5350',
        }}>
          {t.direction}
        </span>
        {t.paperMode && (
          <span style={{ marginLeft: 4, padding: '0 4px', borderRadius: 3, fontSize: '0.62rem', background: '#2196F322', color: '#2196F3' }}>P</span>
        )}
      </div>
      <div style={{ color: '#718096', textAlign: 'right' }}>${fmt(t.entry, t.entry > 100 ? 0 : 4)}</div>
      <div style={{ color: '#718096', textAlign: 'right' }}>${fmt(t.exitPrice, t.exitPrice > 100 ? 0 : 4)}</div>
      <div style={{ color, fontWeight: 700, textAlign: 'right' }}>
        {t.pnlUSD >= 0 ? '+' : ''}${fmt(t.pnlUSD)}
      </div>
      <div style={{
        color, fontWeight: 700, textAlign: 'center',
        background: color + '22', borderRadius: 4, padding: '1px 4px',
      }}>
        {t.outcome === 'WIN' ? 'WIN' : t.outcome === 'BE' ? 'BE' : t.outcome === 'LOSS' ? 'LOSS' : t.outcome === 'TIMEOUT' ? 'TO' : 'CX'}
      </div>
    </div>
  )
}

// ─── Stat mini card ───────────────────────────────────────────────────────────
function Stat({ label, value, color = '#e2e8f0', sub }) {
  return (
    <div style={{ background: '#0d0f1a', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ color: '#4a5568', fontSize: '0.62rem', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontWeight: 800, fontSize: '1.05rem' }}>{value}</div>
      {sub && <div style={{ color: '#4a5568', fontSize: '0.65rem', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ─── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ value, onChange, colorOn = '#26a69a' }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
        background: value ? colorOn : '#2a2d3e',
        position: 'relative', transition: 'background 0.2s',
        border: `1px solid ${value ? colorOn : '#3a3d4e'}`,
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: 8, background: '#fff',
        position: 'absolute', top: 2,
        left: value ? 20 : 2,
        transition: 'left 0.2s',
      }} />
    </div>
  )
}

// ─── Panel principal ──────────────────────────────────────────────────────────
export default function BotPanel() {
  const [botState, setBotState] = useState(null)
  const [saving,   setSaving]   = useState(false)

  // Config local (se sincroniza con el backend)
  const [localCfg, setLocalCfg] = useState({
    capital:     100,
    riskPct:     5,
    interval:    '4h',
    minStrength: 3,
  })

  const pollRef = useRef(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch('/api/bot/status')
      const data = await res.json()
      setBotState(data)
      setLocalCfg(c => ({
        capital:     data.capital     ?? c.capital,
        riskPct:     data.riskPct     ?? c.riskPct,
        interval:    data.interval    ?? c.interval,
        minStrength: data.minStrength ?? c.minStrength,
      }))
    } catch {}
  }, [])

  useEffect(() => {
    fetchStatus()
    pollRef.current = setInterval(fetchStatus, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [fetchStatus])

  async function saveConfig(patch) {
    setSaving(true)
    try {
      const res  = await fetch('/api/bot/config', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      const data = await res.json()
      if (data.ok) setBotState(data.state)
    } finally {
      setSaving(false)
    }
  }

  async function closePosition() {
    if (!window.confirm('¿Cerrar la posición abierta manualmente?')) return
    try {
      await fetch('/api/bot/position', { method: 'DELETE' })
      await fetchStatus()
    } catch {}
  }

  if (!botState) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#4a5568' }}>
        Cargando...
      </div>
    )
  }

  const { enabled, paperMode, capital, startCapital, stats, position, trades } = botState
  const pnlColor = stats.totalPnl >= 0 ? '#26a69a' : '#ef5350'

  return (
    <div style={{
      height: '100%', overflowY: 'auto', padding: '16px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>

      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '1.1rem' }}>Bot de Trading</div>
          <div style={{ color: '#4a5568', fontSize: '0.75rem', marginTop: 2 }}>
            Paper trading simulado — sin dinero real
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: enabled ? '#26a69a' : '#4a5568', fontSize: '0.8rem', fontWeight: 600 }}>
            {enabled ? 'ACTIVO' : 'INACTIVO'}
          </span>
          <Toggle
            value={enabled}
            onChange={v => saveConfig({ enabled: v })}
            colorOn='#26a69a'
          />
        </div>
      </div>

      {/* ─── Modo Paper / Real ─────────────────────────────────────── */}
      <div style={{
        background: '#1a1d2e', border: '1px solid #2a2d3e',
        borderRadius: 10, padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600 }}>Modo</span>
          <div style={{ display: 'flex', background: '#0d0f1a', borderRadius: 6, overflow: 'hidden' }}>
            {['Paper', 'Real'].map(m => (
              <button
                key={m}
                onClick={() => m === 'Real'
                  ? window.confirm('⚠️ El modo real ejecuta órdenes con dinero real en Binance. ¿Continuar?') && saveConfig({ paperMode: false })
                  : saveConfig({ paperMode: true })
                }
                style={{
                  border: 'none', padding: '4px 16px', fontSize: '0.78rem', fontWeight: 700,
                  cursor: 'pointer',
                  background: (paperMode && m === 'Paper') || (!paperMode && m === 'Real')
                    ? (m === 'Paper' ? '#2196F3' : '#ef5350') : 'transparent',
                  color: (paperMode && m === 'Paper') || (!paperMode && m === 'Real') ? '#fff' : '#4a5568',
                }}
              >
                {m === 'Real' ? '⚡ Real' : '📄 Paper'}
              </button>
            ))}
          </div>
        </div>
        {!paperMode && (
          <div style={{ color: '#ef5350', fontSize: '0.72rem', background: '#ef535015', padding: '6px 10px', borderRadius: 6 }}>
            Modo real activo. Se requieren BINANCE_API_KEY y BINANCE_API_SECRET configurados en Railway.
          </div>
        )}
      </div>

      {/* ─── Configuración ─────────────────────────────────────────── */}
      <div style={{
        background: '#1a1d2e', border: '1px solid #2a2d3e',
        borderRadius: 10, padding: '12px 14px',
      }}>
        <div style={{ color: '#718096', fontSize: '0.72rem', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          Configuración
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={labelStyle}>
            Capital (USD)
            <input
              type='number' min='1' max='100000'
              value={localCfg.capital}
              onChange={e => setLocalCfg(c => ({ ...c, capital: +e.target.value }))}
              onBlur={() => saveConfig({ capital: localCfg.capital })}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Riesgo por trade (%)
            <input
              type='number' min='0.5' max='100' step='0.5'
              value={localCfg.riskPct}
              onChange={e => setLocalCfg(c => ({ ...c, riskPct: +e.target.value }))}
              onBlur={() => saveConfig({ riskPct: localCfg.riskPct })}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Temporalidad
            <select
              value={localCfg.interval}
              onChange={e => { setLocalCfg(c => ({ ...c, interval: e.target.value })); saveConfig({ interval: e.target.value }) }}
              style={inputStyle}
            >
              {['5m','15m','1h','4h','1d'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>

          <label style={labelStyle}>
            Magnitud mínima
            <select
              value={localCfg.minStrength}
              onChange={e => { setLocalCfg(c => ({ ...c, minStrength: +e.target.value })); saveConfig({ minStrength: +e.target.value }) }}
              style={inputStyle}
            >
              {[1,2,3,4,5].map(v => <option key={v} value={v}>{v} – {['Muy baja','Baja','Media','Alta','Muy alta'][v-1]}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* ─── Stats ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <Stat label='CAPITAL' value={`$${fmt(capital)}`} color='#e2e8f0' sub={`inicio $${fmt(startCapital)}`} />
        <Stat
          label='P&L TOTAL'
          value={`${stats.totalPnl >= 0 ? '+' : ''}$${fmt(stats.totalPnl)}`}
          color={pnlColor}
          sub={`${stats.totalPnlPct >= 0 ? '+' : ''}${fmt(stats.totalPnlPct)}%`}
        />
        <Stat
          label='WIN RATE'
          value={stats.winRate !== null ? `${fmt(stats.winRate)}%` : '—'}
          color={stats.winRate !== null ? (stats.winRate >= 40 ? '#26a69a' : '#ef5350') : '#718096'}
          sub={`${stats.wins}W / ${stats.losses}L (${stats.totalTrades})`}
        />
      </div>

      {/* ─── Posición abierta ──────────────────────────────────────── */}
      {position
        ? <PositionCard pos={position} onClose={closePosition} />
        : (
          <div style={{
            background: '#1a1d2e', border: '1px dashed #2a2d3e',
            borderRadius: 10, padding: '18px 14px', textAlign: 'center',
            color: '#4a5568', fontSize: '0.82rem',
          }}>
            {enabled
              ? `Sin posición abierta — esperando señal en ${localCfg.interval} (mag ≥${localCfg.minStrength})`
              : 'Bot inactivo — activalo para operar'}
          </div>
        )
      }

      {/* ─── Historial ─────────────────────────────────────────────── */}
      {trades && trades.length > 0 && (
        <div style={{ background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e2130', color: '#718096', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            Últimas {trades.length} operaciones
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 60px 70px 70px 55px',
            gap: 6, padding: '5px 10px 5px',
            color: '#4a5568', fontSize: '0.65rem', fontWeight: 700,
          }}>
            <span>PAR</span>
            <span style={{ textAlign: 'right' }}>ENTRADA</span>
            <span style={{ textAlign: 'right' }}>SALIDA</span>
            <span style={{ textAlign: 'right' }}>P&L</span>
            <span style={{ textAlign: 'center' }}>RES</span>
          </div>
          {trades.map(t => <TradeRow key={t.id} t={t} />)}
        </div>
      )}

      {saving && (
        <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.72rem' }}>
          Guardando...
        </div>
      )}
    </div>
  )
}

const labelStyle = {
  display: 'flex', flexDirection: 'column', gap: 5,
  color: '#718096', fontSize: '0.72rem', fontWeight: 600,
}

const inputStyle = {
  background: '#0d0f1a', border: '1px solid #2a2d3e',
  color: '#e2e8f0', padding: '6px 10px', borderRadius: 6,
  fontSize: '0.85rem',
}
