const axios = require('axios');

// api1/api2/api3 son clusters alternativos de Binance sin geo-block en US
const BASES = [
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api.binance.com',
]

async function tryBases(path, params) {
  let lastErr
  for (const base of BASES) {
    try {
      const { data } = await axios.get(`${base}${path}`, { params, timeout: 10000 })
      return data
    } catch (err) {
      lastErr = err
      if (err.response?.status !== 451 && err.response?.status !== 403) throw err
      // 451/403 = geo-block en este cluster, probar el siguiente
    }
  }
  throw lastErr
}

async function getKlines(symbol, interval, limit = 300) {
  const data = await tryBases('/api/v3/klines', { symbol, interval, limit })
  return data.map(k => ({
    time:   Math.floor(k[0] / 1000),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }))
}

async function getTicker(symbol) {
  const data = await tryBases('/api/v3/ticker/24hr', { symbol })
  return {
    price:  parseFloat(data.lastPrice),
    change: parseFloat(data.priceChangePercent),
    high:   parseFloat(data.highPrice),
    low:    parseFloat(data.lowPrice),
    volume: parseFloat(data.quoteVolume),
  }
}

module.exports = { getKlines, getTicker };
