import Decimal from 'decimal.js';
import {
  Archive,
  Columns3,
  Download,
  ListOrdered,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Upload,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { IndicatorSnapshot, Quote, WatchlistItem } from '../types/market';
import type { AppSettings } from '../types/settings';
import type { ImportPreview } from '../services/backupService';
import { exportBackup, previewImport } from '../services/backupService';
import { saveSettings, saveWatchlistOrder, softDeleteWatchlistItem } from '../services/database';
import { calculatePosition, calculateProfit, calculateYield } from '../services/indicatorCalculator';
import type { useMarketRefresh } from '../hooks/useMarketRefresh';
import { formatDateTime } from '../utils/format';
import { BackupImportDialog } from '../components/BackupImportDialog';
import { IconButton } from '../components/IconButton';
import { PurchaseHistoryDialog } from '../components/PurchaseHistoryDialog';
import { StockDetailDrawer } from '../components/StockDetailDrawer';
import { StockFormDrawer } from '../components/StockFormDrawer';
import {
  TABLE_COLUMNS,
  WatchlistTable,
  type SortKey,
  type TableRow,
} from '../components/WatchlistTable';

type RefreshController = ReturnType<typeof useMarketRefresh>;

interface DashboardPageProps {
  items: WatchlistItem[];
  quotes: Record<string, Quote>;
  indicators: Record<string, IndicatorSnapshot>;
  settings: AppSettings;
  loading: boolean;
  loadError: string | null;
  refresh: RefreshController;
  reload: () => Promise<void>;
}

function numericSortValue(row: TableRow, key: SortKey): Decimal {
  const { item, quote, indicator } = row;
  const value = {
    sortOrder: item.sortOrder,
    price: quote?.currentPrice,
    change: quote?.changePercent,
    currentYield: calculateYield(item.manualAnnualDividendPerShare, quote?.currentPrice ?? null),
    weeklyPosition: indicator?.weeklyPosition?.percent,
    buyPosition: calculatePosition(item.averageBuyPrice, indicator?.weekly ?? null)?.percent,
    profit: calculateProfit(quote?.currentPrice ?? null, item.averageBuyPrice),
  }[key];
  return value == null ? new Decimal(-1e20) : new Decimal(value);
}

export function DashboardPage(props: DashboardPageProps) {
  const [search, setSearch] = useState('');
  const [market, setMarket] = useState('ALL');
  const [position, setPosition] = useState('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('sortOrder');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [formItem, setFormItem] = useState<WatchlistItem | 'new' | null>(null);
  const [detailItem, setDetailItem] = useState<WatchlistItem | null>(null);
  const [purchaseItem, setPurchaseItem] = useState<WatchlistItem | null>(null);
  const [reordering, setReordering] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return props.items
      .map((item): TableRow => ({ item, quote: props.quotes[item.securityKey], indicator: props.indicators[item.securityKey] }))
      .filter((row) => {
        if (term && ![row.item.symbol, row.item.name, row.item.alias].some((value) => value.toLocaleLowerCase().includes(term))) return false;
        if (market !== 'ALL' && row.item.market !== market) return false;
        const percent = row.indicator?.weeklyPosition ? Number(row.indicator.weeklyPosition.percent) : null;
        if (position === 'LOWER' && (percent == null || percent >= 0)) return false;
        if (position === 'BAND' && (percent == null || percent < 0 || percent > 100)) return false;
        if (position === 'UPPER' && (percent == null || percent <= 100)) return false;
        return true;
      })
      .sort((a, b) => {
        const comparison = numericSortValue(a, sortKey).comparedTo(numericSortValue(b, sortKey));
        return sortDirection === 'asc' ? comparison : -comparison;
      });
  }, [market, position, props.indicators, props.items, props.quotes, search, sortDirection, sortKey]);

  function handleSort(nextKey: SortKey) {
    if (nextKey === sortKey) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(nextKey);
      setSortDirection('desc');
    }
  }

  async function handleMove(item: WatchlistItem, target: WatchlistItem) {
    const orderedKeys = props.items.map((current) => current.securityKey);
    const itemIndex = orderedKeys.indexOf(item.securityKey);
    const targetIndex = orderedKeys.indexOf(target.securityKey);
    if (itemIndex < 0 || targetIndex < 0) return;

    setActionError(null);
    setReordering(true);
    [orderedKeys[itemIndex], orderedKeys[targetIndex]] = [orderedKeys[targetIndex], orderedKeys[itemIndex]];
    try {
      await saveWatchlistOrder(orderedKeys);
      await props.reload();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '顺序调整失败');
    } finally {
      setReordering(false);
    }
  }

  async function handleDelete(item: WatchlistItem) {
    if (!window.confirm(`确认从观察列表删除 ${item.name}（${item.symbol}）？`)) return;
    try {
      await softDeleteWatchlistItem(item.securityKey);
      await props.reload();
      setNotice(`${item.symbol} 已从观察列表移除`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '删除失败');
    }
  }

  async function toggleColumn(key: string) {
    const hidden = new Set(props.settings.hiddenColumns);
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    await saveSettings({ ...props.settings, hiddenColumns: [...hidden] });
    await props.reload();
  }

  async function handleExport() {
    setActionError(null);
    try {
      const backup = await exportBackup();
      await props.reload();
      setNotice(`已导出 ${backup.record_count} 个红绿和 ${backup.purchase_record_count ?? 0} 条买入记录`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '导出失败');
    }
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    setActionError(null);
    try {
      setImportPreview(await previewImport(await file.text()));
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '备份校验失败');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const currentDetail = detailItem ? props.items.find((item) => item.securityKey === detailItem.securityKey) ?? detailItem : null;

  return (
    <div className="page dashboard-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">STOCK MONITOR</p>
          <h1>钱从四面八方来</h1>
          <p>价格、红利与布林带位置，集中在一张观察表里。</p>
        </div>
        <div className="page-header__actions">
          <div className={`connection-state ${props.refresh.error || !navigator.onLine ? 'connection-state--error' : ''}`}>
            <span />
            <div><strong>{!navigator.onLine ? '当前离线' : props.refresh.error ? '行情异常' : '行情已连接'}</strong><small>最近更新 {formatDateTime(props.refresh.lastSuccessAt)}</small></div>
          </div>
          <IconButton label="系统配置" onClick={() => { window.location.hash = '#/settings'; }}><Settings size={18} /></IconButton>
          <IconButton label="导出备份" onClick={() => void handleExport()}><Download size={18} /></IconButton>
          <IconButton label="导入备份" onClick={() => fileInputRef.current?.click()}><Upload size={18} /></IconButton>
          <button type="button" className="button button--primary" onClick={() => setFormItem('new')}><Plus size={17} />新增红绿</button>
          <input ref={fileInputRef} type="file" hidden accept="application/json,.json" onChange={(event) => void handleImportFile(event.target.files?.[0])} />
        </div>
      </header>

      {(props.loadError || props.refresh.error || actionError) && <div className="inline-alert inline-alert--error" role="alert">{props.loadError ?? props.refresh.error ?? actionError}</div>}
      {notice && <div className="inline-alert inline-alert--success"><span>{notice}</span><button type="button" onClick={() => setNotice(null)}>关闭</button></div>}

      <section className="status-strip" aria-label="行情刷新状态">
        <div><span className="status-strip__icon"><RefreshCw size={17} className={props.refresh.refreshing ? 'spin' : ''} /></span><p><strong>{props.refresh.refreshing ? '正在刷新行情' : props.refresh.paused ? '自动刷新已暂停' : `${props.refresh.secondsLeft} 秒后刷新`}</strong><small>单轮完成后重新计时</small></p></div>
        <div><span>本轮返回</span><strong>{props.refresh.returnedCount} / {props.items.length}</strong></div>
        <div><span>上轮耗时</span><strong>{props.refresh.lastDurationMs == null ? '--' : `${props.refresh.lastDurationMs} ms`}</strong></div>
        <div><span>数据口径</span><strong>前复权 · 盘中预估</strong></div>
        <div className="status-strip__actions"><IconButton label="立即刷新" onClick={() => void props.refresh.refreshNow()} disabled={props.refresh.refreshing}><RefreshCw size={17} /></IconButton><IconButton label={props.refresh.paused ? '继续自动刷新' : '暂停自动刷新'} onClick={props.refresh.togglePaused}>{props.refresh.paused ? <Play size={17} /> : <Pause size={17} />}</IconButton></div>
      </section>

      <section className="table-toolbar">
        <div className="table-toolbar__filters">
          <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索代码、名称或别名" /></label>
          <select aria-label="筛选市场" value={market} onChange={(event) => setMarket(event.target.value)}><option value="ALL">全部市场</option><option value="HK">港股</option><option value="SH">沪市</option><option value="SZ">深市</option><option value="BJ">北交所</option><option value="US">美股</option></select>
          <select aria-label="筛选周位置" value={position} onChange={(event) => setPosition(event.target.value)}><option value="ALL">全部周位置</option><option value="LOWER">下轨下方</option><option value="BAND">轨道内</option><option value="UPPER">上轨上方</option></select>
          <details className="column-menu"><summary><Columns3 size={17} />列设置</summary><div>{TABLE_COLUMNS.filter((column) => !['code', 'actions'].includes(column.key)).map((column) => <label key={column.key}><input type="checkbox" checked={!props.settings.hiddenColumns.includes(column.key)} onChange={() => void toggleColumn(column.key)} />{column.label}</label>)}</div></details>
          <button
            type="button"
            className={`button table-order-button ${sortKey === 'sortOrder' && sortDirection === 'asc' ? 'button--active' : ''}`}
            aria-pressed={sortKey === 'sortOrder' && sortDirection === 'asc'}
            onClick={() => { setSortKey('sortOrder'); setSortDirection('asc'); }}
          ><ListOrdered size={16} />自定义顺序</button>
        </div>
        <div className="table-toolbar__count"><Archive size={17} /><span>共 <strong>{rows.length}</strong> 只</span>{props.settings.hasUnbackedChanges && <em>有未备份改动</em>}</div>
      </section>

      {props.loading ? <div className="loading-state"><RefreshCw className="spin" size={26} /><span>正在读取本地观察列表</span></div> : (
        <WatchlistTable
          rows={rows}
          settings={props.settings}
          rowErrors={props.refresh.rowErrors}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
          onDetail={setDetailItem}
          onPurchaseHistory={setPurchaseItem}
          onEdit={setFormItem}
          onDelete={(item) => void handleDelete(item)}
          onMove={(item, target) => void handleMove(item, target)}
          reordering={reordering}
          onAdd={() => setFormItem('new')}
        />
      )}

      {formItem && <StockFormDrawer item={formItem === 'new' ? null : formItem} onClose={() => setFormItem(null)} onSaved={async () => { await props.reload(); void props.refresh.refreshNow(); }} />}
      {purchaseItem && <PurchaseHistoryDialog item={purchaseItem} onClose={() => setPurchaseItem(null)} onChanged={props.reload} />}
      {currentDetail && <StockDetailDrawer item={currentDetail} quote={props.quotes[currentDetail.securityKey]} indicator={props.indicators[currentDetail.securityKey]} onClose={() => setDetailItem(null)} onEdit={() => { setDetailItem(null); setFormItem(currentDetail); }} />}
      {importPreview && <BackupImportDialog preview={importPreview} onClose={() => setImportPreview(null)} onImported={async () => { await props.reload(); void props.refresh.refreshNow(); setNotice('个人数据已恢复，正在重新拉取行情'); }} />}
    </div>
  );
}
