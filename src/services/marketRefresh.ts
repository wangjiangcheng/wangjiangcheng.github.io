import Decimal from 'decimal.js';
import type { IndicatorSnapshot, PriceBar, Quote, WatchlistItem } from '../types/market';
import type { AppSettings } from '../types/settings';
import { calculateIndicatorSnapshot } from './indicatorCalculator';
import { eastmoneyProvider } from './eastmoneyProvider';
import { getBars, saveMarketSnapshot } from './database';

export interface RefreshResult {
  quotes: Quote[];
  indicators: IndicatorSnapshot[];
  durationMs: number;
  errors: Record<string, string>;
}

function quoteDate(quote: Quote, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(quote.quoteTime));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function applyLivePrice(bars: PriceBar[], item: WatchlistItem, quote: Quote): PriceBar[] {
  const date = quoteDate(quote, item.timezone);
  const copy = [...bars];
  const last = copy.at(-1);
  if (last?.date === date) {
    copy[copy.length - 1] = {
      ...last,
      close: quote.currentPrice,
      high: Decimal.max(last.high, quote.high ?? quote.currentPrice).toString(),
      low: Decimal.min(last.low, quote.low ?? quote.currentPrice).toString(),
    };
    return copy;
  }

  copy.push({
    id: `${item.securityKey}:${date}`,
    securityKey: item.securityKey,
    date,
    open: quote.open ?? quote.currentPrice,
    high: quote.high ?? quote.currentPrice,
    low: quote.low ?? quote.currentPrice,
    close: quote.currentPrice,
    volume: '0',
    amount: '0',
    adjusted: 'forward',
    provider: quote.provider,
  });
  return copy;
}

async function withRetry<T>(task: () => Promise<T>, retryCount: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < retryCount) await new Promise((resolve) => window.setTimeout(resolve, 350 * 2 ** attempt));
    }
  }
  throw lastError;
}

export async function refreshMarketData(
  items: WatchlistItem[],
  settings: AppSettings,
  signal?: AbortSignal,
): Promise<RefreshResult> {
  const startedAt = performance.now();
  const enabledItems = items.filter((item) => item.enabled);
  const quotes = await withRetry(
    () => eastmoneyProvider.getQuotes(enabledItems, signal),
    settings.retryCount,
  );
  const quoteMap = new Map(quotes.map((quote) => [quote.securityKey, quote]));
  const errors: Record<string, string> = {};
  const barsToSave: PriceBar[] = [];
  const indicators: IndicatorSnapshot[] = [];

  await Promise.all(enabledItems.map(async (item) => {
    const quote = quoteMap.get(item.securityKey);
    if (!quote) {
      errors[item.securityKey] = '本轮未返回该红绿行情';
      return;
    }
    try {
      let bars = await getBars(item.securityKey);
      if (bars.length < 120) {
        bars = await withRetry(() => eastmoneyProvider.getDailyBars(item, signal), settings.retryCount);
      }
      const liveBars = applyLivePrice(bars, item, quote);
      barsToSave.push(...liveBars.slice(-500));
      indicators.push(calculateIndicatorSnapshot(
        item.securityKey,
        liveBars,
        quote.currentPrice,
        settings.bollingerPeriods,
        settings.bollingerMultiplier,
      ));
    } catch (error) {
      errors[item.securityKey] = error instanceof Error ? error.message : '指标更新失败';
    }
  }));

  await saveMarketSnapshot(quotes, barsToSave, indicators);
  return { quotes, indicators, errors, durationMs: Math.round(performance.now() - startedAt) };
}
