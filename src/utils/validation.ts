import Decimal from 'decimal.js';
import type { Market } from '../types/market';

export function normalizeSymbol(market: Market, value: string): string {
  const clean = value.trim().toUpperCase().replace(/\.(HK|SH|SZ|BJ|US)$/i, '');
  if (market === 'HK') return clean.replace(/\D/g, '').padStart(5, '0');
  if (market === 'US') return clean.replace(/[^A-Z.-]/g, '');
  return clean.replace(/\D/g, '').padStart(6, '0');
}

export function validateSymbol(market: Market, value: string): string | null {
  const symbol = normalizeSymbol(market, value);
  if (market === 'HK' && !/^\d{5}$/.test(symbol)) return '港股代码应为 1 至 5 位数字';
  if (market !== 'HK' && market !== 'US' && !/^\d{6}$/.test(symbol)) return 'A 股代码应为 6 位数字';
  if (market === 'US' && !/^[A-Z][A-Z.-]{0,9}$/.test(symbol)) return '美股代码格式不正确';
  return null;
}

export function validateDecimal(
  value: string,
  options: { allowZero: boolean; maxDecimals: number; label: string },
): string | null {
  if (value.trim() === '') return null;
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return `${options.label}应为有效数字`;
  const decimal = new Decimal(value);
  if (decimal.isNegative() || (!options.allowZero && decimal.isZero())) {
    return `${options.label}${options.allowZero ? '不能为负数' : '必须大于 0'}`;
  }
  const fraction = value.split('.')[1]?.length ?? 0;
  if (fraction > options.maxDecimals) return `${options.label}最多 ${options.maxDecimals} 位小数`;
  return null;
}
