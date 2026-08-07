import { Capacitor } from '@capacitor/core';
import { Directory, Encoding } from '@capacitor/filesystem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addPurchaseRecord, db, initializeDatabase, saveDiaryEntry } from './database';
import { createBackup, downloadBackup, importBackup, validateBackup } from './backupService';

const nativePluginMocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  share: vi.fn(),
}));

vi.mock('@capacitor/filesystem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/filesystem')>();
  return { ...actual, Filesystem: { writeFile: nativePluginMocks.writeFile } };
});

vi.mock('@capacitor/share', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/share')>();
  return { ...actual, Share: { share: nativePluginMocks.share } };
});

describe('purchase record backup', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await db.delete();
    await db.open();
  });

  it('exports and validates purchase records and diaries in schema version 3', async () => {
    await initializeDatabase();
    await addPurchaseRecord({
      securityKey: 'HKEX:00001',
      purchasedAt: '2026-08-01T02:00:00.000Z',
      buyPrice: '66.8',
      annualDividendPerShare: '0.4',
    });
    const diary = await saveDiaryEntry({
      entryDate: '2026-08-07',
      title: '测试日记',
      content: '备份应包含这篇日记。',
    });
    const backup = await createBackup();
    expect(backup.schema_version).toBe(3);
    expect(backup.purchase_record_count).toBe(1);
    expect(backup.purchase_records?.[0]).toMatchObject({
      securityKey: 'HKEX:00001',
      buyPrice: '66.8',
      dividendYield: '0.59880240',
    });
    expect(backup.diary_entry_count).toBe(1);
    expect(backup.diary_entries?.[0]).toMatchObject({ id: diary.id, title: '测试日记' });
    await expect(validateBackup(JSON.stringify(backup))).resolves.toEqual(backup);

    await db.diaryEntries.clear();
    await importBackup(backup, 'merge');
    expect((await db.diaryEntries.get(diary.id))?.content).toBe('备份应包含这篇日记。');
  });

  it('creates and validates backups when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', {});
    await initializeDatabase();

    const backup = await createBackup();

    expect(backup.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    await expect(validateBackup(JSON.stringify(backup))).resolves.toEqual(backup);
  });

  it('uses the native file and share plugins for an app backup', async () => {
    await initializeDatabase();
    const backup = await createBackup();
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    nativePluginMocks.writeFile.mockResolvedValue({ uri: 'file:///cache/backup.json' });
    nativePluginMocks.share.mockResolvedValue({ activityType: 'files' });

    await downloadBackup(backup);

    expect(nativePluginMocks.writeFile).toHaveBeenCalledWith(expect.objectContaining({
      path: expect.stringMatching(/^backups\/钱从四面八方来-backup-.*\.json$/),
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    }));
    expect(nativePluginMocks.share).toHaveBeenCalledWith(expect.objectContaining({
      files: ['file:///cache/backup.json'],
    }));
  });
});
