function getConfig(value) {
  if (value === null || value === undefined) return { color: '#9e9e9e', bg: '#9e9e9e20', label: 'Sin datos', interp: '' }
  if (value <= 25) return {
    color: '#26a69a', bg: '#26a69a20',
    label: 'Miedo Extremo',
    interp: 'Históricamente señal de compra — el mercado está muy sobrevendido.',
  }
  if (value <= 45) return {
    color: '#8bc34a', bg: '#8bc34a20',
    label: 'Miedo',
    interp: 'El mercado es cauteloso, posibles oportunidades en el mediano plazo.',
  }
  if (value <= 55) return {
    color: '#9e9e9e', bg: '#9e9e9e20',
    label: 'Neutral',
    interp: 'Sentimiento equilibrado, sin sesgo claro.',
  }
  if (value <= 75) return {
    color: '#ff9800', bg: '#ff980020',
    label: 'Codicia',
    interp: 'El mercado está eufórico. Precaución con nuevas compras.',
  }
  return {
    color: '#ef5350', bg: '#ef535020',
    label: 'Codicia Extrema',
    interp: 'Históricamente señal de venta — mercado sobrecomprado.',
  }
}

export default function NewsPanel({ news }) {
  if (!news) return null

  const { available, value, label } = news
  const cfg = getConfig(value)

  return (
    <div style={{
      background: '#131722', border: '1px solid #1e2130',
      borderRadius: 12, padding: '1rem',
      display: 'flex', flexDirection: 'column', gap: '0.85rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#e2e8f0' }}>
          Fear & Greed Index
        </span>
        <span style={{ fontSize: '0.68rem', color: '#4a5568' }}>alternative.me</span>
      </div>

      {!available && (
        <div style={{
          background: '#1a1d2e', borderRadius: 8, padding: '0.8rem',
          fontSize: '0.75rem', color: '#718096', lineHeight: 1.5,
        }}>
          No se pudo obtener el índice de sentimiento.
        </div>
      )}

      {available && (
        <>
          {/* Número grande */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', fontWeight: 900, color: cfg.color, lineHeight: 1 }}>
              {value}
            </div>
            <div style={{
              marginTop: '0.3rem', fontSize: '0.82rem', fontWeight: 700,
              padding: '3px 12px', borderRadius: 999,
              background: cfg.bg, color: cfg.color, display: 'inline-block',
            }}>
              {label || cfg.label}
            </div>
          </div>

          {/* Barra de progreso */}
          <div>
            <div style={{ position: 'relative', height: 10, borderRadius: 999, background: '#1e2130', overflow: 'hidden' }}>
              {/* Gradiente de colores: verde → amarillo → rojo */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to right, #26a69a, #8bc34a, #ffeb3b, #ff9800, #ef5350)',
              }} />
              {/* Marcador de posición */}
              <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `calc(${value}% - 2px)`,
                width: 4, background: '#fff', borderRadius: 2,
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: '0.65rem', color: '#26a69a' }}>Miedo extremo</span>
              <span style={{ fontSize: '0.65rem', color: '#ef5350' }}>Codicia extrema</span>
            </div>
          </div>

          {/* Interpretación */}
          <div style={{
            background: cfg.bg, border: `1px solid ${cfg.color}30`,
            borderRadius: 8, padding: '0.65rem 0.8rem',
            fontSize: '0.73rem', color: '#cbd5e0', lineHeight: 1.5,
          }}>
            {cfg.interp}
          </div>
        </>
      )}
    </div>
  )
}
