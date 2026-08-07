import Decimal from 'decimal.js';
import type { Market, MarketDataProvider, PriceBar, Quote, SecurityInfo, TradeStatus } from '../types/market';
import { normalizeSymbol, validateSymbol } from '../utils/validation';

const QUOTE_BASE = 'https://push2.eastmoney.com/api/qt/ulist.np/get';
const KLINE_BASE = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';

const MARKET_INFO: Record<Market, { exchange: string; currency: string; timezone: string; ids: number[] }> = {
  HK: { exchange: 'HKEX', currency: 'HKD', timezone: 'Asia/Hong_Kong', ids: [116] },
  SH: { exchange: 'SSE', currency: 'CNY', timezone: 'Asia/Shanghai', ids: [1] },
  SZ: { exchange: 'SZSE', currency: 'CNY', timezone: 'Asia/Shanghai', ids: [0] },
  BJ: { exchange: 'BSE', currency: 'CNY', timezone: 'Asia/Shanghai', ids: [0] },
  US: { exchange: 'US', currency: 'USD', timezone: 'America/New_York', ids: [105, 106, 107] },
};

interface EastmoneyDiff {
  f2: number | string;
  f3: number | string;
  f4: number | string;
  f12: string;
  f13: number;
  f14: string;
  f15: number | string;
  f16: number | string;
  f17: number | string;
  f18: number | string;
  f124: number;
}

interface ListResponse {
  rc: number;
  data: { diff: EastmoneyDiff[] | Record<string, EastmoneyDiff> } | null;
}

interface KlineResponse {
  rc: number;
  data: { code: string; name: string; klines: string[] } | null;
}

function asDecimal(value: number | string): string {
  if (value === '-' || value == null) throw new Error('东方财富返回了缺失价格');
  return new Decimal(value).toString();
}

function toDiffArray(diff: ListResponse['data'] extends infer T ? EastmoneyDiff[] | Record<string, EastmoneyDiff> : never): EastmoneyDiff[] {
  return Array.isArray(diff) ? diff : Object.values(diff);
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 10_000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const isNodeRuntime = typeof navigator === 'undefined' || navigator.userAgent.startsWith('Node.js/');
    const headers = isNodeRuntime
      ? { 'User-Agent': 'Mozilla/5.0' }
      : undefined;
    let response: Response | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetch(url, { signal: controller.signal, credentials: 'omit', headers });
        break;
      } catch (error) {
        lastError = error;
        if (controller.signal.aborted) throw error;
        if (attempt === 0) await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
      }
    }
    if (!response) throw lastError;
    if (!response.ok) throw new Error(`东方财富请求失败（HTTP ${response.status}）`);
    return (await response.json()) as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('东方财富请求超时或已取消');
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function isTrading(market: Market, timestamp: number): TradeStatus {
  const timezone = MARKET_INFO[market].timezone;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp * 1000));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  if (['Sat', 'Sun'].includes(get('weekday'))) return 'CLOSED';
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  if (market === 'HK') return (minutes >= 570 && minutes < 720) || (minutes >= 780 && minutes < 960) ? 'TRADING' : 'CLOSED';
  if (market === 'US') return minutes >= 570 && minutes < 960 ? 'TRADING' : 'CLOSED';
  return (minutes >= 570 && minutes < 690) || (minutes >= 780 && minutes < 900) ? 'TRADING' : 'CLOSED';
}

function buildQuoteUrl(ids: string[]): string {
  const params = new URLSearchParams({
    fltt: '2',
    secids: ids.join(','),
    fields: 'f2,f3,f4,f12,f13,f14,f15,f16,f17,f18,f124',
  });
  return `${QUOTE_BASE}?${params}`;
}

export class EastmoneyMarketDataProvider implements MarketDataProvider {
  readonly id = 'eastmoney';
  readonly name = '东方财富（公开网页接口）';

  async resolveSecurity(market: Market, input: string, signal?: AbortSignal): Promise<SecurityInfo> {
    const validationError = validateSymbol(market, input);
    if (validationError) throw new Error(validationError);
    const symbol = normalizeSymbol(market, input);
    const info = MARKET_INFO[market];
    const candidateIds = info.ids.map((id) => `${id}.${symbol}`);
    const response = await fetchJson<ListResponse>(buildQuoteUrl(candidateIds), signal);
    if (response.rc !== 0 || !response.data) throw new Error(`未找到 ${symbol}，请检查市场和代码`);
    const candidates = toDiffArray(response.data.diff);
    const match = candidates.find((item) => item.f12 === symbol && item.f14 && item.f2 !== '-');
    if (!match) throw new Error(`未找到 ${symbol}，请检查市场和代码`);
    const exchange = market === 'US' ? `US-${match.f13}` : info.exchange;

    return {
      securityKey: `${exchange}:${symbol}`,
      market,
      exchange,
      symbol,
      name: match.f14,
      currency: info.currency,
      timezone: info.timezone,
      providerSecurityId: `${match.f13}.${symbol}`,
      priceDecimals: market === 'HK' ? 3 : 2,
    };
  }

  async getQuotes(securities: SecurityInfo[], signal?: AbortSignal): Promise<Quote[]> {
    if (securities.length === 0) return [];
    const byProviderId = new Map(securities.map((security) => [security.providerSecurityId, security]));
    const response = await fetchJson<ListResponse>(buildQuoteUrl([...byProviderId.keys()]), signal);
    if (response.rc !== 0 || !response.data) throw new Error('东方财富未返回行情数据');
    const receivedAt = new Date().toISOString();

    return toDiffArray(response.data.diff).flatMap((item) => {
      const providerId = `${item.f13}.${item.f12}`;
      const security = byProviderId.get(providerId);
      if (!security || item.f2 === '-') return [];
      const quoteTime = new Date(item.f124 * 1000).toISOString();
      return [{
        securityKey: security.securityKey,
        currentPrice: asDecimal(item.f2),
        previousClose: asDecimal(item.f18),
        changeAmount: asDecimal(item.f4),
        changePercent: asDecimal(item.f3),
        open: item.f17 === '-' ? null : asDecimal(item.f17),
        high: item.f15 === '-' ? null : asDecimal(item.f15),
        low: item.f16 === '-' ? null : asDecimal(item.f16),
        tradeStatus: isTrading(security.market, item.f124),
        quoteTime,
        receivedAt,
        provider: this.name,
      } satisfies Quote];
    });
  }

  async getDailyBars(security: SecurityInfo, signal?: AbortSignal): Promise<PriceBar[]> {
    const params = new URLSearchParams({
      secid: security.providerSecurityId,
      klt: '101',
      fqt: '1',
      lmt: '500',
      end: '20500101',
      fields1: 'f1,f2,f3,f4,f5,f6',
      fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
    });
    const response = await fetchJson<KlineResponse>(`${KLINE_BASE}?${params}`, signal);
    if (response.rc !== 0 || !response.data?.klines) throw new Error(`${security.symbol} 的历史行情不可用`);

    return response.data.klines.map((line) => {
      const [date, open, close, high, low, volume, amount] = line.split(',');
      return {
        id: `${security.securityKey}:${date}`,
        securityKey: security.securityKey,
        date,
        open,
        high,
        low,
        close,
        volume,
        amount,
        adjusted: 'forward',
        provider: this.name,
      };
    });
  }
}

export const eastmoneyProvider = new EastmoneyMarketDataProvider();
