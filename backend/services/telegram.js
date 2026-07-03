const axios = require('axios')

function fmtPrice(v) {
  if (v == null) return '—'
  if (v >= 10000) return '$' + Math.round(v).toLocaleString('en-US')
  if (v >= 1)     return '$' + v.toFixed(2)
  return '$' + v.toFixed(4)
}

async function sendSignalAlert({ symbol, interval, overall, score, entry, tp, sl, rr, context, isTest }) {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return { ok: false, error: 'TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados' }

  const isLong   = overall?.includes('COMPRA')
  const emoji    = isLong ? '🟢' : '🔴'
  const rrColor  = rr >= 2 ? '🟢' : rr >= 1.2 ? '🟡' : '🔴'
  const scoreBar = '⭐'.repeat(score || 0)

  const text = [
    isTest ? `🔔 <b>MENSAJE DE PRUEBA</b>` : null,
    `${emoji} <b>${(overall || '').replace(/_/g, ' ')}</b> — ${(symbol || '').replace('USDT', '/USDT')} ${interval}`,
    ``,
    `💰 Entrada: <code>${fmtPrice(entry)}</code>`,
    tp ? `🎯 Objetivo: <code>${fmtPrice(tp)}</code>` : null,
    sl ? `🛑 Stop:    <code>${fmtPrice(sl)}</code>` : null,
    rr ? `📊 R/R: <b>${rr}</b> ${rrColor}` : null,
    score ? `🔥 Score: <b>${score}/5</b> ${scoreBar}` : null,
    context ? `\n📐 <i>${context}</i>` : null,
  ].filter(Boolean).join('\n')

  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { chat_id: chatId, text, parse_mode: 'HTML' },
      { timeout: 8000 }
    )
    return { ok: true, data: res.data }
  } catch (err) {
    // Devolver el error completo de Telegram para facilitar diagnóstico
    const telegramError = err.response?.data || err.message
    console.error('Telegram error:', telegramError)
    return { ok: false, error: telegramError }
  }
}

module.exports = { sendSignalAlert }
