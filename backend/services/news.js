const axios = require('axios');

const CURRENCY_MAP = {
  BTCUSDT: 'BTC',  ETHUSDT: 'ETH',  SOLUSDT: 'SOL',
  BNBUSDT: 'BNB',  XRPUSDT: 'XRP',  ADAUSDT: 'ADA',
  DOGEUSDT: 'DOGE', AVAXUSDT: 'AVAX', DOTUSDT: 'DOT', LINKUSDT: 'LINK',
};

// Cache de 5 minutos por símbolo para no superar límites de la API
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function sentimentLabel(pos, neg) {
  const total = pos + neg;
  if (total < 2) return 'NEUTRAL';
  const ratio = (pos - neg) / total;
  if (ratio > 0.35) return 'POSITIVO';
  if (ratio < -0.35) return 'NEGATIVO';
  return 'NEUTRAL';
}

async function getNewsSentiment(symbol) {
  const token = process.env.CRYPTOPANIC_TOKEN;
  if (!token) return { score: 0, signal: 'NEUTRAL', news: [], available: false };

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const currency = CURRENCY_MAP[symbol] || symbol.replace('USDT', '');

  try {
    const { data } = await axios.get('https://cryptopanic.com/api/v1/posts/', {
      params: { auth_token: token, currencies: currency, public: true, kind: 'news' },
      timeout: 8000,
    });

    const posts = data.results || [];

    // Puntaje ponderado por votos y engagement
    let weightedScore = 0, totalWeight = 0;
    for (const post of posts.slice(0, 20)) {
      const pos = post.votes?.positive || 0;
      const neg = post.votes?.negative || 0;
      const total = pos + neg;
      if (total < 2) continue;
      const weight = Math.log(total + 1);
      weightedScore += ((pos - neg) / total) * weight;
      totalWeight += weight;
    }

    const normalized = totalWeight > 0 ? weightedScore / totalWeight : 0;
    let score = 0, signal = 'NEUTRAL';
    if (normalized > 0.35)  { score = 1;  signal = 'POSITIVO'; }
    if (normalized < -0.35) { score = -1; signal = 'NEGATIVO'; }

    const news = posts.slice(0, 8).map(p => ({
      id:        p.id,
      title:     p.title,
      url:       p.url,
      source:    p.source?.title || 'Desconocido',
      published: p.published_at,
      votes: {
        positive: p.votes?.positive || 0,
        negative: p.votes?.negative || 0,
      },
      sentiment: sentimentLabel(p.votes?.positive || 0, p.votes?.negative || 0),
    }));

    const result = { score, signal, sentiment: +normalized.toFixed(2), news, available: true };
    cache.set(symbol, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    console.error('CryptoPanic error:', err.message);
    return { score: 0, signal: 'NEUTRAL', news: [], available: false };
  }
}

module.exports = { getNewsSentiment };
