const BASE = 'https://api.binance.com';

function parseKlines(raw) {
  return raw.map(k => ({
    time:   Math.floor(k[0] / 1000),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

export async function getKlines(symbol, interval, limit = 300) {
  const res = await fetch(
    `${BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );
  if (!res.ok) throw new Error('Binance klines error');
  return parseKlines(await res.json());
}

// Trae hasta totalCandles velas paginando de atrás hacia adelante
// Binance permite máximo 1000 por request
export async function getKlinesLarge(symbol, interval, totalCandles = 3000, onProgress) {
  const batchSize = 1000
  const numBatches = Math.ceil(totalCandles / batchSize)
  let all = []
  let endTime = null

  for (let b = 0; b < numBatches; b++) {
    let url = `${BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${batchSize}`
    if (endTime) url += `&endTime=${endTime}`

    const res = await fetch(url)
    if (!res.ok) break
    const raw = await res.json()
    if (!raw.length) break

    all = [...parseKlines(raw), ...all]
    endTime = raw[0][0] - 1          // justo antes de la vela más antigua

    if (onProgress) onProgress(Math.round(((b + 1) / numBatches) * 100))
    if (raw.length < batchSize) break // no hay más datos
  }

  return all.slice(-totalCandles)
}

export async function getTicker(symbol) {
  const res = await fetch(`${BASE}/api/v3/ticker/24hr?symbol=${symbol}`);
  if (!res.ok) throw new Error('Binance ticker error');
  const d = await res.json();
  return {
    price:  parseFloat(d.lastPrice),
    change: parseFloat(d.priceChangePercent),
    high:   parseFloat(d.highPrice),
    low:    parseFloat(d.lowPrice),
    volume: parseFloat(d.quoteVolume),
  };
}
