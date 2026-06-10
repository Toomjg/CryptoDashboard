const BASE = 'https://api.binance.com';

export async function getKlines(symbol, interval, limit = 300) {
  const res = await fetch(
    `${BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );
  if (!res.ok) throw new Error('Binance klines error');
  const data = await res.json();
  return data.map(k => ({
    time:   Math.floor(k[0] / 1000),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
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
