export type Market = 'HK' | 'SH' | 'SZ' | 'BJ' | 'US';

export interface SecurityInfo {
  securityKey: string;
  market: Market;
  exchange: string;
  symbol: string;
  name: string;
  currency: string;
  timezone: string;
  providerSecurityId: string;
  priceDecimals: number;
}

export interface WatchlistItem extends SecurityInfo {
  alias: string;
  note: string;
  manualAnnualDividendPerShare: string | null;
  dividendUpdatedAt: string | null;
  averageBuyPrice: string | null;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRecord {
  id: string;
  securityKey: string;
  purchasedAt: string;
  buyPrice: string;
  annualDividendPerShare: string | null;
  dividendYield: string | null;
  source: 'WATCHLIST' | 'MANUAL';
  createdAt: string;
}

export type TradeStatus = 'TRADING' | 'CLOSED' | 'SUSPENDED' | 'UNKNOWN';

export interface Quote {
  securityKey: string;
  currentPrice: string;
  previousClose: string;
  changeAmount: string;
  changePercent: string;
  open: string | null;
  high: string | null;
  low: string | null;
  tradeStatus: TradeStatus;
  quoteTime: string;
  receivedAt: string;
  provider: string;
}

export interface PriceBar {
  id: string;
  securityKey: string;
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  amount: string;
  adjusted: 'forward';
  provider: string;
}

export interface Bands {
  upper: string;
  middle: string;
  lower: string;
  sampleCount: number;
}

export interface BandPosition {
  percent: string;
  label: string;
  segmentProgress: string | null;
}

export interface IndicatorSnapshot {
  securityKey: string;
  daily: Bands | null;
  weekly: Bands | null;
  monthlyMiddle: string | null;
  dailyPosition: BandPosition | null;
  weeklyPosition: BandPosition | null;
  dailySampleCount: number;
  weeklySampleCount: number;
  monthlySampleCount: number;
  intradayEstimate: boolean;
  calculatedAt: string;
  algorithmVersion: number;
}

export type QuoteFreshness = 'LIVE' | 'DELAYED' | 'EXPIRED' | 'CLOSED' | 'ERROR';

export interface MarketDataProvider {
  readonly id: string;
  readonly name: string;
  resolveSecurity(market: Market, symbol: string, signal?: AbortSignal): Promise<SecurityInfo>;
  getQuotes(securities: SecurityInfo[], signal?: AbortSignal): Promise<Quote[]>;
  getDailyBars(security: SecurityInfo, signal?: AbortSignal): Promise<PriceBar[]>;
}
