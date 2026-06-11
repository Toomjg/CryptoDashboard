import { useMemo } from 'react'
import { runBacktest } from '../services/backtest'

function fmtP(v) {
  if (v == null) return '—'
  if (v >= 10000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 1)     return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

function fmtDate(unixSec) {
  return new Date(unixSec * 1000).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

// Curva de capital como SVG simple
function EquityCurve({ curve, final }) {
  if (!curve || curve.length < 2) return null
  const W = 600, H = 90, PAD = 8
  const minV = Math.min(0, ...curve)
  const maxV = Math.max(0, ...curve)
  const range = maxV - minV || 1
  const toX = i => PAD + (i / (curve.length - 1)) * (W - PAD * 2)
  const toY = v => H - PAD - ((v - minV) / range) * (H - PAD * 2)
  const pts  = curve.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
  const zY   = toY(0)
  const color = final >= 0 ? '#26a69a' : '#ef5350'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 90 }}>
      <line x1={PAD} y1={zY} x2={W - PAD} y2={zY} stroke="#2a2d3e" strokeWidth={1} strokeDasharray="4 3" />
      <polygon
        points={`${PAD},${zY} ${pts} ${toX(curve.length - 1)},${zY}`}
        fill={color + '25'}
      />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: '#131722', borderRadius: 8, padding: '0.75rem 1rem',
      border: '1px solid #1e2130', textAlign: 'center',
    }}>
      <div style={{ fontSize: '0.62rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: color || '#e2e8f0' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.67rem', color: '#4a5568', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// Barra de efectividad por magnitud
function StrengthRow({ level, data }) {
  if (!data || data.total === 0) return (
    <div style={{
      display: 'grid', gridTemplateColumns: '40px 1fr 70px 90px 90px 80px',
      gap: '0.75rem', padding: '0.55rem 1rem', alignItems: 'center',
      borderBottom: '1px solid #1e213055',
    }}>
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#2a2d3e' }}>{level}</span>
      </div>
      <div style={{ fontSize: '0.72rem', color: '#2a2d3e' }}>Sin datos suficientes</div>
      <span style={{ fontSize: '0.72rem', color: '#2a2d3e' }}>0 señales</span>
      <span />
      <span />
      <span />
    </div>
  )

  const { total, wins, losses, timeouts, winRate, avgPct } = data
  const barColor = winRate >= 65 ? '#26a69a' : winRate >= 50 ? '#ff9800' : '#ef5350'
  const levelLabel = level <= 2 ? 'Débil' : level === 3 ? 'Media' : level === 4 ? 'Fuerte' : 'Muy fuerte'
  const levelColor = level <= 2 ? '#ff9800' : level === 3 ? '#2196F3' : level === 4 ? '#26a69a' : '#9c27b0'

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '50px 1fr 90px 110px 110px 90px',
      gap: '0.75rem', padding: '0.7rem 1rem', alignItems: 'center',
      borderBottom: '1px solid #1e213055',
    }}>
      {/* Magnitud */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', margin: '0 auto',
          background: levelColor + '20', border: `2px solid ${levelColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1rem', fontWeight: 900, color: levelColor,
        }}>
          {level}
        </div>
        <div style={{ fontSize: '0.6rem', color: '#4a5568', marginTop: 2 }}>{levelLabel}</div>
      </div>

      {/* Barra de win rate */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: '0.7rem', color: '#718096' }}>{total} señales</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: barColor }}>{winRate}% efectividad</span>
        </div>
        <div style={{ background: '#1e2130', borderRadius: 4, height: 8, overflow: 'hidden' }}>
          <div style={{ width: `${winRate}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.5s' }} />
        </div>
      </div>

      {/* Total */}
      <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#718096' }}>
        {total} ops
      </div>

      {/* Wins / Losses */}
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#26a69a' }}>{wins}W</span>
        <span style={{ fontSize: '0.75rem', color: '#718096' }}> / </span>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef5350' }}>{losses}L</span>
        {timeouts > 0 && <span style={{ fontSize: '0.7rem', color: '#4a5568' }}> / {timeouts}T</span>}
      </div>

      {/* Avg P&L */}
      <div style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: avgPct >= 0 ? '#26a69a' : '#ef5350', fontFamily: 'monospace' }}>
        {avgPct >= 0 ? '+' : ''}{avgPct}% avg
      </div>

      {/* Recomendación */}
      <div style={{ textAlign: 'right' }}>
        <span style={{
          fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: winRate >= 60 ? '#26a69a20' : winRate >= 50 ? '#ff980020' : '#ef535020',
          color: barColor,
        }}>
          {winRate >= 60 ? '✓ Confiable' : winRate >= 50 ? '~ Moderada' : '✕ Evitar'}
        </span>
      </div>
    </div>
  )
}

export default function BacktestView({ candles, interval, symbol }) {
  const result = useMemo(() => {
    if (!candles || candles.length < 100) return null
    return runBacktest(candles, interval)
  }, [candles, interval])

  if (!result) return (
    <div style={{ padding: '3rem', color: '#4a5568', textAlign: 'center' }}>
      Cargando datos para backtest...
    </div>
  )

  if (!result.total) return (
    <div style={{ padding: '3rem', color: '#4a5568', textAlign: 'center' }}>
      Sin señales históricas en este período para {symbol}
    </div>
  )

  const { trades, winRate, total, wins, losses, timeouts, profitFactor, avgWinPct, avgLossPct, equityCurve, maxDrawdown, finalEquity, byStrength } = result
  const winColor = winRate >= 60 ? '#26a69a' : winRate >= 50 ? '#ff9800' : '#ef5350'

  return (
    <div style={{ padding: '1rem', overflowY: 'auto', height: '100%' }}>

      {/* Título */}
      <div style={{ marginBottom: '1rem' }}>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#e2e8f0' }}>
          Backtest — {symbol.replace('USDT', '/USDT')} {interval}
        </span>
        <span style={{ fontSize: '0.72rem', color: '#4a5568', marginLeft: '0.75rem' }}>
          Últimas {candles.length} velas · TP = 1.5×ATR · SL = 0.8×ATR
        </span>
      </div>

      {/* Stats generales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
        <StatCard label="Win Rate"       value={`${winRate}%`}             color={winColor} />
        <StatCard label="Señales"        value={total}                      color="#e2e8f0" />
        <StatCard label="Profit Factor"  value={profitFactor ?? '—'}        color={profitFactor >= 1.2 ? '#26a69a' : profitFactor >= 1 ? '#ff9800' : '#ef5350'} />
        <StatCard label="Avg Win"        value={`+${avgWinPct}%`}           color="#26a69a" />
        <StatCard label="Avg Loss"       value={`-${avgLossPct}%`}          color="#ef5350" />
        <StatCard label="Max Drawdown"   value={`${maxDrawdown}%`}          color="#ff9800" sub="(1% riesgo/op)" />
      </div>

      {/* Curva de capital */}
      <div style={{ background: '#131722', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', border: '1px solid #1e2130' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: '0.72rem', color: '#718096' }}>
            Curva de capital — 1% de riesgo por operación
          </span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: finalEquity >= 0 ? '#26a69a' : '#ef5350', fontFamily: 'monospace' }}>
            {finalEquity >= 0 ? '+' : ''}{finalEquity}% acumulado
          </span>
        </div>
        <EquityCurve curve={equityCurve} final={finalEquity} />
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: 4 }}>
          <span style={{ fontSize: '0.67rem', color: '#26a69a' }}>■ {wins} wins</span>
          <span style={{ fontSize: '0.67rem', color: '#ef5350' }}>■ {losses} losses</span>
          <span style={{ fontSize: '0.67rem', color: '#718096' }}>■ {timeouts} timeouts</span>
        </div>
      </div>

      {/* Efectividad por magnitud */}
      <div style={{ background: '#131722', borderRadius: 8, border: '1px solid #1e2130', marginBottom: '1rem', overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #1e2130', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0' }}>Efectividad por magnitud de señal</span>
          <span style={{ fontSize: '0.67rem', color: '#4a5568' }}>
            Magnitud 1 = señal débil · Magnitud 5 = señal muy fuerte
          </span>
        </div>
        {[5, 4, 3, 2, 1].map(s => (
          <StrengthRow key={s} level={s} data={byStrength[s]} />
        ))}
      </div>

      {/* Historial de operaciones */}
      <div style={{ background: '#131722', borderRadius: 8, border: '1px solid #1e2130', overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #1e2130' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0' }}>
            Historial de operaciones
          </span>
        </div>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '130px 55px 40px 100px 90px 90px 80px 80px',
          gap: '0.5rem', padding: '0.4rem 1rem',
          fontSize: '0.67rem', color: '#4a5568',
          borderBottom: '1px solid #1e2130',
        }}>
          <span>Fecha</span><span>Dir.</span><span>Mag.</span>
          <span>Entrada</span><span>TP</span><span>SL</span>
          <span>Resultado</span><span style={{ textAlign: 'right' }}>P&L</span>
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {[...trades].reverse().map((t, idx) => {
            const color = t.outcome === 'WIN' ? '#26a69a' : t.outcome === 'LOSS' ? '#ef5350' : '#718096'
            return (
              <div key={idx} style={{
                display: 'grid', gridTemplateColumns: '130px 55px 40px 100px 90px 90px 80px 80px',
                gap: '0.5rem', padding: '0.45rem 1rem',
                borderBottom: '1px solid #1e213040',
                alignItems: 'center',
                background: t.outcome === 'WIN' ? '#26a69a08' : t.outcome === 'LOSS' ? '#ef535008' : 'transparent',
              }}>
                <span style={{ fontSize: '0.7rem', color: '#718096', fontFamily: 'monospace' }}>{fmtDate(t.time)}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: t.direction === 'LONG' ? '#26a69a' : '#ef5350' }}>{t.direction}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#e2e8f0', textAlign: 'center' }}>{t.strength}</span>
                <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#e2e8f0' }}>{fmtP(t.entry)}</span>
                <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#26a69a' }}>{fmtP(t.tp)}</span>
                <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#ef5350' }}>{fmtP(t.sl)}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{t.outcome}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color, textAlign: 'right', fontFamily: 'monospace' }}>
                  {t.pct >= 0 ? '+' : ''}{t.pct}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
