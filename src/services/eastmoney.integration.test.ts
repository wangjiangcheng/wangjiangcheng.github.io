import { describe, expect, it } from 'vitest';
import { calculateIndicatorSnapshot } from './indicatorCalculator';
import { EastmoneyMarketDataProvider } from './eastmoneyProvider';

describe('Eastmoney real data acceptance', () => {
  it('resolves and loads valid quote, K lines and Bollinger data for 00001.HK', async () => {
    const provider = new EastmoneyMarketDataProvider();
    const security = await provider.resolveSecurity('HK', '00001');
    expect(security).toMatchObject({ symbol: '00001', market: 'HK', name: '长和', currency: 'HKD' });

    const [quote] = await provider.getQuotes([security]);
    const bars = await provider.getDailyBars(security);
    expect(Number(quote.currentPrice)).toBeGreaterThan(0);
    expect(bars.length).toBeGreaterThanOrEqual(200);
    expect(Math.abs(Number(bars.at(-1)?.close) - Number(quote.currentPrice))).toBeLessThan(2);

    const snapshot = calculateIndicatorSnapshot(security.securityKey, bars, quote.currentPrice, 20, 2);
    expect(snapshot.daily).not.toBeNull();
    expect(snapshot.weekly).not.toBeNull();
    expect(snapshot.monthlyMiddle).not.toBeNull();
    expect(snapshot.weeklyPosition).not.toBeNull();

    console.log(JSON.stringify({
      symbol: `${security.symbol}.${security.market}`,
      name: security.name,
      currency: security.currency,
      currentPrice: quote.currentPrice,
      quoteTime: quote.quoteTime,
      bars: bars.length,
      latestBar: bars.at(-1),
      dailyBands: snapshot.daily,
      weeklyBands: snapshot.weekly,
      monthlyMiddle: snapshot.monthlyMiddle,
    }, null, 2));
  }, 30_000);
});
