import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PriceBar, Quote, SecurityInfo, WatchlistItem } from '../types/market';
import { DEFAULT_SETTINGS } from '../types/settings';
import { db } from './database';
import { eastmoneyProvider } from './eastmoneyProvider';
import { refreshHistoryData, refreshQuoteData } from './marketRefresh';

function item(index = 1): WatchlistItem {
  const symbol = String(index).padStart(5, '0');
  return {
    securityKey: `HKEX:${symbol}`,
    market: 'HK',
    exchange: 'HKEX',
    symbol,
    name: `测试 ${symbol}`,
    currency: 'HKD',
    timezone: 'Asia/Hong_Kong',
    providerSecurityId: `116.${symbol}`,
    priceDecimals: 3,
    alias: '',
    note: '',
    manualAnnualDividendPerShare: null,
    dividendUpdatedAt: null,
    averageBuyPrice: null,
    sortOrder: index,
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function quote(target: WatchlistItem): Quote {
  return {
    securityKey: target.securityKey,
    currentPrice: '50',
    previousClose: '49',
    changeAmount: '1',
    changePercent: '2.04',
    open: '49.5',
    high: '51',
    low: '49',
    tradeStatus: 'CLOSED',
    quoteTime: '2026-08-07T08:00:00.000Z',
    receivedAt: '2026-08-07T08:00:01.000Z',
    provider: 'test',
  };
}

function bars(target: SecurityInfo): PriceBar[] {
  return Array.from({ length: 120 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
    return {
      id: `${target.securityKey}:${date}`,
      securityKey: target.securityKey,
      date,
      open: String(40 + index / 10),
      high: String(41 + index / 10),
      low: String(39 + index / 10),
      close: String(40 + index / 10),
      volume: '1000',
      amount: '40000',
      adjusted: 'forward',
      provider: 'test',
    };
  });
}

describe('independent market refresh jobs', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.delete();
    await db.open();
  });

  it('does not request historical K lines during a quote refresh', async () => {
    const target = item();
    vi.spyOn(eastmoneyProvider, 'getQuotes').mockResolvedValue([quote(target)]);
    const historySpy = vi.spyOn(eastmoneyProvider, 'getDailyBars');

    const result = await refreshQuoteData([target], DEFAULT_SETTINGS);

    expect(historySpy).not.toHaveBeenCalled();
    expect(result.quotes).toHaveLength(1);
    expect(result.errors[target.securityKey]).toContain('等待独立刷新');
  });

  it('limits an independent history refresh to two concurrent requests', async () => {
    const targets = [item(1), item(2), item(3), item(4)];
    let active = 0;
    let maxActive = 0;
    vi.spyOn(eastmoneyProvider, 'getDailyBars').mockImplementation(async (target) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return bars(target);
    });

    const result = await refreshHistoryData(targets, DEFAULT_SETTINGS);

    expect(result.errors).toEqual({});
    expect(maxActive).toBe(2);
    expect(eastmoneyProvider.getDailyBars).toHaveBeenCalledTimes(4);
  });
});
