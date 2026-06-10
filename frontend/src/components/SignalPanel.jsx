const SIGNAL_CONFIG = {
  COMPRA_FUERTE: { label: 'COMPRA FUERTE', color: '#26a69a', bg: '#26a69a20', icon: '▲▲' },
  COMPRA:        { label: 'COMPRA',         color: '#4caf50', bg: '#4caf5020', icon: '▲'  },
  COMPRA_DEBIL:  { label: 'COMPRA DEBIL',   color: '#8bc34a', bg: '#8bc34a20', icon: '△'  },
  NEUTRAL:       { label: 'NEUTRAL',         color: '#9e9e9e', bg: '#9e9e9e20', icon: '—'  },
  VENTA_DEBIL:   { label: 'VENTA DEBIL',     color: '#ff9800', bg: '#ff980020', icon: '▽'  },
  VENTA:         { label: 'VENTA',           color: '#f44336', bg: '#f4433620', icon: '▼'  },
  VENTA_FUERTE:  { label: 'VENTA FUERTE',   color: '#b71c1c', bg: '#b71c1c20', icon: '▼▼' },
}

const IND_LABELS = {
  SOBREVENTA:    { label: 'Sobreventa',   color: '#26a69a' },
  COMPRA:        { label: 'Compra',       color: '#4caf50' },
  DEBIL_COMPRA:  { label: 'Compra debil', color: '#8bc34a' },
  NEUTRAL:       { label: 'Neutral',      color: '#9e9e9e' },
  DEBIL_VENTA:   { label: 'Venta debil',  color: '#ff9800' },
  VENTA:         { label: 'Venta',        color: '#f44336' },
  SOBRECOMPRA:   { label: 'Sobrecompra',  color: '#b71c1c' },
  FUERTE_COMPRA: { label: 'Fuerza compra',color: '#26a69a' },
  FUERTE_VENTA:  { label: 'Fuerza venta', color: '#ef5350' },
  ALTO:          { label: 'Alto',         color: '#2196F3' },
  BAJO:          { label: 'Bajo',         color: '#9e9e9e' },
  NORMAL:        { label: 'Normal',       color: '#718096' },
}

function Badge({ signal }) {
  const cfg = IND_LABELS[signal] || { label: signal, color: '#9e9e9e' }
  return (
    <span style={{
      fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px',
      borderRadius: '999px', background: cfg.color + '25', color: cfg.color,
    }}>
      {cfg.label}
    </span>
  )
}

function ScoreBar({ score, max }) {
  const pct = ((score + max) / (max * 2)) * 100
  const color = score > 3 ? '#26a69a' : score < -3 ? '#ef5350' : '#9e9e9e'
  return (
    <div style={{ margin: '12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#718096', marginBottom: 4 }}>
        <span>Venta</span>
        <span style={{ color, fontWeight: 700 }}>Puntaje: {score > 0 ? '+' : ''}{score}</span>
        <span>Compra</span>
      </div>
      <div style={{ background: '#1e2130', borderRadius: 999, height: 8, position: 'relative' }}>
        <div style={{
          position: 'absolute', left: '50%', top: 0,
          width: 2, height: '100%', background: '#333'
        }} />
        <div style={{
          background: color, borderRadius: 999, height: '100%',
          width: `${Math.abs(score) / max * 50}%`,
          marginLeft: score >= 0 ? '50%' : `${50 - Math.abs(score) / max * 50}%`,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

export default function SignalPanel({ signal, lastUpdate }) {
  if (!signal) return null
  const { overall, score, maxScore, details } = signal
  const cfg = SIGNAL_CONFIG[overall] || SIGNAL_CONFIG.NEUTRAL

  return (
    <div style={{
      background: '#131722', border: '1px solid #1e2130',
      borderRadius: 12, padding: '1.2rem', height: '100%',
      display: 'flex', flexDirection: 'column', gap: '1rem',
      overflowY: 'auto',
    }}>
      {/* Señal principal */}
      <div style={{
        background: cfg.bg, border: `1px solid ${cfg.color}40`,
        borderRadius: 10, padding: '1rem', textAlign: 'center',
      }}>
        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: cfg.color, letterSpacing: 1 }}>
          {cfg.icon} {cfg.label}
        </div>
        <ScoreBar score={score} max={maxScore} />
      </div>

      {/* RSI */}
      {details.rsi && (
        <div style={rowStyle}>
          <div>
            <div style={nameStyle}>RSI (14)</div>
            <div style={valStyle}>{details.rsi.value}</div>
          </div>
          <Badge signal={details.rsi.signal} />
        </div>
      )}

      {/* MACD */}
      {details.macd && (
        <div style={rowStyle}>
          <div>
            <div style={nameStyle}>MACD</div>
            <div style={valStyle}>
              {details.macd.macd} / {details.macd.signal}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#718096' }}>
              Hist: {details.macd.histogram}
            </div>
          </div>
          <Badge signal={details.macd.trend} />
        </div>
      )}

      {/* EMA */}
      {details.ema && (
        <div style={rowStyle}>
          <div>
            <div style={nameStyle}>EMAs</div>
            <div style={{ fontSize: '0.72rem', color: '#718096' }}>
              20: {details.ema.ema20}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#718096' }}>
              50: {details.ema.ema50}
            </div>
            {details.ema.ema200 && (
              <div style={{ fontSize: '0.72rem', color: '#718096' }}>
                200: {details.ema.ema200}
              </div>
            )}
          </div>
          <Badge signal={details.ema.signal} />
        </div>
      )}

      {/* Volumen */}
      {details.volume && (
        <div style={rowStyle}>
          <div>
            <div style={nameStyle}>Volumen</div>
            <div style={{ fontSize: '0.72rem', color: '#718096' }}>
              {details.volume.ratio}x promedio
            </div>
          </div>
          <Badge signal={details.volume.signal} />
        </div>
      )}

      {lastUpdate && (
        <div style={{ fontSize: '0.7rem', color: '#4a5568', textAlign: 'center', marginTop: 'auto' }}>
          Actualizado: {lastUpdate}
        </div>
      )}
    </div>
  )
}

const rowStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '0.7rem 0.9rem', background: '#1a1d2e',
  borderRadius: 8, border: '1px solid #1e2130',
}

const nameStyle = { fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }
const valStyle  = { fontSize: '0.78rem', color: '#718096', fontFamily: 'monospace' }
