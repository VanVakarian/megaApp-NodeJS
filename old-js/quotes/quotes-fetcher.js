import {
  QUOTES_FRANKFURTER_SUPPORTED,
  QUOTES_YAHOO_CURRENCY_INVERT,
  QUOTES_YAHOO_CURRENCY_SYMBOL_MAP,
} from '../env.js';
import { bondRubToUsd, getRubUsdRate, rubToUsd } from './quotes-normalizer.js';
import {
  binanceFetch,
  coinGeckoFetch,
  cryptoCompareFetch,
  exchangeRateHostFetch,
  frankfurterFetch,
  moexHistoryPages,
  yahooFetch,
} from './quotes-sources.js';

const MOEX_BOARDS = { STOCK: 'TQBR', ETF: 'TQTF', BOND: 'TQOB' };

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTickerWithFallbacks(label, sources, retryConfig) {
  let hadErrors = false;
  for (const { name, fn } of sources) {
    for (let attempt = 1; attempt <= retryConfig.attempts; attempt++) {
      try {
        const data = await fn();
        if (Object.keys(data).length > 0) return { data };
        break;
      } catch (err) {
        hadErrors = true;
        const is429 = err.status === 429;
        const isTransient = !err.status || is429 || err.status >= 500;
        if (!isTransient) break;
        if (is429) break;
        if (attempt < retryConfig.attempts) await sleep(retryConfig.delayMs);
      }
    }
  }
  return { data: null, hadErrors };
}

export async function fetchCurrencies(tickers, fromISO, toISO, retryConfig) {
  const results = {};
  const errored = [];

  for (const ticker of tickers) {
    const yahooSymbol = QUOTES_YAHOO_CURRENCY_SYMBOL_MAP[ticker];
    const shouldInvert = QUOTES_YAHOO_CURRENCY_INVERT.includes(ticker);

    const sources = [];

    if (yahooSymbol) {
      sources.push({
        name: 'yahoo',
        fn: async () => {
          const raw = await yahooFetch(yahooSymbol, fromISO, toISO);
          const out = {};
          for (const [date, value] of Object.entries(raw)) {
            const v = shouldInvert ? (value ? 1 / value : null) : value;
            if (v != null) out[date] = v;
          }
          return out;
        },
      });
    }

    if (QUOTES_FRANKFURTER_SUPPORTED.includes(ticker)) {
      sources.push({ name: 'frankfurter', fn: () => frankfurterFetch(ticker, fromISO, toISO) });
    }

    sources.push({ name: 'exchangeRateHost', fn: () => exchangeRateHostFetch(ticker, fromISO, toISO) });

    const { data, hadErrors } = await fetchTickerWithFallbacks(ticker, sources, retryConfig);

    if (data) {
      for (const [date, value] of Object.entries(data)) {
        if (!results[date]) results[date] = {};
        results[date][ticker] = value;
      }
    } else if (hadErrors) {
      errored.push(ticker);
    }
  }

  return { results, errored };
}

export async function fetchCrypto(assets, fromISO, toISO, retryConfig) {
  const results = {};
  const errored = [];

  for (const asset of assets) {
    const { ticker } = asset;

    const sources = [
      { name: 'coinGecko', fn: () => coinGeckoFetch(ticker, fromISO, toISO) },
      { name: 'cryptoCompare', fn: () => cryptoCompareFetch(ticker, fromISO, toISO) },
      { name: 'yahoo', fn: () => yahooFetch(`${ticker}-USD`, fromISO, toISO) },
      { name: 'binance', fn: () => binanceFetch(ticker, fromISO, toISO) },
    ];

    const { data, hadErrors } = await fetchTickerWithFallbacks(ticker, sources, retryConfig);

    if (data) {
      for (const [date, value] of Object.entries(data)) {
        if (!results[date]) results[date] = {};
        results[date][ticker] = value;
      }
    } else if (hadErrors) {
      errored.push(ticker);
    }
  }

  return { results, errored };
}

export async function fetchStocks(assets, fromISO, toISO, retryConfig, ratesMap) {
  const results = {};
  const errored = [];

  for (const asset of assets) {
    const { ticker } = asset;

    const fetchFromMoex = async () => {
      const baseUrl = `https://iss.moex.com/iss/history/engines/stock/markets/shares/securities/${ticker}.json?from=${fromISO}&till=${toISO}&limit=100`;

      for (const board of [MOEX_BOARDS.STOCK, MOEX_BOARDS.ETF]) {
        const rows = await moexHistoryPages(`${baseUrl}&boardid=${board}`);
        if (rows && rows.length > 0) {
          const out = {};
          for (const { date, close } of rows) {
            const rubUsd = getRubUsdRate(ratesMap[date]);
            if (!rubUsd) continue;
            const value = rubToUsd(close, rubUsd);
            if (value != null) out[date] = value;
          }
          return out;
        }
      }
      return {};
    };

    const sources = [{ name: 'moex', fn: fetchFromMoex }];
    const { data, hadErrors } = await fetchTickerWithFallbacks(ticker, sources, retryConfig);

    if (data) {
      for (const [date, value] of Object.entries(data)) {
        if (!results[date]) results[date] = {};
        results[date][ticker] = value;
      }
    } else if (hadErrors) {
      errored.push(ticker);
    }
  }

  return { results, errored };
}

export async function fetchBonds(assets, fromISO, toISO, retryConfig, ratesMap) {
  const results = {};
  const errored = [];

  for (const asset of assets) {
    const { ticker } = asset;

    const fetchFromMoex = async () => {
      const url = `https://iss.moex.com/iss/history/engines/stock/markets/bonds/securities/${ticker}.json?from=${fromISO}&till=${toISO}&limit=100&boardid=${MOEX_BOARDS.BOND}`;
      const rows = await moexHistoryPages(url);
      if (!rows || rows.length === 0) return {};

      const out = {};
      for (const { date, close } of rows) {
        const rubUsd = getRubUsdRate(ratesMap[date]);
        if (!rubUsd) continue;
        const value = bondRubToUsd(close, rubUsd);
        if (value != null) out[date] = value;
      }
      return out;
    };

    const sources = [{ name: 'moex', fn: fetchFromMoex }];
    const { data, hadErrors } = await fetchTickerWithFallbacks(ticker, sources, retryConfig);

    if (data) {
      for (const [date, value] of Object.entries(data)) {
        if (!results[date]) results[date] = {};
        results[date][ticker] = value;
      }
    } else if (hadErrors) {
      errored.push(ticker);
    }
  }

  return { results, errored };
}
