import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Edit3, Eye, History, Trash2 } from 'lucide-react';
import type { IndicatorSnapshot, Quote, WatchlistItem } from '../types/market';
import type { AppSettings } from '../types/settings';
import { calculatePosition, calculateProfit, calculateYield } from '../services/indicatorCalculator';
import { FRESHNESS_LABEL, formatDateTime, formatPercent, formatPrice, getQuoteFreshness } from '../utils/format';
import { IconButton } from './IconButton';

export type ColumnKey =
  | 'code' | 'name' | 'alias' | 'price' | 'change' | 'dividend' | 'currentYield' | 'costYield'
  | 'dailyUpper' | 'dailyMiddle' | 'dailyLower' | 'dailyPosition'
  | 'weeklyUpper' | 'weeklyMiddle' | 'weeklyLower' | 'weeklyPosition' | 'buyPosition'
  | 'monthlyMiddle' | 'buyPrice' | 'profit' | 'note' | 'updated' | 'actions';

export type SortKey = 'sortOrder' | 'price' | 'change' | 'currentYield' | 'weeklyPosition' | 'buyPosition' | 'profit';

export interface TableRow {
  item: WatchlistItem;
  quote?: Quote;
  indicator?: IndicatorSnapshot;
}

interface WatchlistTableProps {
  rows: TableRow[];
  settings: AppSettings;
  rowErrors: Record<string, string>;
  sortKey: SortKey;
  sortDirection: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  onDetail: (item: WatchlistItem) => void;
  onPurchaseHistory: (item: WatchlistItem) => void;
  onEdit: (item: WatchlistItem) => void;
  onDelete: (item: WatchlistItem) => void;
  onMove: (item: WatchlistItem, target: WatchlistItem) => void;
  reordering: boolean;
  onAdd: () => void;
}

interface ColumnDefinition {
  key: ColumnKey;
  group: string;
  label: string;
  sortKey?: SortKey;
  className?: string;
}

export const TABLE_COLUMNS: ColumnDefinition[] = [
  { key: 'code', group: '红绿', label: '代码/市场' },
  { key: 'name', group: '红绿', label: '红绿名称' },
  { key: 'alias', group: '红绿', label: '别名', className: 'sticky-alias' },
  { key: 'price', group: '行情', label: '当前价', sortKey: 'price' },
  { key: 'change', group: '行情', label: '涨跌幅', sortKey: 'change' },
  { key: 'dividend', group: '红利', label: '手工红利' },
  { key: 'currentYield', group: '红利', label: '当前价红利率', sortKey: 'currentYield' },
  { key: 'costYield', group: '红利', label: '成本红利率', sortKey: 'currentYield' },
  { key: 'dailyUpper', group: '日线', label: '日上' },
  { key: 'dailyMiddle', group: '日线', label: '日中' },
  { key: 'dailyLower', group: '日线', label: '日下' },
  { key: 'dailyPosition', group: '日线', label: '日位置' },
  { key: 'weeklyUpper', group: '周线', label: '周上' },
  { key: 'weeklyMiddle', group: '周线', label: '周中' },
  { key: 'weeklyLower', group: '周线', label: '周下' },
  { key: 'weeklyPosition', group: '周线', label: '周位置', sortKey: 'weeklyPosition' },
  { key: 'buyPosition', group: '周线', label: '买入位置', sortKey: 'buyPosition' },
  { key: 'monthlyMiddle', group: '月线', label: '月中' },
  { key: 'buyPrice', group: '持仓', label: '买入价' },
  { key: 'profit', group: '持仓', label: '浮动盈亏', sortKey: 'profit' },
  { key: 'note', group: '记录', label: '备注' },
  { key: 'updated', group: '状态', label: '更新时间' },
  { key: 'actions', group: '操作', label: '操作', className: 'sticky-actions' },
];

function Movement({ value, children }: { value: string | null | undefined; children: React.ReactNode }) {
  const number = Number(value);
  const className = number > 0 ? 'movement movement--up' : number < 0 ? 'movement movement--down' : 'movement';
  return <span className={className}>{children}</span>;
}

function PositionValue({ percent, label }: { percent?: string; label?: string }) {
  if (percent == null || !label) return <span className="placeholder">--</span>;
  return <span className="position-value"><strong>{Number(percent).toFixed(1)}%</strong><small>{label}</small></span>;
}

function PriceCell({ quote, item }: { quote?: Quote; item: WatchlistItem }) {
  const previous = useRef(quote?.currentPrice);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (previous.current && quote?.currentPrice && previous.current !== quote.currentPrice) {
      setFlashing(true);
      const timer = window.setTimeout(() => setFlashing(false), 600);
      previous.current = quote.currentPrice;
      return () => window.clearTimeout(timer);
    }
    previous.current = quote?.currentPrice;
  }, [quote?.currentPrice]);
  return (
    <span className={`price-cell ${flashing ? 'price-cell--flash' : ''}`}>
      <strong>{formatPrice(quote?.currentPrice, item.priceDecimals)}</strong>
      <small>{item.currency}</small>
    </span>
  );
}

function renderCell(column: ColumnKey, row: TableRow, settings: AppSettings, rowError?: string) {
  const { item, quote, indicator } = row;
  const buyPosition = calculatePosition(item.averageBuyPrice, indicator?.weekly ?? null);
  const freshness = getQuoteFreshness(quote, settings);
  switch (column) {
    case 'code': return <span className="code-cell"><strong>{item.symbol}</strong><small>{item.market}</small></span>;
    case 'name': return <span className="text-cell" title={item.name}>{item.name}</span>;
    case 'alias': return <span className="text-cell" title={item.alias}>{item.alias || '--'}</span>;
    case 'price': return <PriceCell quote={quote} item={item} />;
    case 'change': return <Movement value={quote?.changePercent}>{formatPercent(quote?.changePercent)}</Movement>;
    case 'dividend': return <span title="按你维护的每股年红利计算">{item.manualAnnualDividendPerShare ?? '--'}</span>;
    case 'currentYield': return formatPercent(calculateYield(item.manualAnnualDividendPerShare, quote?.currentPrice ?? null));
    case 'costYield': return formatPercent(calculateYield(item.manualAnnualDividendPerShare, item.averageBuyPrice));
    case 'dailyUpper': return formatPrice(indicator?.daily?.upper, item.priceDecimals);
    case 'dailyMiddle': return formatPrice(indicator?.daily?.middle, item.priceDecimals);
    case 'dailyLower': return formatPrice(indicator?.daily?.lower, item.priceDecimals);
    case 'dailyPosition': return <PositionValue percent={indicator?.dailyPosition?.percent} label={indicator?.dailyPosition?.label} />;
    case 'weeklyUpper': return formatPrice(indicator?.weekly?.upper, item.priceDecimals);
    case 'weeklyMiddle': return formatPrice(indicator?.weekly?.middle, item.priceDecimals);
    case 'weeklyLower': return formatPrice(indicator?.weekly?.lower, item.priceDecimals);
    case 'weeklyPosition': return <PositionValue percent={indicator?.weeklyPosition?.percent} label={indicator?.weeklyPosition?.label} />;
    case 'buyPosition': return <PositionValue percent={buyPosition?.percent} label={buyPosition?.label} />;
    case 'monthlyMiddle': return formatPrice(indicator?.monthlyMiddle, item.priceDecimals);
    case 'buyPrice': return item.averageBuyPrice
      ? <strong className="buy-price-value">{formatPrice(item.averageBuyPrice, item.priceDecimals)}</strong>
      : <span className="placeholder">--</span>;
    case 'profit': {
      const profit = calculateProfit(quote?.currentPrice ?? null, item.averageBuyPrice);
      return <Movement value={profit}>{formatPercent(profit)}</Movement>;
    }
    case 'note': return <span className="note-cell" title={item.note}>{item.note || '--'}</span>;
    case 'updated': return (
      <span className="status-cell" title={rowError ?? formatDateTime(quote?.quoteTime)}>
        <span className={`status-dot status-dot--${freshness.toLowerCase()}`} />
        <strong>{rowError ? '部分缺失' : FRESHNESS_LABEL[freshness]}</strong>
        <small>{formatDateTime(quote?.quoteTime)}</small>
      </span>
    );
    default: return null;
  }
}

export function WatchlistTable(props: WatchlistTableProps) {
  const hidden = new Set(props.settings.hiddenColumns);
  const columns = TABLE_COLUMNS.filter((column) => !hidden.has(column.key));
  const canReorder = props.sortKey === 'sortOrder' && props.sortDirection === 'asc';
  const groups = columns.reduce<Array<{ name: string; count: number }>>((result, column) => {
    const last = result.at(-1);
    if (last?.name === column.group) last.count += 1;
    else result.push({ name: column.group, count: 1 });
    return result;
  }, []);

  if (props.rows.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__mark">00</div>
        <h2>没有符合条件的红绿</h2>
        <p>调整搜索或筛选条件，或者新增一个观察红绿。</p>
        <button className="button button--primary" type="button" onClick={props.onAdd}>新增红绿</button>
      </div>
    );
  }

  return (
    <div className="table-frame" data-color-rule={props.settings.colorRule}>
      <table className="market-table">
        <thead>
          <tr className="market-table__groups">
            {groups.map((group) => <th key={group.name} colSpan={group.count}>{group.name}</th>)}
          </tr>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className ?? ''}>
                {column.sortKey ? (
                  <button type="button" className="sort-button" onClick={() => props.onSort(column.sortKey!)}>
                    {column.label}
                    {props.sortKey === column.sortKey && <span>{props.sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                ) : column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, rowIndex) => (
            <tr key={row.item.securityKey} onClick={() => props.onDetail(row.item)}>
              {columns.map((column) => (
                <td key={column.key} className={`${column.className ?? ''} column-${column.key}`}>
                  {column.key === 'actions' ? (
                    <div className="row-actions" onClick={(event) => event.stopPropagation()}>
                      <IconButton
                        label={`上移 ${row.item.symbol}`}
                        disabled={!canReorder || props.reordering || rowIndex === 0}
                        onClick={() => props.onMove(row.item, props.rows[rowIndex - 1].item)}
                      ><ArrowUp size={15} /></IconButton>
                      <IconButton
                        label={`下移 ${row.item.symbol}`}
                        disabled={!canReorder || props.reordering || rowIndex === props.rows.length - 1}
                        onClick={() => props.onMove(row.item, props.rows[rowIndex + 1].item)}
                      ><ArrowDown size={15} /></IconButton>
                      <IconButton label={`查看 ${row.item.symbol}`} onClick={() => props.onDetail(row.item)}><Eye size={16} /></IconButton>
                      <IconButton label={`买入记录 ${row.item.symbol}`} onClick={() => props.onPurchaseHistory(row.item)}><History size={16} /></IconButton>
                      <IconButton label={`编辑 ${row.item.symbol}`} onClick={() => props.onEdit(row.item)}><Edit3 size={16} /></IconButton>
                      <IconButton label={`删除 ${row.item.symbol}`} tone="danger" onClick={() => props.onDelete(row.item)}><Trash2 size={16} /></IconButton>
                    </div>
                  ) : renderCell(column.key, row, props.settings, props.rowErrors[row.item.securityKey])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
