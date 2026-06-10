const axios = require('axios');

// Cache de 15 minutos (el índice se actualiza una vez por día)
const CACHE_KEY = 'fng';
const CACHE_TTL = 15 * 60 * 1000;
let cached = null;

const LABELS_ES = {
  'Extreme Fear': 'Miedo Extremo',
  'Fear':         'Miedo',
  'Neutral':      'Neutral',
  'Greed':        'Codicia',
  'Extreme Greed':'Codicia Extrema',
};

async function getMarketSentiment() {
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const { data } = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 8000 });
    const item  = data.data[0];
    const value = parseInt(item.value, 10);
    const labelEn = item.value_classification;
    const labelEs = LABELS_ES[labelEn] || labelEn;

    // Indicador contrario: miedo extremo = oportunidad de compra, codicia extrema = señal de venta
    let score = 0, signal = 'NEUTRAL';
    if      (value <= 30) { score =  1; signal = 'POSITIVO'; }
    else if (value >= 70) { score = -1; signal = 'NEGATIVO'; }

    const result = { score, signal, value, label: labelEs, available: true };
    cached = { data: result, ts: Date.now() };
    return result;
  } catch (err) {
    console.error('Fear & Greed error:', err.message);
    return { score: 0, signal: 'NEUTRAL', value: null, label: null, available: false };
  }
}

module.exports = { getMarketSentiment };
