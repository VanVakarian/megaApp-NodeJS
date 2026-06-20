import * as dbMoney from '../db/db-money.js';
import { QUOTES_FETCH_DAYS, QUOTES_RETRY_ATTEMPTS, QUOTES_RETRY_DELAY_MS } from '../env.js';
import { fetchBonds, fetchCrypto, fetchCurrencies, fetchStocks } from './quotes-fetcher.js';

function buildDateRange() {
  const days = QUOTES_FETCH_DAYS ?? 7;
  const today = new Date();

  const toDate = new Date(today);
  toDate.setUTCDate(toDate.getUTCDate() - 1);
  const toISO = toDate.toISOString().substring(0, 10);

  const fromDate = new Date(today);
  fromDate.setUTCDate(fromDate.getUTCDate() - days);
  const fromISO = fromDate.toISOString().substring(0, 10);

  return { fromISO, toISO };
}

function mergeIntoMap(map, fetchedData) {
  for (const [date, tickers] of Object.entries(fetchedData)) {
    if (!map[date]) map[date] = {};
    for (const [ticker, value] of Object.entries(tickers)) {
      if (value != null && !isNaN(value)) {
        map[date][ticker] = value;
      }
    }
  }
}

export async function runDailyQuotesJob() {
  const retryConfig = {
    attempts: QUOTES_RETRY_ATTEMPTS ?? 3,
    delayMs: QUOTES_RETRY_DELAY_MS ?? 30000,
  };

  const startTime = Date.now();
  console.log('📈 Daily quotes job started');

  const { fromISO, toISO } = buildDateRange();

  const existingRows = await dbMoney.getRateHistoryRange(fromISO, toISO);
  const ratesMap = {};

  for (const row of existingRows) {
    try {
      ratesMap[row.dateISO] = typeof row.ratesJson === 'string' ? JSON.parse(row.ratesJson) : row.ratesJson;
    } catch {
      ratesMap[row.dateISO] = {};
    }
  }

  const errors = [];
  const fetched = {};

  const currencyTickers = await dbMoney.getAllCurrencyTickers();

  if (currencyTickers.length > 0) {
    const { results: currencyData, errored: currencyErrors } = await fetchCurrencies(
      currencyTickers,
      fromISO,
      toISO,
      retryConfig,
    );
    mergeIntoMap(ratesMap, currencyData);
    fetched.currencies = currencyTickers.length;
    errors.push(...currencyErrors.map((t) => `currency:${t}`));
  }

  const openAssets = await dbMoney.getOpenPositionAssets();
  const cryptoAssets = openAssets.filter((a) => a.type === 'crypto');
  const stockAssets = openAssets.filter((a) => a.type === 'stock');
  const bondAssets = openAssets.filter((a) => a.type === 'bond');

  if (cryptoAssets.length > 0) {
    const { results: cryptoData, errored: cryptoErrors } = await fetchCrypto(cryptoAssets, fromISO, toISO, retryConfig);
    mergeIntoMap(ratesMap, cryptoData);
    fetched.crypto = cryptoAssets.length;
    errors.push(...cryptoErrors.map((t) => `crypto:${t}`));
  }

  if (stockAssets.length > 0) {
    const { results: stockData, errored: stockErrors } = await fetchStocks(
      stockAssets,
      fromISO,
      toISO,
      retryConfig,
      ratesMap,
    );
    mergeIntoMap(ratesMap, stockData);
    fetched.stocks = stockAssets.length;
    errors.push(...stockErrors.map((t) => `stock:${t}`));
  }

  if (bondAssets.length > 0) {
    const { results: bondData, errored: bondErrors } = await fetchBonds(
      bondAssets,
      fromISO,
      toISO,
      retryConfig,
      ratesMap,
    );
    mergeIntoMap(ratesMap, bondData);
    fetched.bonds = bondAssets.length;
    errors.push(...bondErrors.map((t) => `bond:${t}`));
  }

  let upsertedCount = 0;
  for (const [date, rates] of Object.entries(ratesMap)) {
    if (Object.keys(rates).length === 0) continue;
    await dbMoney.upsertRateHistoryEntry(date, JSON.stringify(rates));
    upsertedCount++;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const statsStr = Object.entries(fetched)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  if (errors.length > 0) {
    console.warn(
      `⚠️ Daily quotes job completed in ${elapsed}s (${fromISO} → ${toISO}) — ${statsStr} — fetch errors: ${errors.join(', ')}`,
    );
  } else {
    console.log(`✅ Daily quotes job completed in ${elapsed}s (${fromISO} → ${toISO}) — ${statsStr}`);
  }

  return { upsertedCount, errors, fromISO, toISO };
}
