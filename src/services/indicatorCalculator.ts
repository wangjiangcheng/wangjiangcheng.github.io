import Decimal from 'decimal.js';
import type { BandPosition, Bands, IndicatorSnapshot, PriceBar } from '../types/market';

function calculateBands(values: string[], periods: number, multiplier: number): Bands | null {
  if (values.length < periods) return null;
  const sample = values.slice(-periods).map((value) => new Decimal(value));
  const mean = Decimal.sum(...sample).div(periods);
  const variance = Decimal.sum(...sample.map((value) => value.minus(mean).pow(2))).div(periods);
  const deviation = variance.sqrt();

  return {
    upper: mean.plus(deviation.mul(multiplier)).toFixed(8),
    middle: mean.toFixed(8),
    lower: mean.minus(deviation.mul(multiplier)).toFixed(8),
    sampleCount: periods,
  };
}

function startOfWeek(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function aggregatePeriodCloses(bars: PriceBar[], period: 'week' | 'month'): string[] {
  const grouped = new Map<string, string>();
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  for (const bar of sorted) {
    const key = period === 'week' ? startOfWeek(bar.date) : bar.date.slice(0, 7);
    grouped.set(key, bar.close);
  }
  return [...grouped.values()];
}

export function calculatePosition(price: string | null, bands: Bands | null): BandPosition | null {
  if (!price || !bands) return null;
  const lower = new Decimal(bands.lower);
  const upper = new Decimal(bands.upper);
  const middle = new Decimal(bands.middle);
  if (upper.equals(lower)) return null;

  const current = new Decimal(price);
  const percent = current.minus(lower).div(upper.minus(lower)).mul(100);
  let label: string;
  let segmentProgress: string | null = null;

  if (percent.lessThan(0)) label = '下轨下方';
  else if (percent.equals(0)) label = '下轨';
  else if (current.lessThan(middle)) {
    label = '下→中';
    segmentProgress = percent.mul(2).toFixed(1);
  } else if (current.equals(middle)) label = '中轨';
  else if (current.lessThan(upper)) {
    label = '中→上';
    segmentProgress = percent.minus(50).mul(2).toFixed(1);
  } else if (current.equals(upper)) label = '上轨';
  else label = '上轨上方';

  return { percent: percent.toFixed(4), label, segmentProgress };
}

export function calculateIndicatorSnapshot(
  securityKey: string,
  bars: PriceBar[],
  currentPrice: string,
  periods: number,
  multiplier: number,
): IndicatorSnapshot {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const dailyCloses = sorted.map((bar) => bar.close);
  const weeklyCloses = aggregatePeriodCloses(sorted, 'week');
  const monthlyCloses = aggregatePeriodCloses(sorted, 'month');
  const daily = calculateBands(dailyCloses, periods, multiplier);
  const weekly = calculateBands(weeklyCloses, periods, multiplier);
  const monthly = calculateBands(monthlyCloses, periods, multiplier);

  return {
    securityKey,
    daily,
    weekly,
    monthlyMiddle: monthly?.middle ?? null,
    dailyPosition: calculatePosition(currentPrice, daily),
    weeklyPosition: calculatePosition(currentPrice, weekly),
    dailySampleCount: dailyCloses.length,
    weeklySampleCount: weeklyCloses.length,
    monthlySampleCount: monthlyCloses.length,
    intradayEstimate: true,
    calculatedAt: new Date().toISOString(),
    algorithmVersion: 1,
  };
}

export function calculateYield(dividend: string | null, price: string | null): string | null {
  if (dividend == null || price == null || new Decimal(price).isZero()) return null;
  return new Decimal(dividend).div(price).mul(100).toFixed(8);
}

export function calculateProfit(currentPrice: string | null, buyPrice: string | null): string | null {
  if (currentPrice == null || buyPrice == null || new Decimal(buyPrice).isZero()) return null;
  return new Decimal(currentPrice).minus(buyPrice).div(buyPrice).mul(100).toFixed(8);
}

export { calculateBands };
