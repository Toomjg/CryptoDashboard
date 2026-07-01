const router  = require('express').Router()
const trader  = require('../services/trader')
const scanner = require('../services/scanner')

// GET /api/bot/scan — último resultado de cada scanner
router.get('/scan', (req, res) => {
  res.json(scanner.getLastScan())
})

// GET /api/bot/all — estado de todos los bots
router.get('/all', (req, res) => {
  res.json(trader.getAllStates())
})

// POST /api/bot/tick — precio en vivo desde el WebSocket del frontend
router.post('/tick', (req, res) => {
  const { symbol, price } = req.body
  if (!symbol || price === undefined) return res.json({ ok: false })
  const p = parseFloat(price)
  const closed = trader.BOT_IDS.map(id => trader.updatePrice(id, symbol, p)).filter(Boolean)
  res.json({ ok: true, closed })
})

// GET /api/bot/:botId/status
router.get('/:botId/status', (req, res) => {
  try { res.json(trader.getState(req.params.botId)) }
  catch (err) { res.status(404).json({ error: err.message }) }
})

// POST /api/bot/:botId/config
router.post('/:botId/config', (req, res) => {
  try {
    trader.configure(req.params.botId, req.body)
    res.json({ ok: true, state: trader.getState(req.params.botId) })
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message })
  }
})

// DELETE /api/bot/:botId/position
router.delete('/:botId/position', (req, res) => {
  try {
    const s = trader.getState(req.params.botId)
    if (!s.position) return res.json({ ok: false, error: 'Sin posición abierta' })
    const price  = s.position.livePnl?.price ?? s.position.entry
    const closed = trader.updatePrice(req.params.botId, s.position.symbol, price * (s.position.direction === 'LONG' ? 0.9999 : 1.0001))
    if (!closed) {
      return res.json({ ok: true, trade: trader.forceClose(req.params.botId, price) })
    }
    res.json({ ok: true, trade: closed })
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message })
  }
})

module.exports = router
