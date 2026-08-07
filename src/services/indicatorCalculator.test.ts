import { describe, expect, it } from 'vitest';
import type { Bands, PriceBar } from '../types/market';
import {
  aggregatePeriodCloses,
  calculateBands,
  calculatePosition,
  calculateProfit,
  calculateYield,
} from './indicatorCalculator';

function bars(closes: number[]): PriceBar[] {
  return closes.map((close, index) => ({
    id: `TEST:${index}`,
    securityKey: 'TEST:1',
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    open: String(close),
    high: String(close),
    low: String(close),
    close: String(close),
    volume: '0',
    amount: '0',
    adjusted: 'forward',
    provider: 'test',
  }));
}

describe('Bollinger calculations', () => {
  it('uses population standard deviation for a known 20-point sequence', () => {
    const result = calculateBands(Array.from({ length: 20 }, (_, index) => String(index + 1)), 20, 2);
    expect(result?.middle).toBe('10.50000000');
    expect(Number(result?.upper)).toBeCloseTo(22.03256259, 7);
    expect(Number(result?.lower)).toBeCloseTo(-1.03256259, 7);
  });

  it('returns an uncomputable position for a zero-width band', () => {
    const result = calculateBands(Array(20).fill('12.5'), 20, 2);
    expect(result).toEqual({ upper: '12.50000000', middle: '12.50000000', lower: '12.50000000', sampleCount: 20 });
    expect(calculatePosition('12.5', result)).toBeNull();
  });

  it.each([
    ['10', '0.0000', '下轨'],
    ['20', '50.0000', '中轨'],
    ['30', '100.0000', '上轨'],
    ['9', '-5.0000', '下轨下方'],
    ['31', '105.0000', '上轨上方'],
  ])('maps price %s to BB%% %s and %s', (price, percent, label) => {
    const sample: Bands = { lower: '10', middle: '20', upper: '30', sampleCount: 20 };
    expect(calculatePosition(price, sample)).toMatchObject({ percent, label });
  });

  it('keeps empty dividend distinct from an explicit zero', () => {
    expect(calculateYield(null, '20')).toBeNull();
    expect(calculateYield('0', '20')).toBe('0.00000000');
    expect(calculateYield('1', '20')).toBe('5.00000000');
    expect(calculateYield('1', '25')).toBe('4.00000000');
  });

  it('calculates price-only floating profit', () => {
    expect(calculateProfit('25', '20')).toBe('25.00000000');
    expect(calculateProfit('18', '20')).toBe('-10.00000000');
    expect(calculateProfit('18', null)).toBeNull();
  });

  it('aggregates the last close of each week and month', () => {
    const sample = bars([1, 2, 3, 4, 5, 6, 7]);
    expect(aggregatePeriodCloses(sample, 'week')).toEqual(['4', '7']);
    expect(aggregatePeriodCloses(sample, 'month')).toEqual(['7']);
  });
});
