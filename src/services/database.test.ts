import { afterEach, describe, expect, it } from 'vitest';
import {
  addPurchaseRecord,
  db,
  deletePurchaseRecord,
  initializeDatabase,
  listDiaryEntries,
  listPurchaseRecords,
  listWatchlist,
  saveDiaryEntry,
  saveWatchlistOrder,
  softDeleteWatchlistItem,
} from './database';

describe('watchlist repository', () => {
  afterEach(async () => {
    await db.delete();
    await db.open();
  });

  it('returns the enabled 00001 acceptance seed on a new database', async () => {
    await initializeDatabase();
    const items = await listWatchlist();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ symbol: '00001', name: '长和', enabled: true });
    expect((await db.settings.get('main'))?.hiddenColumns).toEqual([]);
  });

  it('does not return soft-deleted watchlist items', async () => {
    await initializeDatabase();
    await softDeleteWatchlistItem('HKEX:00001');
    expect(await listWatchlist()).toEqual([]);
  });

  it('does not recreate the seed after a deliberately empty list', async () => {
    await initializeDatabase();
    await db.watchlist.clear();
    await initializeDatabase();
    expect(await listWatchlist()).toEqual([]);
  });

  it('persists a custom watchlist order', async () => {
    await initializeDatabase();
    const seed = (await listWatchlist())[0];
    const second = {
      ...seed,
      securityKey: 'HKEX:00002',
      symbol: '00002',
      name: '中电控股',
      alias: '排序样本',
      providerSecurityId: '116.00002',
      sortOrder: 1,
    };
    await db.watchlist.put(second);

    await saveWatchlistOrder([second.securityKey, seed.securityKey]);

    expect((await listWatchlist()).map((item) => item.symbol)).toEqual(['00002', '00001']);
    expect((await db.settings.get('main'))?.hasUnbackedChanges).toBe(true);
  });

  it('stores, calculates and deletes individual purchase records', async () => {
    await initializeDatabase();
    const older = await addPurchaseRecord({
      securityKey: 'HKEX:00001',
      purchasedAt: '2026-07-01T02:00:00.000Z',
      buyPrice: '50',
      annualDividendPerShare: '2',
    });
    const newer = await addPurchaseRecord({
      securityKey: 'HKEX:00001',
      purchasedAt: '2026-08-01T02:00:00.000Z',
      buyPrice: '40',
      annualDividendPerShare: '2',
    });
    expect(older.dividendYield).toBe('4.00000000');
    expect(newer.dividendYield).toBe('5.00000000');
    expect((await listPurchaseRecords('HKEX:00001')).map((record) => record.id)).toEqual([newer.id, older.id]);

    await deletePurchaseRecord(newer.id);
    expect((await listPurchaseRecords('HKEX:00001')).map((record) => record.id)).toEqual([older.id]);
    expect((await db.settings.get('main'))?.hasUnbackedChanges).toBe(true);
  });

  it('creates, edits and sorts diary entries', async () => {
    await initializeDatabase();
    const older = await saveDiaryEntry({
      entryDate: '2026-08-01',
      title: '月初复盘',
      content: '记录第一篇日记。',
    });
    const newer = await saveDiaryEntry({
      entryDate: '2026-08-07',
      title: '今日观察',
      content: '记录第二篇日记。',
    });

    const edited = await saveDiaryEntry({
      id: older.id,
      entryDate: older.entryDate,
      title: '月初复盘（已更新）',
      content: '更新后的日记正文。',
    });

    expect(edited.createdAt).toBe(older.createdAt);
    expect((await listDiaryEntries()).map((entry) => entry.id)).toEqual([newer.id, older.id]);
    expect((await db.diaryEntries.get(older.id))?.content).toBe('更新后的日记正文。');
    expect((await db.settings.get('main'))?.hasUnbackedChanges).toBe(true);
  });
});
