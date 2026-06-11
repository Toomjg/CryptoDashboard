const router  = require('express').Router()
const trader  = require('../services/trader')

// GET /api/bot/status
router.get('/status', (req, res) => {
  res.json(trader.getState())
})

// POST /api/bot/config
router.post('/config', (req, res) => {
  try {
    trader.configure(req.body)
    res.json({ ok: true, state: trader.getState() })
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message })
  }
})

// POST /api/bot/tick  — frontend envía el precio actual para detectar TP/SL
router.post('/tick', (req, res) => {
  const { symbol, price } = req.body
  if (!symbol || price === undefined) return res.json({ ok: false })
  const closedTrade = trader.updatePrice(symbol, parseFloat(price))
  res.json({ ok: true, closedTrade: closedTrade ?? null })
})

// DELETE /api/bot/position  — cierra la posición abierta manualmente
router.delete('/position', (req, res) => {
  const s = trader.getState()
  if (!s.position) return res.json({ ok: false, error: 'Sin posición abierta' })
  // Cerrar al último precio conocido
  const price = s.position.livePnl?.price ?? s.position.entry
  const closed = trader.updatePrice(s.position.symbol, price * (s.position.direction === 'LONG' ? 0.9999 : 1.0001))
  // Si no cierra por precio, forzar
  if (!closed) {
    const forcedTrade = trader.forceClose(price)
    return res.json({ ok: true, trade: forcedTrade })
  }
  res.json({ ok: true, trade: closed })
})

module.exports = router
