import { QUOTES_COINGECKO_ID_MAP, QUOTES_CRYPTOCOMPARE_SYMBOL_MAP } from '../env.js';
import { invertRate } from './quotes-normalizer.js';

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function toUnixSec(isoDate, endOfDay = false) {
  const suffix = endOfDay ? 'T23:59:59Z' : 'T00:00:00Z';
  return Math.floor(new Date(isoDate + suffix).getTime() / 1000);
}

function toUnixMs(isoDate, endOfDay = false) {
  return toUnixSec(isoDate, endOfDay) * 1000;
}

export async function coinGeckoFetch(ticker, fromISO, toISO) {
  const cgId = QUOTES_COINGECKO_ID_MAP[ticker];
  if (!cgId) return {};

  const from = toUnixSec(fromISO);
  const to = toUnixSec(toISO, true);
  const url = `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!res.ok) throw httpError(`CoinGecko HTTP ${res.status} for ${cgId}`, res.status);

  const json = await res.json();
  if (!json.prices) return {};

  const result = {};
  for (const [ts, price] of json.prices) {
    result[new Date(ts).toISOString().substring(0, 10)] = price;
  }
  return result;
}

export async function cryptoCompareFetch(ticker, fromISO, toISO) {
  const symbol = QUOTES_CRYPTOCOMPARE_SYMBOL_MAP[ticker] ?? ticker;
  const days = Math.ceil((new Date(toISO) - new Date(fromISO)) / 86400000) + 1;
  const toTs = toUnixSec(toISO, true);
  const url = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${symbol}&tsym=USD&limit=${days}&toTs=${toTs}`;

  const res = await fetch(url);

  if (!res.ok) throw httpError(`CryptoCompare HTTP ${res.status} for ${symbol}`, res.status);

  const json = await res.json();
  if (json.Response !== 'Success' || !json.Data?.Data) return {};

  const result = {};
  for (const entry of json.Data.Data) {
    if (!entry.close) continue;
    const dateISO = new Date(entry.time * 1000).toISOString().substring(0, 10);
    if (dateISO < fromISO || dateISO > toISO) continue;
    result[dateISO] = entry.close;
  }
  return result;
}

export async function yahooFetch(symbol, fromISO, toISO) {
  const period1 = toUnixSec(fromISO);
  const period2 = toUnixSec(toISO, true);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

  if (!res.ok) throw httpError(`Yahoo Finance HTTP ${res.status} for ${symbol}`, res.status);

  const json = await res.json();
  const timestamps = json?.chart?.result?.[0]?.timestamp;
  const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if (!timestamps || !closes) return {};

  const result = {};
  for (let i = 0; i < timestamps.length; i++) {
    const raw = closes[i];
    if (raw == null) continue;
    result[new Date(timestamps[i] * 1000).toISOString().substring(0, 10)] = raw;
  }
  return result;
}

export async function binanceFetch(ticker, fromISO, toISO) {
  const symbol = `${ticker}USDT`;
  const startTime = toUnixMs(fromISO);
  const endTime = toUnixMs(toISO, true);
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=100`;

  const res = await fetch(url);

  if (!res.ok) throw httpError(`Binance HTTP ${res.status} for ${symbol}`, res.status);

  const json = await res.json();
  if (!Array.isArray(json)) return {};

  const result = {};
  for (const kline of json) {
    const close = parseFloat(kline[4]);
    if (!close) continue;
    result[new Date(kline[0]).toISOString().substring(0, 10)] = close;
  }
  return result;
}

export async function frankfurterFetch(ticker, fromISO, toISO) {
  const url = `https://api.frankfurter.dev/v1/${fromISO}..${toISO}?from=USD&to=${ticker}`;

  const res = await fetch(url);

  if (!res.ok) throw httpError(`Frankfurter HTTP ${res.status} for ${ticker}`, res.status);

  const json = await res.json();
  if (!json.rates) return {};

  const result = {};
  for (const [date, rateObj] of Object.entries(json.rates)) {
    const raw = rateObj[ticker];
    if (raw == null) continue;
    const value = ticker === 'EUR' ? raw : invertRate(raw);
    if (value == null) continue;
    result[date] = value;
  }
  return result;
}

export async function exchangeRateHostFetch(ticker, fromISO, toISO) {
  const url = `https://api.exchangerate.host/timeseries?base=USD&symbols=${ticker}&start_date=${fromISO}&end_date=${toISO}`;

  const res = await fetch(url);

  if (!res.ok) throw httpError(`exchangerate.host HTTP ${res.status} for ${ticker}`, res.status);

  const json = await res.json();
  if (!json.rates) return {};

  const result = {};
  for (const [date, rateObj] of Object.entries(json.rates)) {
    const usdPerTicker = rateObj[ticker];
    if (usdPerTicker == null) continue;
    const value = ticker === 'EUR' ? usdPerTicker : invertRate(usdPerTicker);
    if (value == null) continue;
    result[date] = value;
  }
  return result;
}

export async function moexHistoryPages(url) {
  let start = 0;
  const allRows = [];

  while (true) {
    const paginatedUrl = `${url}&start=${start}`;
    const res = await fetch(paginatedUrl);

    if (!res.ok) {
      if (res.status === 404) return null;
      throw httpError(`MOEX ISS HTTP ${res.status}`, res.status);
    }

    const json = await res.json();
    const history = json?.history;
    if (!history) return null;

    const columns = history.columns;
    const data = history.data;
    if (!data || data.length === 0) break;

    const dateIdx = columns.indexOf('TRADEDATE');
    const closeIdx = columns.indexOf('CLOSE');

    for (const row of data) {
      const date = row[dateIdx];
      const close = row[closeIdx];
      if (date && close != null) allRows.push({ date, close });
    }

    if (data.length < 100) break;
    start += 100;
  }

  return allRows;
}
