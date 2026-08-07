import Decimal from 'decimal.js';
import type { Market, Quote, QuoteFreshness } from '../types/market';
import type { AppSettings } from '../types/settings';

export function formatPrice(value: string | null | undefined, decimals = 3): string {
  if (value == null || value === '') return '--';
  return new Decimal(value).toFixed(decimals);
}

export function formatPercent(value: string | null | undefined, decimals = 2): string {
  if (value == null || value === '') return '--';
  const decimal = new Decimal(value);
  return `${decimal.greaterThan(0) ? '+' : ''}${decimal.toFixed(decimals)}%`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function marketLabel(market: Market): string {
  return { HK: '港股', SH: '沪市', SZ: '深市', BJ: '北交所', US: '美股' }[market];
}

export function getQuoteFreshness(quote: Quote | undefined, settings: AppSettings): QuoteFreshness {
  if (!quote) return 'ERROR';
  if (quote.tradeStatus === 'CLOSED' || quote.tradeStatus === 'SUSPENDED') return 'CLOSED';
  const ageSeconds = Math.max(0, (Date.now() - new Date(quote.quoteTime).getTime()) / 1000);
  if (ageSeconds > settings.expiredAfterSeconds) return 'EXPIRED';
  if (ageSeconds > settings.staleAfterSeconds) return 'DELAYED';
  return 'LIVE';
}

export const FRESHNESS_LABEL: Record<QuoteFreshness, string> = {
  LIVE: '实时',
  DELAYED: '延迟',
  EXPIRED: '过期',
  CLOSED: '休市',
  ERROR: '更新失败',
};
