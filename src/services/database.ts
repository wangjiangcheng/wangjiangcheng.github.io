import Dexie, { type EntityTable } from 'dexie';
import Decimal from 'decimal.js';
import type { DiaryEntry, SaveDiaryEntryInput } from '../types/diary';
import type { IndicatorSnapshot, PriceBar, PurchaseRecord, Quote, WatchlistItem } from '../types/market';
import { DEFAULT_SETTINGS, type AppSettings } from '../types/settings';
import { calculateYield } from './indicatorCalculator';

class MarketDatabase extends Dexie {
  watchlist!: EntityTable<WatchlistItem, 'securityKey'>;
  quotes!: EntityTable<Quote, 'securityKey'>;
  priceBars!: EntityTable<PriceBar, 'id'>;
  indicatorSnapshots!: EntityTable<IndicatorSnapshot, 'securityKey'>;
  purchaseRecords!: EntityTable<PurchaseRecord, 'id'>;
  diaryEntries!: EntityTable<DiaryEntry, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;

  constructor() {
    super('money-from-everywhere');
    this.version(1).stores({
      watchlist: '&securityKey, market, symbol, sortOrder, enabled',
      quotes: '&securityKey, quoteTime',
      priceBars: '&id, securityKey, [securityKey+date], date',
      indicatorSnapshots: '&securityKey, calculatedAt',
      settings: '&id',
    });
    this.version(2).stores({
      watchlist: '&securityKey, market, symbol, sortOrder, enabled',
      quotes: '&securityKey, quoteTime',
      priceBars: '&id, securityKey, [securityKey+date], date',
      indicatorSnapshots: '&securityKey, calculatedAt',
      settings: '&id',
    }).upgrade(async (transaction) => {
      await transaction.table<AppSettings, 'main'>('settings').update('main', { hiddenColumns: [] });
    });
    this.version(3).stores({
      watchlist: '&securityKey, market, symbol, sortOrder, enabled',
      quotes: '&securityKey, quoteTime',
      priceBars: '&id, securityKey, [securityKey+date], date',
      indicatorSnapshots: '&securityKey, calculatedAt',
      purchaseRecords: '&id, securityKey, purchasedAt, [securityKey+purchasedAt]',
      settings: '&id',
    });
    this.version(4).stores({
      watchlist: '&securityKey, market, symbol, sortOrder, enabled',
      quotes: '&securityKey, quoteTime',
      priceBars: '&id, securityKey, [securityKey+date], date',
      indicatorSnapshots: '&securityKey, calculatedAt',
      purchaseRecords: '&id, securityKey, purchasedAt, [securityKey+purchasedAt]',
      diaryEntries: '&id, entryDate, updatedAt, [entryDate+updatedAt]',
      settings: '&id',
    });
  }
}

export const db = new MarketDatabase();

const SEED_ITEM: WatchlistItem = {
  securityKey: 'HKEX:00001',
  market: 'HK',
  exchange: 'HKEX',
  symbol: '00001',
  name: '长和',
  currency: 'HKD',
  timezone: 'Asia/Hong_Kong',
  providerSecurityId: '116.00001',
  priceDecimals: 3,
  alias: '验收样本',
  note: '首次启动示例，可编辑或删除。行情与指标均实时从东方财富获取。',
  manualAnnualDividendPerShare: null,
  dividendUpdatedAt: null,
  averageBuyPrice: null,
  sortOrder: 0,
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export async function initializeDatabase(): Promise<void> {
  const settings = await db.settings.get('main');
  if (!settings) {
    await db.transaction('rw', db.settings, db.watchlist, async () => {
      await db.settings.put(DEFAULT_SETTINGS);
      if (await db.watchlist.count() === 0) await db.watchlist.put(SEED_ITEM);
    });
  }
}

export async function getSettings(): Promise<AppSettings> {
  return (await db.settings.get('main')) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ ...settings, hasUnbackedChanges: true });
}

export async function listWatchlist(): Promise<WatchlistItem[]> {
  const sorted = await db.watchlist.orderBy('sortOrder').toArray();
  return sorted.filter((item) => item.enabled);
}

export async function upsertWatchlistItem(item: WatchlistItem): Promise<void> {
  const duplicate = await db.watchlist.get(item.securityKey);
  if (duplicate?.enabled && duplicate.securityKey === item.securityKey && duplicate.createdAt !== item.createdAt) {
    throw new Error('该红绿已在观察列表中');
  }
  await db.transaction('rw', db.watchlist, db.settings, async () => {
    await db.watchlist.put(item);
    await db.settings.update('main', { hasUnbackedChanges: true });
  });
}

export async function saveWatchlistOrder(securityKeys: string[]): Promise<void> {
  await db.transaction('rw', db.watchlist, db.settings, async () => {
    const enabledItems = (await db.watchlist.toArray()).filter((item) => item.enabled);
    const uniqueKeys = new Set(securityKeys);
    const enabledKeys = new Set(enabledItems.map((item) => item.securityKey));
    if (uniqueKeys.size !== securityKeys.length
      || securityKeys.length !== enabledItems.length
      || securityKeys.some((key) => !enabledKeys.has(key))) {
      throw new Error('观察列表顺序与当前数据不一致，请刷新后重试');
    }

    const now = new Date().toISOString();
    const itemByKey = new Map(enabledItems.map((item) => [item.securityKey, item]));
    await db.watchlist.bulkPut(securityKeys.map((securityKey, sortOrder) => ({
      ...itemByKey.get(securityKey)!,
      sortOrder,
      updatedAt: now,
    })));
    await db.settings.update('main', { hasUnbackedChanges: true });
  });
}

export async function softDeleteWatchlistItem(securityKey: string): Promise<void> {
  await db.transaction('rw', db.watchlist, db.settings, async () => {
    await db.watchlist.update(securityKey, { enabled: false, updatedAt: new Date().toISOString() });
    await db.settings.update('main', { hasUnbackedChanges: true });
  });
}

export interface AddPurchaseRecordInput {
  securityKey: string;
  purchasedAt: string;
  buyPrice: string;
  annualDividendPerShare: string | null;
  source?: PurchaseRecord['source'];
}

function createLocalId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isValidEntryDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day);
}

export async function listDiaryEntries(): Promise<DiaryEntry[]> {
  const entries = await db.diaryEntries.toArray();
  return entries.sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveDiaryEntry(input: SaveDiaryEntryInput): Promise<DiaryEntry> {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!isValidEntryDate(input.entryDate)) throw new Error('日记日期格式不正确');
  if (!title) throw new Error('请输入日记标题');
  if (title.length > 100) throw new Error('日记标题不能超过 100 字');
  if (!content) throw new Error('请输入日记正文');
  if (content.length > 10_000) throw new Error('日记正文不能超过 10000 字');

  const existing = input.id ? await db.diaryEntries.get(input.id) : undefined;
  if (input.id && !existing) throw new Error('日记不存在，请刷新后重试');
  const now = new Date().toISOString();
  const entry: DiaryEntry = {
    id: existing?.id ?? createLocalId(),
    entryDate: input.entryDate,
    title,
    content,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.transaction('rw', db.diaryEntries, db.settings, async () => {
    await db.diaryEntries.put(entry);
    await db.settings.update('main', { hasUnbackedChanges: true });
  });
  return entry;
}

export async function listPurchaseRecords(securityKey: string): Promise<PurchaseRecord[]> {
  const records = await db.purchaseRecords.where('securityKey').equals(securityKey).toArray();
  return records.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
}

export async function addPurchaseRecord(input: AddPurchaseRecordInput): Promise<PurchaseRecord> {
  if (!input.securityKey || !Number.isFinite(new Date(input.purchasedAt).getTime())) throw new Error('买入时间格式不正确');
  if (!/^\d+(\.\d{1,6})?$/.test(input.buyPrice) || new Decimal(input.buyPrice).lessThanOrEqualTo(0)) {
    throw new Error('买入价必须大于 0，且最多 6 位小数');
  }
  if (input.annualDividendPerShare != null
    && (!/^\d+(\.\d{1,8})?$/.test(input.annualDividendPerShare) || new Decimal(input.annualDividendPerShare).isNegative())) {
    throw new Error('每股年红利不能为负数，且最多 8 位小数');
  }
  const now = new Date().toISOString();
  const record: PurchaseRecord = {
    id: createLocalId(),
    securityKey: input.securityKey,
    purchasedAt: new Date(input.purchasedAt).toISOString(),
    buyPrice: new Decimal(input.buyPrice).toString(),
    annualDividendPerShare: input.annualDividendPerShare == null ? null : new Decimal(input.annualDividendPerShare).toString(),
    dividendYield: calculateYield(input.annualDividendPerShare, input.buyPrice),
    source: input.source ?? 'WATCHLIST',
    createdAt: now,
  };
  await db.transaction('rw', db.purchaseRecords, db.settings, async () => {
    await db.purchaseRecords.add(record);
    await db.settings.update('main', { hasUnbackedChanges: true });
  });
  return record;
}

export async function deletePurchaseRecord(id: string): Promise<void> {
  await db.transaction('rw', db.purchaseRecords, db.settings, async () => {
    await db.purchaseRecords.delete(id);
    await db.settings.update('main', { hasUnbackedChanges: true });
  });
}

export async function getBars(securityKey: string): Promise<PriceBar[]> {
  return db.priceBars.where('securityKey').equals(securityKey).sortBy('date');
}

export async function saveMarketSnapshot(
  quotes: Quote[],
  bars: PriceBar[],
  indicators: IndicatorSnapshot[],
): Promise<void> {
  await db.transaction('rw', db.quotes, db.priceBars, db.indicatorSnapshots, async () => {
    await db.quotes.bulkPut(quotes);
    if (bars.length) await db.priceBars.bulkPut(bars);
    await db.indicatorSnapshots.bulkPut(indicators);
  });
}

export async function clearMarketCache(): Promise<void> {
  await db.transaction('rw', db.quotes, db.priceBars, db.indicatorSnapshots, async () => {
    await Promise.all([db.quotes.clear(), db.priceBars.clear(), db.indicatorSnapshots.clear()]);
  });
}
