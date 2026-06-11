const axios = require('axios')

function fmtPrice(v) {
  if (v == null) return '—'
  if (v >= 10000) return '$' + Math.round(v).toLocaleString('en-US')
  if (v >= 1)     return '$' + v.toFixed(2)
  return '$' + v.toFixed(4)
}

async function sendSignalAlert({ symbol, interval, overall, score, entry, tp, sl, rr, fromAtr, isTest }) {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return { ok: false, error: 'TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados' }

  const isLong  = overall.includes('COMPRA')
  const emoji   = isLong ? '🟢' : '🔴'
  const rrColor = rr >= 2 ? '🟢' : rr >= 1.2 ? '🟡' : '🔴'
  const srcTag  = fromAtr ? ' <i>(ATR)</i>' : ' <i>(S/R)</i>'

  const text = [
    isTest ? `🔔 <b>MENSAJE DE PRUEBA</b>` : null,
    `${emoji} <b>${overall.replace(/_/g, ' ')}</b> — ${symbol.replace('USDT', '/USDT')} ${interval}`,
    ``,
    `💰 Entrada: <code>${fmtPrice(entry)}</code>`,
    `🎯 Objetivo: <code>${fmtPrice(tp)}</code>`,
    `🛑 Stop:    <code>${fmtPrice(sl)}</code>`,
    `📊 R/R: <b>${rr}</b> ${rrColor}${srcTag}`,
    ``,
    `<i>⚡ Señal confirmada en 2 temporalidades</i>`,
  ].filter(Boolean).join('\n')

  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { chat_id: chatId, text, parse_mode: 'HTML' },
      { timeout: 8000 }
    )
    return { ok: true, data: res.data }
  } catch (err) {
    console.error('Telegram error:', err.message)
    return { ok: false, error: err.message }
  }
}

module.exports = { sendSignalAlert }
