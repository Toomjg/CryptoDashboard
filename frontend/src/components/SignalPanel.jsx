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
  POSITIVO:      { label: 'Positivo',     color: '#26a69a' },
  NEGATIVO:      { label: 'Negativo',     color: '#ef5350' },
  RUPTURA_ALCISTA:   { label: 'Ruptura Alcista',  color: '#26a69a' },
  RUPTURA_BAJISTA:   { label: 'Ruptura Bajista',  color: '#ef5350' },
  CERCA_SOPORTE:     { label: 'Cerca Soporte',    color: '#4caf50' },
  CERCA_RESISTENCIA: { label: 'Cerca Resistencia',color: '#ff9800' },
  GOLDEN_CROSS:  { label: 'Cruz Dorada',  color: '#FFD700' },
  DEATH_CROSS:   { label: 'Cruz Muerte',  color: '#9e2020' },
  DIV_ALCISTA:   { label: 'Div. Alcista', color: '#26a69a' },
  DIV_BAJISTA:   { label: 'Div. Bajista', color: '#ef5350' },
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

function fmtPrice(v) {
  if (v == null) return '—'
  if (v >= 1000)  return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 1)     return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

export default function SignalPanel({ signal, lastUpdate }) {
  if (!signal) return null
  const { overall, score, maxScore, details, target } = signal
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

      {/* TP / SL / R:R */}
      {target && overall !== 'NEUTRAL' && (
        <div style={{
          background: '#1a1d2e', borderRadius: 10,
          border: `1px solid ${target.direction === 'LONG' ? '#26a69a' : '#ef5350'}30`,
          padding: '0.85rem 1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0' }}>
              {target.direction === 'LONG' ? '▲ Objetivo Largo' : '▼ Objetivo Corto'}
            </span>
            {target.rr && (
              <span style={{
                fontSize: '0.72rem', fontWeight: 800, padding: '2px 10px',
                borderRadius: 999,
                background: target.rr >= 2 ? '#26a69a25' : target.rr >= 1.2 ? '#ff980025' : '#ef535025',
                color:      target.rr >= 2 ? '#26a69a'   : target.rr >= 1.2 ? '#ff9800'   : '#ef5350',
              }}>
                R/R {target.rr}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: '#9e9e9e' }}>Entrada</span>
              <span style={{ fontSize: '0.72rem', color: '#e2e8f0', fontFamily: 'monospace' }}>
                precio actual
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: target.direction === 'LONG' ? '#26a69a' : '#ef5350' }}>
                Objetivo (TP)
              </span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: target.direction === 'LONG' ? '#26a69a' : '#ef5350', fontFamily: 'monospace' }}>
                ${fmtPrice(target.tp)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: '#ef5350' }}>Stop Loss</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef5350', fontFamily: 'monospace' }}>
                ${fmtPrice(target.sl)}
              </span>
            </div>
          </div>
          {target.fromAtr && (
            <div style={{ fontSize: '0.65rem', color: '#4a5568', marginTop: '0.4rem' }}>
              * estimado por ATR (sin niveles S/R disponibles)
            </div>
          )}
        </div>
      )}

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

      {/* Patrones de velas */}
      {details.patterns && details.patterns.length > 0 && (
        <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div style={nameStyle}>Patrones de velas</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {details.patterns.map(p => {
              const color = p.signal === 'ALCISTA' ? '#26a69a'
                          : p.signal === 'BAJISTA' ? '#ef5350'
                          : '#9e9e9e';
              return (
                <span key={p.name} style={{
                  fontSize: '0.72rem', fontWeight: 600,
                  padding: '2px 9px', borderRadius: 999,
                  background: color + '25', color,
                }}>
                  {p.label}
                  {p.score !== 0 && (
                    <span style={{ opacity: 0.7, marginLeft: 3 }}>
                      {p.score > 0 ? `+${p.score}` : p.score}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Soporte y Resistencia */}
      {details.sr && (
        <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <div style={nameStyle}>Soporte / Resistencia</div>
            {details.sr.signal !== 'NEUTRAL' && <Badge signal={details.sr.signal} />}
          </div>
          {details.sr.resistances?.slice(0, 2).map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ fontSize: '0.72rem', color: '#ef535090' }}>
                R{i + 1} — ${r.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '0.68rem', color: '#4a5568' }}>{r.touches}x tocado</span>
            </div>
          ))}
          {details.sr.supports?.slice(0, 2).map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ fontSize: '0.72rem', color: '#26a69a90' }}>
                S{i + 1} — ${s.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '0.68rem', color: '#4a5568' }}>{s.touches}x tocado</span>
            </div>
          ))}
        </div>
      )}

      {/* Golden / Death Cross */}
      {details.cross && (
        <div style={rowStyle}>
          <div>
            <div style={nameStyle}>Cruce EMA 50/200</div>
            <div style={{ fontSize: '0.72rem', color: '#718096' }}>
              hace {details.cross.age} vela{details.cross.age !== 1 ? 's' : ''}
            </div>
          </div>
          <Badge signal={details.cross.signal} />
        </div>
      )}

      {/* Divergencia RSI */}
      {details.divRsi && (
        <div style={rowStyle}>
          <div>
            <div style={nameStyle}>Divergencia RSI</div>
            <div style={{ fontSize: '0.72rem', color: '#718096' }}>
              precio vs RSI
            </div>
          </div>
          <Badge signal={details.divRsi.signal} />
        </div>
      )}

      {/* Divergencia MACD */}
      {details.divMacd && (
        <div style={rowStyle}>
          <div>
            <div style={nameStyle}>Divergencia MACD</div>
            <div style={{ fontSize: '0.72rem', color: '#718096' }}>
              precio vs MACD
            </div>
          </div>
          <Badge signal={details.divMacd.signal} />
        </div>
      )}

      {/* Bollinger Bands */}
      {details.bb && details.bb.signal !== 'NEUTRAL' && (
        <div style={rowStyle}>
          <div>
            <div style={nameStyle}>Bollinger Bands</div>
            <div style={{ fontSize: '0.72rem', color: '#718096' }}>
              %B {(details.bb.percent * 100).toFixed(0)}% — [{fmtPrice(details.bb.lower)} / {fmtPrice(details.bb.upper)}]
            </div>
          </div>
          <Badge signal={details.bb.signal} />
        </div>
      )}

      {/* Sentimiento de mercado (Fear & Greed) */}
      {details.noticias && (
        <div style={rowStyle}>
          <div>
            <div style={nameStyle}>Sentimiento</div>
            <div style={{ fontSize: '0.72rem', color: '#718096' }}>
              {details.noticias.available ? 'Fear & Greed Index' : 'No disponible'}
            </div>
          </div>
          {details.noticias.available
            ? <Badge signal={details.noticias.signal} />
            : <span style={{ fontSize: '0.68rem', color: '#4a5568' }}>—</span>
          }
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
