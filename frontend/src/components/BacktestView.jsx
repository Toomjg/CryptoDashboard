import { useState, useEffect, useMemo } from 'react'
import { getKlinesLarge } from '../services/binance'
import { runBacktest } from '../services/backtest'

// Cuántas velas traer por temporalidad
const CANDLES_BY_INTERVAL = {
  '5m':  8000,  // ~27 días (8 requests × 1000)
  '15m': 3000,  // ~31 días
  '1h':  3000,  // ~125 días
  '4h':  2000,  // ~333 días
  '1d':  1000,  // ~1000 días
}

function fmtP(v) {
  if (v == null) return '—'
  if (v >= 10000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 1)     return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

function fmtDate(unixSec) {
  return new Date(unixSec * 1000).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// Nivel de confianza según cantidad de muestras
function confidence(n) {
  if (n >= 50) return { label: 'Alta', color: '#26a69a', tip: `${n} señales — estadísticamente confiable` }
  if (n >= 20) return { label: 'Media', color: '#ff9800', tip: `${n} señales — referencia, no definitivo` }
  if (n >= 8)  return { label: 'Baja', color: '#ef5350', tip: `${n} señales — muy pocos datos` }
  return { label: 'Sin datos', color: '#4a5568', tip: `${n} señales — insuficiente` }
}

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
      <polygon points={`${PAD},${zY} ${pts} ${toX(curve.length - 1)},${zY}`} fill={color + '25'} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: '#131722', borderRadius: 8, padding: '0.65rem 0.75rem', border: '1px solid #1e2130', textAlign: 'center' }}>
      <div style={{ fontSize: '0.6rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: color || '#e2e8f0' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.62rem', color: '#4a5568', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function StrengthRow({ level, data }) {
  const levelLabel = ['', 'Débil', 'Débil+', 'Media', 'Fuerte', 'Muy fuerte'][level]
  const levelColor = ['', '#718096', '#ff9800', '#2196F3', '#26a69a', '#9c27b0'][level]

  if (!data || data.total < 3) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 100px 90px', gap: '0.75rem', padding: '0.65rem 1rem', alignItems: 'center', borderBottom: '1px solid #1e213044' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1e2130', border: `2px solid #2a2d3e`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 900, color: '#2a2d3e' }}>{level}</div>
          <span style={{ fontSize: '0.7rem', color: '#2a2d3e' }}>{levelLabel}</span>
        </div>
        <span style={{ fontSize: '0.72rem', color: '#2a2d3e' }}>Sin datos suficientes ({data?.total ?? 0} señales)</span>
        <span /><span /><span />
      </div>
    )
  }

  const { total, wins, losses, timeouts, winRate, avgPct } = data
  const conf = confidence(total)
  const barColor = winRate >= 60 ? '#26a69a' : winRate >= 50 ? '#ff9800' : '#ef5350'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 120px 110px', gap: '0.75rem', padding: '0.75rem 1rem', alignItems: 'center', borderBottom: '1px solid #1e213044' }}>

      {/* Nivel */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: levelColor + '20', border: `2px solid ${levelColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 900, color: levelColor }}>{level}</div>
        <span style={{ fontSize: '0.7rem', color: '#718096' }}>{levelLabel}</span>
      </div>

      {/* Barra win rate */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: '0.7rem', color: '#718096' }}>{total} señales · {wins}W / {losses}L {timeouts > 0 ? `/ ${timeouts}T` : ''}</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: barColor }}>{winRate}%</span>
        </div>
        <div style={{ background: '#1e2130', borderRadius: 4, height: 7 }}>
          <div style={{ width: `${winRate}%`, height: '100%', background: barColor, borderRadius: 4 }} />
        </div>
      </div>

      {/* Avg P&L */}
      <div style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: avgPct >= 0 ? '#26a69a' : '#ef5350', fontFamily: 'monospace' }}>
        {avgPct >= 0 ? '+' : ''}{avgPct}% avg
      </div>

      {/* Confianza estadística */}
      <div style={{ textAlign: 'center' }}>
        <span title={conf.tip} style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: conf.color + '20', color: conf.color, cursor: 'help' }}>
          {conf.label} confianza
        </span>
      </div>

      {/* Recomendación */}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: winRate >= 60 ? '#26a69a20' : winRate >= 50 ? '#ff980020' : '#ef535020',
          color: barColor }}>
          {winRate >= 60 ? '✓ Operar' : winRate >= 50 ? '~ Con cautela' : '✕ Evitar'}
        </span>
      </div>
    </div>
  )
}

export default function BacktestView({ interval, symbol }) {
  const [candles,  setCandles]  = useState(null)
  const [progress, setProgress] = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    let cancelled = false
    setCandles(null)
    setLoading(true)
    setError(null)
    setProgress(0)

    const total = CANDLES_BY_INTERVAL[interval] || 2000
    getKlinesLarge(symbol, interval, total, p => { if (!cancelled) setProgress(p) })
      .then(data => { if (!cancelled) { setCandles(data); setLoading(false) } })
      .catch(() => { if (!cancelled) { setError('Error al cargar datos históricos'); setLoading(false) } })

    return () => { cancelled = true }
  }, [symbol, interval])

  const result = useMemo(() => {
    if (!candles || candles.length < 100) return null
    return runBacktest(candles, interval)
  }, [candles, interval])

  // Loading
  if (loading) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ fontSize: '0.85rem', color: '#718096' }}>
        Descargando datos históricos — {symbol.replace('USDT', '/USDT')} {interval}
      </div>
      <div style={{ width: 280, background: '#1e2130', borderRadius: 6, height: 8 }}>
        <div style={{ width: `${progress}%`, height: '100%', background: '#2196F3', borderRadius: 6, transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: '0.72rem', color: '#4a5568' }}>{progress}% · {CANDLES_BY_INTERVAL[interval] || 2000} velas</div>
    </div>
  )

  if (error) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef5350' }}>{error}</div>
  )

  if (!result || !result.total) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5568', flexDirection: 'column', gap: 8 }}>
      <div>Sin señales encontradas en el período analizado</div>
      <div style={{ fontSize: '0.72rem' }}>Probá con una temporalidad diferente</div>
    </div>
  )

  const { trades, winRate, total, wins, losses, timeouts, profitFactor, avgWinPct, avgLossPct, equityCurve, maxDrawdown, finalEquity, byStrength, byDirection } = result
  const winColor = winRate >= 60 ? '#26a69a' : winRate >= 50 ? '#ff9800' : '#ef5350'
  const candleSpan = candles.length > 0
    ? `${fmtDate(candles[0].time)} → ${fmtDate(candles[candles.length - 1].time)}`
    : ''

  return (
    <div style={{ padding: '1rem', overflowY: 'auto', height: '100%' }}>

      {/* Título */}
      <div style={{ marginBottom: '0.75rem' }}>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#e2e8f0' }}>
          Backtest — {symbol.replace('USDT', '/USDT')} {interval}
        </span>
        <div style={{ fontSize: '0.68rem', color: '#4a5568', marginTop: 2 }}>
          {candles?.length} velas · {candleSpan} · TP = 1.5×ATR · SL = 0.8×ATR
        </div>
      </div>

      {/* Stats generales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <StatCard label="Win Rate"      value={`${winRate}%`}        color={winColor} />
        <StatCard label="Total señales" value={total}                color="#e2e8f0" />
        <StatCard label="Profit Factor" value={profitFactor ?? '—'}  color={profitFactor >= 1.2 ? '#26a69a' : profitFactor >= 1 ? '#ff9800' : '#ef5350'} sub="ganancia/pérdida" />
        <StatCard label="Avg Win"       value={`+${avgWinPct}%`}     color="#26a69a" />
        <StatCard label="Avg Loss"      value={`-${avgLossPct}%`}    color="#ef5350" />
        <StatCard label="Max Drawdown"  value={`${maxDrawdown}%`}    color="#ff9800" sub="1% riesgo/op" />
      </div>

      {/* Curva de capital */}
      <div style={{ background: '#131722', borderRadius: 8, padding: '0.65rem 1rem', marginBottom: '0.75rem', border: '1px solid #1e2130' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: '0.7rem', color: '#718096' }}>Curva de capital — 1% de riesgo fijo por operación</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: finalEquity >= 0 ? '#26a69a' : '#ef5350', fontFamily: 'monospace' }}>
            {finalEquity >= 0 ? '+' : ''}{finalEquity}% acumulado
          </span>
        </div>
        <EquityCurve curve={equityCurve} final={finalEquity} />
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: 4 }}>
          <span style={{ fontSize: '0.65rem', color: '#26a69a' }}>■ {wins} wins</span>
          <span style={{ fontSize: '0.65rem', color: '#ef5350' }}>■ {losses} losses</span>
          <span style={{ fontSize: '0.65rem', color: '#718096' }}>■ {timeouts} timeouts (sin TP ni SL en plazo)</span>
        </div>
      </div>

      {/* LONG vs SHORT */}
      {byDirection && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {['LONG', 'SHORT'].map(dir => {
            const d = byDirection[dir]
            if (!d || d.total === 0) return null
            const color = dir === 'LONG' ? '#26a69a' : '#ef5350'
            const wr    = d.winRate ?? 0
            const barColor = wr >= 50 ? '#26a69a' : wr >= 40 ? '#ff9800' : '#ef5350'
            return (
              <div key={dir} style={{ background: '#131722', borderRadius: 8, padding: '0.65rem 1rem', border: `1px solid ${color}30` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color }}>{dir === 'LONG' ? '▲ COMPRAS' : '▼ VENTAS'}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: barColor }}>{wr}% win rate</span>
                </div>
                <div style={{ background: '#1e2130', borderRadius: 4, height: 6, marginBottom: 4 }}>
                  <div style={{ width: `${wr}%`, height: '100%', background: barColor, borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: '0.67rem', color: '#4a5568' }}>{d.total} señales · {d.wins} wins</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Efectividad por magnitud */}
      <div style={{ background: '#131722', borderRadius: 8, border: '1px solid #1e2130', marginBottom: '0.75rem', overflow: 'hidden' }}>
        <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid #1e2130', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0' }}>Efectividad por magnitud de señal</span>
          <span style={{ fontSize: '0.65rem', color: '#4a5568' }}>
            Alta confianza = 50+ señales · Media = 20–49 · Baja = 8–19
          </span>
        </div>
        {[5, 4, 3, 2, 1].map(s => <StrengthRow key={s} level={s} data={byStrength[s]} />)}
        <div style={{ padding: '0.5rem 1rem', fontSize: '0.67rem', color: '#4a5568', borderTop: '1px solid #1e213044' }}>
          Para 50+ señales por magnitud necesitás: 15m ~45 días · 1H ~6 meses · 4H ~2 años. Los datos actuales cubren lo máximo que permite Binance en {Math.ceil((CANDLES_BY_INTERVAL[interval] || 2000) / { '15m': 96, '1h': 24, '4h': 6, '1d': 1 }[interval] || 24)} días.
        </div>
      </div>

      {/* Historial */}
      <div style={{ background: '#131722', borderRadius: 8, border: '1px solid #1e2130', overflow: 'hidden' }}>
        <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid #1e2130', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0' }}>Historial de operaciones</span>
          <span style={{ fontSize: '0.67rem', color: '#4a5568' }}>Más reciente primero</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 55px 35px 105px 90px 90px 75px 75px', gap: '0.5rem', padding: '0.35rem 1rem', fontSize: '0.63rem', color: '#4a5568', borderBottom: '1px solid #1e2130' }}>
          <span>Fecha</span><span>Dir.</span><span>Mag.</span><span>Entrada</span><span>TP</span><span>SL</span><span>Resultado</span><span style={{ textAlign: 'right' }}>P&L</span>
        </div>
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {[...trades].reverse().map((t, idx) => {
            const color = t.outcome === 'WIN' ? '#26a69a' : t.outcome === 'LOSS' ? '#ef5350' : '#718096'
            return (
              <div key={idx} style={{
                display: 'grid', gridTemplateColumns: '130px 55px 35px 105px 90px 90px 75px 75px',
                gap: '0.5rem', padding: '0.42rem 1rem', borderBottom: '1px solid #1e213035', alignItems: 'center',
                background: t.outcome === 'WIN' ? '#26a69a08' : t.outcome === 'LOSS' ? '#ef535008' : 'transparent',
              }}>
                <span style={{ fontSize: '0.67rem', color: '#718096', fontFamily: 'monospace' }}>{fmtDate(t.time)}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: t.direction === 'LONG' ? '#26a69a' : '#ef5350' }}>{t.direction}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#e2e8f0', textAlign: 'center' }}>{t.strength}</span>
                <span style={{ fontSize: '0.67rem', fontFamily: 'monospace', color: '#e2e8f0' }}>{fmtP(t.entry)}</span>
                <span style={{ fontSize: '0.67rem', fontFamily: 'monospace', color: '#26a69a' }}>{fmtP(t.tp)}</span>
                <span style={{ fontSize: '0.67rem', fontFamily: 'monospace', color: '#ef5350' }}>{fmtP(t.sl)}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color }}>{t.outcome}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color, textAlign: 'right', fontFamily: 'monospace' }}>
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
