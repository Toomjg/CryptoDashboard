const SENTIMENT = {
  POSITIVO: { label: 'Positivo', color: '#26a69a', bg: '#26a69a20' },
  NEUTRAL:  { label: 'Neutral',  color: '#9e9e9e', bg: '#9e9e9e20' },
  NEGATIVO: { label: 'Negativo', color: '#ef5350', bg: '#ef535020' },
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diffMs / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function SentimentBadge({ sentiment }) {
  const cfg = SENTIMENT[sentiment] || SENTIMENT.NEUTRAL
  return (
    <span style={{
      fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px',
      borderRadius: 999, background: cfg.bg, color: cfg.color,
      whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  )
}

export default function NewsPanel({ news }) {
  if (!news) return null

  const { available, signal, news: items } = news
  const cfg = SENTIMENT[signal] || SENTIMENT.NEUTRAL

  return (
    <div style={{
      background: '#131722', border: '1px solid #1e2130',
      borderRadius: 12, padding: '1rem', display: 'flex',
      flexDirection: 'column', gap: '0.6rem', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#e2e8f0' }}>
          Noticias
        </span>
        {available ? (
          <span style={{
            fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px',
            borderRadius: 999, background: cfg.bg, color: cfg.color,
          }}>
            Sentimiento: {cfg.label}
          </span>
        ) : (
          <span style={{ fontSize: '0.7rem', color: '#4a5568' }}>Sin token</span>
        )}
      </div>

      {!available && (
        <div style={{
          background: '#1a1d2e', borderRadius: 8, padding: '0.8rem',
          fontSize: '0.75rem', color: '#718096', lineHeight: 1.5,
        }}>
          Configura <code style={{ color: '#2196F3' }}>CRYPTOPANIC_TOKEN</code> en Railway
          para activar el analisis de noticias.{' '}
          <a
            href="https://cryptopanic.com/developers/api/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#2196F3' }}
          >
            Obtener token gratis
          </a>
        </div>
      )}

      {available && items.length === 0 && (
        <div style={{ fontSize: '0.78rem', color: '#4a5568', textAlign: 'center', padding: '1rem' }}>
          No hay noticias recientes
        </div>
      )}

      {/* Lista de noticias */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflowY: 'auto', maxHeight: 320 }}>
        {items.map(item => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#1a1d2e', borderRadius: 8,
              padding: '0.6rem 0.75rem', textDecoration: 'none',
              border: '1px solid #1e2130', transition: 'border-color 0.15s',
              display: 'block',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#2196F360'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#1e2130'}
          >
            <p style={{
              fontSize: '0.78rem', color: '#cbd5e0', lineHeight: 1.4,
              marginBottom: '0.35rem',
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {item.title}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ fontSize: '0.68rem', color: '#4a5568' }}>
                {item.source} · {timeAgo(item.published)}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {(item.votes.positive > 0 || item.votes.negative > 0) && (
                  <span style={{ fontSize: '0.68rem', color: '#718096' }}>
                    <span style={{ color: '#26a69a' }}>+{item.votes.positive}</span>
                    {' / '}
                    <span style={{ color: '#ef5350' }}>-{item.votes.negative}</span>
                  </span>
                )}
                <SentimentBadge sentiment={item.sentiment} />
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
