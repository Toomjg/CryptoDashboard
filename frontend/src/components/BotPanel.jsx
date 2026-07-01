import { useState, useEffect, useRef, useCallback } from 'react'

function fmt(n, d = 2) {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function timeSince(ts) {
  if (!ts) return '—'
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)   return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

const POLL_MS = 8000

// ─── Posición abierta ─────────────────────────────────────────────────────────
function PositionCard({ pos, onClose }) {
  const isLong   = pos.direction === 'LONG'
  const pnl      = pos.livePnl
  const pnlColor = pnl ? (pnl.usd >= 0 ? '#26a69a' : '#ef5350') : '#718096'
  const tpPct    = ((Math.abs(pos.tp - pos.entry) / pos.entry) * 100).toFixed(2)
  const slRaw    = (pos.sl - pos.entry) / pos.entry * 100
  const slPct    = Math.abs(slRaw).toFixed(2)
  const slAbove  = slRaw > 0

  let progress = 0
  if (pnl) {
    const range = Math.abs(pos.tp - pos.entry)
    const move  = Math.abs((pnl.price ?? pos.entry) - pos.entry)
    progress = range > 0 ? Math.min((move / range) * 100, 100) : 0
  }

  return (
    <div style={{
      background: '#1a1d2e', border: `1px solid ${isLong ? '#26a69a' : '#ef5350'}44`,
      borderRadius: 10, padding: '12px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            background: isLong ? '#26a69a22' : '#ef535022',
            color: isLong ? '#26a69a' : '#ef5350',
            border: `1px solid ${isLong ? '#26a69a' : '#ef5350'}`,
            borderRadius: 4, padding: '1px 7px', fontSize: '0.68rem', fontWeight: 700,
          }}>
            {isLong ? '▲ LONG' : '▼ SHORT'}
          </span>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem' }}>{pos.symbol}</span>
          {pos.paperMode && (
            <span style={{ background: '#2196F322', color: '#2196F3', border: '1px solid #2196F3', borderRadius: 4, padding: '1px 5px', fontSize: '0.62rem', fontWeight: 700 }}>
              PAPER
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {pos.breakEvenTriggered && (
            <span style={{ background: '#26a69a22', color: '#26a69a', border: '1px solid #26a69a', borderRadius: 4, padding: '1px 5px', fontSize: '0.62rem', fontWeight: 700 }}>BE ✓</span>
          )}
          <span style={{ color: '#4a5568', fontSize: '0.68rem' }}>{timeSince(pos.openTime)} atrás</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 8 }}>
        {[
          { label: 'ENTRADA', value: pos.entry, color: '#e2e8f0' },
          { label: `TP +${tpPct}%`, value: pos.tp, color: '#26a69a' },
          { label: `SL ${slAbove ? '+' : '-'}${slPct}%`, value: pos.sl, color: slAbove ? '#26a69a' : '#ef5350' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#0d0f1a', borderRadius: 6, padding: '5px 6px', textAlign: 'center' }}>
            <div style={{ color: '#4a5568', fontSize: '0.58rem', fontWeight: 600, marginBottom: 2 }}>{label}</div>
            <div style={{ color, fontWeight: 700, fontSize: '0.78rem' }}>${fmt(value, value > 100 ? 2 : 4)}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#0d0f1a', borderRadius: 4, height: 4, marginBottom: 5, overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: pnl?.usd >= 0 ? '#26a69a' : '#ef5350', borderRadius: 4, transition: 'width 0.5s' }} />
      </div>

      {pnl?.timeout && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: '#4a5568', fontSize: '0.58rem', fontWeight: 600 }}>TIEMPO MÁX</span>
            <span style={{ color: pnl.timeout.pct > 80 ? '#ef5350' : '#4a5568', fontSize: '0.58rem', fontWeight: 600 }}>
              {pnl.timeout.label} restantes
            </span>
          </div>
          <div style={{ background: '#0d0f1a', borderRadius: 4, height: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pnl.timeout.pct}%`, height: '100%', background: pnl.timeout.pct > 80 ? '#ef5350' : '#4a5568', borderRadius: 4 }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#4a5568', fontSize: '0.6rem', marginBottom: 1 }}>P&L ACTUAL</div>
          <div style={{ color: pnlColor, fontWeight: 800, fontSize: '1rem' }}>
            {pnl ? `${pnl.usd >= 0 ? '+' : ''}$${fmt(pnl.usd)}` : '—'}
            {pnl && <span style={{ fontSize: '0.72rem', marginLeft: 4 }}>({pnl.pct >= 0 ? '+' : ''}{fmt(pnl.pct)}%)</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#4a5568', fontSize: '0.6rem', marginBottom: 1 }}>TAMAÑO</div>
          <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem' }}>${fmt(pos.size)}</div>
        </div>
      </div>

      <button onClick={onClose} style={{
        width: '100%', marginTop: 8,
        background: '#ef535015', border: '1px solid #ef535055',
        color: '#ef5350', borderRadius: 6, padding: '5px 0',
        fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
      }}>
        Cerrar manualmente
      </button>
    </div>
  )
}

function TradeRow({ t }) {
  const isWin  = t.outcome === 'WIN' || t.outcome === 'BE'
  const isLoss = t.outcome === 'LOSS'
  const color  = isWin ? '#26a69a' : isLoss ? '#ef5350' : '#718096'
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 55px 60px 60px 45px',
      gap: 4, padding: '6px 8px', borderBottom: '1px solid #1e2130',
      fontSize: '0.72rem', background: isWin ? '#26a69a08' : isLoss ? '#ef535008' : 'transparent',
    }}>
      <div>
        <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{t.symbol}</span>
        <span style={{ color: t.direction === 'LONG' ? '#26a69a' : '#ef5350', marginLeft: 5, fontSize: '0.62rem' }}>{t.direction}</span>
        {t.paperMode && <span style={{ marginLeft: 4, color: '#2196F3', fontSize: '0.6rem' }}>P</span>}
      </div>
      <div style={{ color: '#718096', textAlign: 'right' }}>${fmt(t.entry, t.entry > 100 ? 0 : 4)}</div>
      <div style={{ color: '#718096', textAlign: 'right' }}>${fmt(t.exitPrice, t.exitPrice > 100 ? 0 : 4)}</div>
      <div style={{ color, fontWeight: 700, textAlign: 'right' }}>{t.pnlUSD >= 0 ? '+' : ''}${fmt(t.pnlUSD)}</div>
      <div style={{ color, fontWeight: 700, textAlign: 'center', background: color + '22', borderRadius: 4, padding: '1px 3px' }}>
        {t.outcome === 'WIN' ? 'WIN' : t.outcome === 'BE' ? 'BE' : t.outcome === 'LOSS' ? 'LOSS' : t.outcome === 'TIMEOUT' ? 'TO' : 'CX'}
      </div>
    </div>
  )
}

function Stat({ label, value, color = '#e2e8f0', sub }) {
  return (
    <div style={{ background: '#0d0f1a', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ color: '#4a5568', fontSize: '0.58rem', fontWeight: 600, marginBottom: 3 }}>{label}</div>
      <div style={{ color, fontWeight: 800, fontSize: '0.95rem' }}>{value}</div>
      {sub && <div style={{ color: '#4a5568', fontSize: '0.6rem', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function Toggle({ value, onChange, colorOn = '#26a69a' }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width: 38, height: 20, borderRadius: 10, cursor: 'pointer',
      background: value ? colorOn : '#2a2d3e', position: 'relative',
      transition: 'background 0.2s', border: `1px solid ${value ? colorOn : '#3a3d4e'}`,
      flexShrink: 0,
    }}>
      <div style={{
        width: 14, height: 14, borderRadius: 7, background: '#fff',
        position: 'absolute', top: 2, left: value ? 20 : 2, transition: 'left 0.2s',
      }} />
    </div>
  )
}

// ─── Tarjeta de un bot ────────────────────────────────────────────────────────
function BotCard({ botId, label }) {
  const [botState, setBotState] = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [localCfg, setLocalCfg] = useState({ capital: 100, riskPct: 5, minStrength: 3 })
  const pollRef = useRef(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch(`/api/bot/${botId}/status`)
      const data = await res.json()
      setBotState(data)
      setLocalCfg(c => ({
        capital:     data.capital     ?? c.capital,
        riskPct:     data.riskPct     ?? c.riskPct,
        minStrength: data.minStrength ?? c.minStrength,
      }))
    } catch {}
  }, [botId])

  useEffect(() => {
    fetchStatus()
    pollRef.current = setInterval(fetchStatus, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [fetchStatus])

  async function saveConfig(patch) {
    setSaving(true)
    try {
      const res  = await fetch(`/api/bot/${botId}/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (data.ok) setBotState(data.state)
    } finally { setSaving(false) }
  }

  async function closePosition() {
    if (!window.confirm('¿Cerrar la posición manualmente?')) return
    try {
      await fetch(`/api/bot/${botId}/position`, { method: 'DELETE' })
      await fetchStatus()
    } catch {}
  }

  if (!botState) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#4a5568', fontSize: '0.85rem' }}>
      Cargando {label}...
    </div>
  )

  const { enabled, paperMode, capital, startCapital, stats, position, trades } = botState
  const pnlColor = stats.totalPnl >= 0 ? '#26a69a' : '#ef5350'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '1rem' }}>{label}</div>
          <div style={{ color: '#4a5568', fontSize: '0.7rem' }}>
            {paperMode ? 'Paper' : '⚡ Real'} · BTCUSDT · mag ≥{localCfg.minStrength}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: enabled ? '#26a69a' : '#4a5568', fontSize: '0.75rem', fontWeight: 600 }}>
            {enabled ? 'ACTIVO' : 'INACTIVO'}
          </span>
          <Toggle value={enabled} onChange={v => saveConfig({ enabled: v })} />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        <Stat label='CAPITAL' value={`$${fmt(capital)}`} sub={`inicio $${fmt(startCapital)}`} />
        <Stat
          label='P&L'
          value={`${stats.totalPnl >= 0 ? '+' : ''}$${fmt(stats.totalPnl)}`}
          color={pnlColor}
          sub={`${stats.totalPnlPct >= 0 ? '+' : ''}${fmt(stats.totalPnlPct)}%`}
        />
        <Stat
          label='WIN RATE'
          value={stats.winRate !== null ? `${fmt(stats.winRate)}%` : '—'}
          color={stats.winRate !== null ? (stats.winRate >= 40 ? '#26a69a' : '#ef5350') : '#718096'}
          sub={`${stats.wins}W/${stats.losses}L (${stats.totalTrades})`}
        />
      </div>

      {/* Config */}
      <div style={{ background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={labelStyle}>
            Capital (USD)
            <input type='number' min='1' value={localCfg.capital}
              onChange={e => setLocalCfg(c => ({ ...c, capital: +e.target.value }))}
              onBlur={() => saveConfig({ capital: localCfg.capital })} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Riesgo / trade (%)
            <input type='number' min='0.5' max='100' step='0.5' value={localCfg.riskPct}
              onChange={e => setLocalCfg(c => ({ ...c, riskPct: +e.target.value }))}
              onBlur={() => saveConfig({ riskPct: localCfg.riskPct })} style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
            Magnitud mínima
            <select value={localCfg.minStrength}
              onChange={e => { setLocalCfg(c => ({ ...c, minStrength: +e.target.value })); saveConfig({ minStrength: +e.target.value }) }}
              style={inputStyle}>
              {[3, 4, 5].map(v => <option key={v} value={v}>{v} – {['Media', 'Alta', 'Muy alta'][v - 3]}</option>)}
            </select>
          </label>
        </div>
        {/* Paper / Real */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ color: '#718096', fontSize: '0.7rem', fontWeight: 600 }}>Modo</span>
          <div style={{ display: 'flex', background: '#0d0f1a', borderRadius: 6, overflow: 'hidden' }}>
            {['Paper', 'Real'].map(m => (
              <button key={m}
                onClick={() => m === 'Real'
                  ? window.confirm('⚠️ Modo real usa dinero en Binance. ¿Continuar?') && saveConfig({ paperMode: false })
                  : saveConfig({ paperMode: true })}
                style={{
                  border: 'none', padding: '3px 12px', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer',
                  background: (paperMode && m === 'Paper') || (!paperMode && m === 'Real') ? (m === 'Paper' ? '#2196F3' : '#ef5350') : 'transparent',
                  color:      (paperMode && m === 'Paper') || (!paperMode && m === 'Real') ? '#fff' : '#4a5568',
                }}>
                {m === 'Real' ? '⚡ Real' : '📄 Paper'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Posición */}
      {position
        ? <PositionCard pos={position} onClose={closePosition} />
        : (
          <div style={{
            background: '#1a1d2e', border: '1px dashed #2a2d3e', borderRadius: 10,
            padding: '14px', textAlign: 'center', color: '#4a5568', fontSize: '0.78rem',
          }}>
            {enabled ? `Esperando señal mag ≥${localCfg.minStrength}` : 'Bot inactivo'}
          </div>
        )
      }

      {/* Historial */}
      {trades && trades.length > 0 && (
        <div style={{ background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: 10, overflow: 'hidden', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #1e2130', color: '#718096', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            Últimos {trades.length} trades
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 200 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 55px 60px 60px 45px', gap: 4, padding: '4px 8px', color: '#4a5568', fontSize: '0.62rem', fontWeight: 700 }}>
              <span>PAR</span><span style={{ textAlign: 'right' }}>ENT</span><span style={{ textAlign: 'right' }}>SAL</span><span style={{ textAlign: 'right' }}>P&L</span><span style={{ textAlign: 'center' }}>RES</span>
            </div>
            {trades.map(t => <TradeRow key={t.id} t={t} />)}
          </div>
        </div>
      )}

      {saving && <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.7rem' }}>Guardando...</div>}
    </div>
  )
}

// ─── Panel principal — dos bots lado a lado ───────────────────────────────────
export default function BotPanel() {
  return (
    <div style={{
      height: '100%', display: 'flex', gap: 0,
    }}>
      {[
        { botId: '15m', label: 'Bot 15m — MACD' },
        { botId: '1h',  label: 'Bot 1H — MACD'  },
      ].map(({ botId, label }, i) => (
        <div key={botId} style={{
          flex: 1, overflowY: 'auto', padding: '14px',
          borderRight: i === 0 ? '1px solid #1e2130' : 'none',
        }}>
          <BotCard botId={botId} label={label} />
        </div>
      ))}
    </div>
  )
}

const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, color: '#718096', fontSize: '0.68rem', fontWeight: 600 }
const inputStyle = { background: '#0d0f1a', border: '1px solid #2a2d3e', color: '#e2e8f0', padding: '5px 8px', borderRadius: 6, fontSize: '0.82rem' }
