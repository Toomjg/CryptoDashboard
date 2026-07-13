const express = require('express')
const router  = express.Router()
const { GoogleGenerativeAI } = require('@google/generative-ai')

const SYSTEM_PROMPT = `Eres un analista técnico experto en trading de criptomonedas. Analiza el gráfico proporcionado siguiendo esta metodología de 10 puntos:

1. **Tendencia principal**: Identifica la tendencia dominante (alcista/bajista/lateral) con evidencia visual
2. **Estructura de precio**: HH/HL (alcista), LH/LL (bajista), o rango. Describe la estructura actual
3. **Niveles clave S/R**: Identifica los soportes y resistencias más relevantes con sus precios aproximados
4. **EMAs / Medias móviles**: Si se ven, describe su posición y cruce respecto al precio
5. **Volumen**: Analiza el volumen. ¿Confirma el movimiento? ¿Hay divergencia?
6. **RSI / Momentum**: Estado del RSI o indicador de momentum visible. Sobrecomprado/sobrevendido/neutral
7. **Patrones chartistas**: Identifica cualquier patrón (bandera, cuña, cabeza y hombros, doble techo/piso, triángulo, etc.)
8. **Fibonacci / Retrocesos**: Si aplica, señala zonas de retroceso importantes o si el precio está en golden zone
9. **Sesgo direccional**: LONG, SHORT o NEUTRAL con justificación clara basada en los puntos anteriores
10. **Niveles de entrada/TP/SL sugeridos**: Propone entrada, objetivo(s) y stop loss concretos con precios aproximados

Sé preciso y conciso. Responde siempre en español.`

router.post('/', async (req, res) => {
  try {
    const { image, mimeType = 'image/jpeg' } = req.body
    if (!image) return res.status(400).json({ error: 'Se requiere imagen en base64' })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada en el servidor' })

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    })

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: 'Analiza este gráfico de trading aplicando la metodología de 10 puntos.' },
          { inlineData: { mimeType, data: image } },
        ],
      }],
    })

    const text = result.response.text()
    res.json({ analysis: text })
  } catch (err) {
    console.error('[ANALYZE]', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
