import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { Table } from 'dexie';
import Decimal from 'decimal.js';
import { sha256 } from 'js-sha256';
import type { DiaryEntry } from '../types/diary';
import type { PurchaseRecord, WatchlistItem } from '../types/market';
import type { AppSettings } from '../types/settings';
import { db, getSettings, listWatchlist } from './database';

export interface BackupFile {
  app: '钱从四面八方来';
  schema_version: 1 | 2 | 3;
  exported_at: string;
  app_version: string;
  record_count: number;
  checksum: string;
  watchlist: WatchlistItem[];
  purchase_record_count?: number;
  purchase_records?: PurchaseRecord[];
  diary_entry_count?: number;
  diary_entries?: DiaryEntry[];
  settings: AppSettings;
}

export interface ImportPreview {
  added: number;
  updated: number;
  skipped: number;
  diaryAdded: number;
  diaryUpdated: number;
  errors: string[];
  backup: BackupFile;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

async function checksumOf(backup: Omit<BackupFile, 'checksum'>): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(stableValue(backup)));
  return `sha256:${sha256(payload)}`;
}

function withoutSensitiveSettings(settings: AppSettings): AppSettings {
  return { ...settings, hasUnbackedChanges: false };
}

export async function createBackup(): Promise<BackupFile> {
  const [watchlist, settings, allPurchaseRecords, diaryEntries] = await Promise.all([
    listWatchlist(),
    getSettings(),
    db.purchaseRecords.toArray(),
    db.diaryEntries.toArray(),
  ]);
  const enabledKeys = new Set(watchlist.map((item) => item.securityKey));
  const purchaseRecords = allPurchaseRecords.filter((record) => enabledKeys.has(record.securityKey));
  const body: Omit<BackupFile, 'checksum'> = {
    app: '钱从四面八方来',
    schema_version: 3,
    exported_at: new Date().toISOString(),
    app_version: '1.0.0',
    record_count: watchlist.length,
    watchlist,
    purchase_record_count: purchaseRecords.length,
    purchase_records: purchaseRecords,
    diary_entry_count: diaryEntries.length,
    diary_entries: diaryEntries,
    settings: withoutSensitiveSettings(settings),
  };
  return { ...body, checksum: await checksumOf(body) };
}

function backupFilename(dateText: string): string {
  const compact = dateText.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `钱从四面八方来-backup-${compact}.json`;
}

export async function downloadBackup(backup: BackupFile): Promise<void> {
  const filename = backupFilename(backup.exported_at);
  const content = JSON.stringify(backup, null, 2);
  if (Capacitor.isNativePlatform()) {
    const result = await Filesystem.writeFile({
      path: `backups/${filename}`,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    await Share.share({
      title: '导出红绿观察台备份',
      files: [result.uri],
      dialogTitle: '保存或分享备份',
    });
    return;
  }

  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function exportBackup(): Promise<BackupFile> {
  const backup = await createBackup();
  await downloadBackup(backup);
  await db.settings.update('main', { lastExportedAt: backup.exported_at, hasUnbackedChanges: false });
  return backup;
}

function validateItem(item: WatchlistItem, index: number): string[] {
  const errors: string[] = [];
  if (!item || typeof item !== 'object') return [`第 ${index + 1} 条观察项格式错误`];
  if (!item.securityKey || !item.symbol || !item.exchange) errors.push(`第 ${index + 1} 条观察项缺少证券标识`);
  if ((item.alias?.length ?? 0) > 50) errors.push(`${item.symbol ?? index} 的别名超过 50 字`);
  if ((item.note?.length ?? 0) > 1000) errors.push(`${item.symbol ?? index} 的备注超过 1000 字`);
  if (item.manualAnnualDividendPerShare != null && !/^\d+(\.\d{1,8})?$/.test(item.manualAnnualDividendPerShare)) {
    errors.push(`${item.symbol ?? index} 的手工红利格式错误`);
  }
  if (item.averageBuyPrice != null && !/^\d+(\.\d{1,6})?$/.test(item.averageBuyPrice)) {
    errors.push(`${item.symbol ?? index} 的买入价格式错误`);
  } else if (item.averageBuyPrice != null && new Decimal(item.averageBuyPrice).lessThanOrEqualTo(0)) {
    errors.push(`${item.symbol ?? index} 的买入价必须大于 0`);
  }
  return errors;
}

function validatePurchaseRecord(record: PurchaseRecord, index: number, securityKeys: Set<string>): string[] {
  const errors: string[] = [];
  const label = `第 ${index + 1} 条买入记录`;
  if (!record || typeof record !== 'object') return [`${label}格式错误`];
  if (!record.id || !record.securityKey || !securityKeys.has(record.securityKey)) errors.push(`${label}的证券标识无效`);
  if (!Number.isFinite(new Date(record.purchasedAt).getTime())) errors.push(`${label}的买入时间无效`);
  if (!/^\d+(\.\d{1,6})?$/.test(record.buyPrice) || new Decimal(record.buyPrice).lessThanOrEqualTo(0)) {
    errors.push(`${label}的买入价格式错误`);
  }
  if (record.annualDividendPerShare != null
    && (!/^\d+(\.\d{1,8})?$/.test(record.annualDividendPerShare) || new Decimal(record.annualDividendPerShare).isNegative())) {
    errors.push(`${label}的每股年红利格式错误`);
  }
  if (!['WATCHLIST', 'MANUAL'].includes(record.source)) errors.push(`${label}的数据来源无效`);
  return errors;
}

function validateDiaryEntry(entry: DiaryEntry, index: number): string[] {
  const errors: string[] = [];
  const label = `第 ${index + 1} 篇日记`;
  if (!entry || typeof entry !== 'object') return [`${label}格式错误`];
  if (!entry.id) errors.push(`${label}缺少唯一标识`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.entryDate) || !Number.isFinite(new Date(`${entry.entryDate}T00:00:00`).getTime())) {
    errors.push(`${label}的日期无效`);
  }
  if (typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 100) errors.push(`${label}的标题无效`);
  if (typeof entry.content !== 'string' || !entry.content.trim() || entry.content.length > 10_000) errors.push(`${label}的正文无效`);
  if (!Number.isFinite(new Date(entry.createdAt).getTime()) || !Number.isFinite(new Date(entry.updatedAt).getTime())) {
    errors.push(`${label}的时间信息无效`);
  }
  return errors;
}

export async function validateBackup(text: string): Promise<BackupFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是有效 JSON');
  }
  const backup = parsed as BackupFile;
  if (backup.app !== '钱从四面八方来') throw new Error('备份文件不属于本应用');
  if (![1, 2, 3].includes(backup.schema_version)) throw new Error(`不支持备份版本 ${String(backup.schema_version)}`);
  if (!Array.isArray(backup.watchlist)) throw new Error('备份缺少观察列表');
  if (backup.record_count !== backup.watchlist.length) throw new Error('备份记录数校验失败');
  if (backup.schema_version >= 2 && !Array.isArray(backup.purchase_records)) throw new Error('备份缺少买入记录列表');
  const purchaseRecords = backup.purchase_records ?? [];
  if ((backup.purchase_record_count ?? 0) !== purchaseRecords.length) throw new Error('买入记录数校验失败');
  if (backup.schema_version === 3 && !Array.isArray(backup.diary_entries)) throw new Error('备份缺少日记列表');
  const diaryEntries = backup.diary_entries ?? [];
  if ((backup.diary_entry_count ?? 0) !== diaryEntries.length) throw new Error('日记记录数校验失败');
  const securityKeys = new Set(backup.watchlist.map((item) => item.securityKey));
  const errors = [
    ...backup.watchlist.flatMap(validateItem),
    ...purchaseRecords.flatMap((record, index) => validatePurchaseRecord(record, index, securityKeys)),
    ...diaryEntries.flatMap(validateDiaryEntry),
  ];
  if (errors.length) throw new Error(errors.join('；'));
  const { checksum, ...body } = backup;
  const expected = await checksumOf(body);
  if (checksum !== expected) throw new Error('备份校验值不匹配，文件可能已损坏或被修改');
  return backup;
}

export async function previewImport(text: string): Promise<ImportPreview> {
  const backup = await validateBackup(text);
  const currentKeys = new Set((await db.watchlist.toArray()).map((item) => item.securityKey));
  const currentDiaryIds = new Set((await db.diaryEntries.toArray()).map((entry) => entry.id));
  let added = 0;
  let updated = 0;
  for (const item of backup.watchlist) {
    if (currentKeys.has(item.securityKey)) updated += 1;
    else added += 1;
  }
  const diaryEntries = backup.diary_entries ?? [];
  const diaryUpdated = diaryEntries.filter((entry) => currentDiaryIds.has(entry.id)).length;
  return {
    added,
    updated,
    skipped: 0,
    diaryAdded: diaryEntries.length - diaryUpdated,
    diaryUpdated,
    errors: [],
    backup,
  };
}

async function replaceTable<T, TKey>(table: Table<T, TKey>, values: T[]): Promise<void> {
  await table.clear();
  await table.bulkPut(values);
}

export async function importBackup(backup: BackupFile, mode: 'merge' | 'replace'): Promise<void> {
  if (mode === 'replace') {
    const safetyBackup = await createBackup();
    await downloadBackup(safetyBackup);
  }
  const purchaseRecords = backup.purchase_records ?? [];
  const diaryEntries = backup.diary_entries ?? [];
  await db.transaction('rw', db.watchlist, db.purchaseRecords, db.diaryEntries, db.settings, async () => {
    if (mode === 'replace') {
      await replaceTable(db.watchlist, backup.watchlist);
      await replaceTable(db.purchaseRecords, purchaseRecords);
      await replaceTable(db.diaryEntries, diaryEntries);
    } else {
      await db.watchlist.bulkPut(backup.watchlist);
      if (purchaseRecords.length) await db.purchaseRecords.bulkPut(purchaseRecords);
      if (diaryEntries.length) await db.diaryEntries.bulkPut(diaryEntries);
    }
    await db.settings.put({ ...backup.settings, id: 'main', hasUnbackedChanges: true });
  });
}
