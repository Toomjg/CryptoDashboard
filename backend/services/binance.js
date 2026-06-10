const axios = require('axios');

const BASE = 'https://api.binance.com';

async function getKlines(symbol, interval, limit = 300) {
  const { data } = await axios.get(`${BASE}/api/v3/klines`, {
    params: { symbol, interval, limit },
    timeout: 10000,
  });
  return data.map(k => ({
    time: Math.floor(k[0] / 1000),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

async function getTicker(symbol) {
  const { data } = await axios.get(`${BASE}/api/v3/ticker/24hr`, {
    params: { symbol },
    timeout: 5000,
  });
  return {
    price:  parseFloat(data.lastPrice),
    change: parseFloat(data.priceChangePercent),
    high:   parseFloat(data.highPrice),
    low:    parseFloat(data.lowPrice),
    volume: parseFloat(data.quoteVolume),
  };
}

module.exports = { getKlines, getTicker };
