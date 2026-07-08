import { useState, useRef, useCallback } from 'react'

export default function AnalysisView() {
  const [image,    setImage]    = useState(null)
  const [mimeType, setMimeType] = useState('image/jpeg')
  const [preview,  setPreview]  = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const loadFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    setMimeType(file.type || 'image/jpeg')
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      setImage(dataUrl.split(',')[1])
      setPreview(dataUrl)
      setAnalysis(null)
      setError(null)
    }
    reader.readAsDataURL(file)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    loadFile(e.dataTransfer.files[0])
  }, [loadFile])

  const analyze = async () => {
    if (!image) return
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ image, mimeType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error del servidor')
      setAnalysis(data.analysis)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => { setPreview(null); setImage(null); setAnalysis(null); setError(null) }

  return (
    <div style={{
      padding: '1.5rem', height: '100%', overflowY: 'auto',
      display: 'flex', flexDirection: 'column', gap: '1.25rem',
      boxSizing: 'border-box',
    }}>
      <div style={{ color: '#e2e8f0', fontSize: '1rem', fontWeight: 700 }}>
        Análisis de Gráfico con IA
        <span style={{ marginLeft: '0.75rem', fontSize: '0.78rem', color: '#718096', fontWeight: 400 }}>
          Subí una captura de pantalla y Claude analiza el setup técnico
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        style={{
          border:     `2px dashed ${dragging ? '#9c27b0' : '#2a2d3e'}`,
          borderRadius: 10,
          padding:    preview ? '0.5rem' : '2.5rem',
          textAlign:  'center',
          cursor:     'pointer',
          background: dragging ? '#9c27b015' : '#0d0f1a',
          transition: 'all 0.2s',
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => loadFile(e.target.files[0])}
        />
        {preview ? (
          <img
            src={preview}
            alt="preview"
            style={{ maxHeight: 300, maxWidth: '100%', borderRadius: 6, objectFit: 'contain', display: 'block', margin: '0 auto' }}
          />
        ) : (
          <div style={{ color: '#4a5568' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📊</div>
            <div style={{ color: '#718096', fontSize: '0.9rem' }}>
              Arrastrá una captura aquí o hacé click para seleccionar
            </div>
            <div style={{ fontSize: '0.78rem', marginTop: '0.3rem' }}>PNG · JPG · WebP</div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {preview && (
        <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
          <button
            onClick={analyze}
            disabled={loading}
            style={{
              background:  loading ? '#2a2d3e' : '#9c27b0',
              color:       '#fff',
              border:      'none',
              borderRadius: 8,
              padding:     '10px 28px',
              fontSize:    '0.9rem',
              fontWeight:  700,
              cursor:      loading ? 'not-allowed' : 'pointer',
              opacity:     loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Analizando...' : 'Analizar con Claude'}
          </button>
          <button
            onClick={reset}
            style={{
              background:   'transparent',
              color:        '#718096',
              border:       '1px solid #2a2d3e',
              borderRadius: 8,
              padding:      '10px 20px',
              fontSize:     '0.9rem',
              cursor:       'pointer',
            }}
          >
            Limpiar
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: '#ef535015', border: '1px solid #ef5350',
          borderRadius: 8, padding: '1rem', color: '#ef5350', flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {/* Analysis result */}
      {analysis && (
        <div style={{
          background: '#131722', border: '1px solid #1e2130',
          borderRadius: 10, padding: '1.5rem', flexShrink: 0,
        }}>
          <div style={{ color: '#9c27b0', fontWeight: 700, marginBottom: '1rem', fontSize: '0.82rem', letterSpacing: '0.05em' }}>
            ANÁLISIS TÉCNICO — CLAUDE OPUS
          </div>
          <AnalysisText text={analysis} />
        </div>
      )}
    </div>
  )
}

function AnalysisText({ text }) {
  const lines = text.split('\n')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: '0.5rem' }} />
        const isSection = /^\d+\.\s+\*\*/.test(line)
        return (
          <div
            key={i}
            style={{
              color:        isSection ? '#e2e8f0' : '#a0aec0',
              fontSize:     isSection ? '0.88rem' : '0.84rem',
              fontWeight:   isSection ? 600 : 400,
              lineHeight:   1.65,
              borderLeft:   isSection ? '2px solid #9c27b0' : 'none',
              paddingLeft:  isSection ? '0.75rem' : '0',
              marginTop:    isSection ? '0.6rem' : '0',
            }}
          >
            {renderBold(line)}
          </div>
        )
      })}
    </div>
  )
}

function renderBold(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ color: '#e2e8f0' }}>{part.slice(2, -2)}</strong>
      : part
  )
}
