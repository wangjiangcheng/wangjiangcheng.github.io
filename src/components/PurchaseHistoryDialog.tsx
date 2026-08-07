import { History, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PurchaseRecord, WatchlistItem } from '../types/market';
import {
  addPurchaseRecord,
  deletePurchaseRecord,
  listPurchaseRecords,
} from '../services/database';
import { calculateYield } from '../services/indicatorCalculator';
import { formatDateTime, formatPercent, formatPrice } from '../utils/format';
import { validateDecimal } from '../utils/validation';
import { IconButton } from './IconButton';

interface PurchaseHistoryDialogProps {
  item: WatchlistItem;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

function toLocalDateTimeInput(value = new Date()): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function PurchaseHistoryDialog({ item, onClose, onChanged }: PurchaseHistoryDialogProps) {
  const [records, setRecords] = useState<PurchaseRecord[]>([]);
  const [purchasedAt, setPurchasedAt] = useState(toLocalDateTimeInput);
  const [buyPrice, setBuyPrice] = useState(item.averageBuyPrice ?? '');
  const [dividend, setDividend] = useState(item.manualAnnualDividendPerShare ?? '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reloadRecords = useCallback(async () => {
    setRecords(await listPurchaseRecords(item.securityKey));
  }, [item.securityKey]);

  useEffect(() => {
    let active = true;
    void reloadRecords()
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '买入记录读取失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reloadRecords]);

  const dividendYield = useMemo(() => {
    if (!buyPrice.trim() || !/^\d+(\.\d+)?$/.test(buyPrice.trim())) return null;
    try {
      return calculateYield(dividend.trim() || null, buyPrice.trim());
    } catch {
      return null;
    }
  }, [buyPrice, dividend]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!purchasedAt || !buyPrice.trim()) {
      setError('请填写买入时间和买入价');
      return;
    }
    const priceError = validateDecimal(buyPrice, { allowZero: false, maxDecimals: 6, label: '买入价' });
    const dividendError = validateDecimal(dividend, { allowZero: true, maxDecimals: 8, label: '每股年红利' });
    if (priceError || dividendError) {
      setError(priceError ?? dividendError);
      return;
    }
    setSaving(true);
    try {
      await addPurchaseRecord({
        securityKey: item.securityKey,
        purchasedAt: new Date(purchasedAt).toISOString(),
        buyPrice: buyPrice.trim(),
        annualDividendPerShare: dividend.trim() || null,
        source: 'WATCHLIST',
      });
      await Promise.all([reloadRecords(), onChanged()]);
      setPurchasedAt(toLocalDateTimeInput());
      setNotice('买入记录已保存');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '买入记录保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(record: PurchaseRecord) {
    if (!window.confirm(`确认删除 ${formatDateTime(record.purchasedAt)}、买入价 ${formatPrice(record.buyPrice, item.priceDecimals)} 的记录？`)) return;
    setDeletingId(record.id);
    setError(null);
    setNotice(null);
    try {
      await deletePurchaseRecord(record.id);
      await Promise.all([reloadRecords(), onChanged()]);
      setNotice('买入记录已删除');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '买入记录删除失败');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="overlay overlay--center" role="presentation" onMouseDown={onClose}>
      <div className="modal purchase-modal" role="dialog" aria-modal="true" aria-label={`${item.symbol} 买入记录`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <div>
            <h2>买入记录</h2>
            <p>{item.alias ? `${item.alias} · ` : ''}{item.name} · {item.symbol}.{item.market} · {records.length} 条</p>
          </div>
          <IconButton label="关闭" onClick={onClose}><X size={18} /></IconButton>
        </header>
        <div className="modal__body purchase-modal__body">
          <section className="purchase-entry-section">
            <div className="purchase-section-heading">
              <div><h3>新增记录</h3><p>默认值来自当前观察列表</p></div>
              <span className="source-chip">来源 · 观察列表</span>
            </div>
            <form id="purchase-record-form" className="purchase-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>买入时间 <b>*</b></span>
                <input type="datetime-local" value={purchasedAt} max={toLocalDateTimeInput()} onChange={(event) => setPurchasedAt(event.target.value)} />
              </label>
              <label className="field">
                <span>买入价 <b>*</b></span>
                <input inputMode="decimal" value={buyPrice} placeholder="请输入本次买入价格" onChange={(event) => setBuyPrice(event.target.value)} />
              </label>
              <label className="field">
                <span>每股年红利</span>
                <input inputMode="decimal" value={dividend} placeholder="默认读取列表手工红利" onChange={(event) => setDividend(event.target.value)} />
              </label>
              <div className="purchase-yield-preview">
                <span>对应成本红利率</span>
                <strong>{formatPercent(dividendYield)}</strong>
                <small>每股年红利 ÷ 本次买入价</small>
              </div>
              <button type="submit" className="button button--primary purchase-submit" disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
                {saving ? '保存中' : '保存记录'}
              </button>
            </form>
            {error && <div className="inline-alert inline-alert--error" role="alert">{error}</div>}
            {notice && <div className="inline-alert inline-alert--success">{notice}</div>}
          </section>

          <section className="purchase-list-section">
            <div className="purchase-section-heading"><div><h3>历史记录</h3><p>按买入时间倒序排列</p></div><History size={18} /></div>
            {loading ? (
              <div className="purchase-empty"><LoaderCircle className="spin" size={20} /><span>正在读取记录</span></div>
            ) : records.length === 0 ? (
              <div className="purchase-empty"><History size={22} /><strong>暂无买入记录</strong></div>
            ) : (
              <div className="purchase-table-frame">
                <table className="purchase-table">
                  <thead><tr><th>买入时间</th><th>买入价</th><th>每股年红利</th><th>成本红利率</th><th>来源</th><th>操作</th></tr></thead>
                  <tbody>{records.map((record) => (
                    <tr key={record.id}>
                      <td>{formatDateTime(record.purchasedAt)}</td>
                      <td><strong>{formatPrice(record.buyPrice, item.priceDecimals)}</strong> <small>{item.currency}</small></td>
                      <td>{record.annualDividendPerShare ?? '--'}</td>
                      <td><strong className="purchase-yield-value">{formatPercent(record.dividendYield)}</strong></td>
                      <td><span className="source-chip source-chip--plain">观察列表</span></td>
                      <td><IconButton label={`删除 ${formatDateTime(record.purchasedAt)} 的买入记录`} tone="danger" disabled={deletingId === record.id} onClick={() => void handleDelete(record)}>{deletingId === record.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}</IconButton></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <footer className="modal__footer"><button type="button" className="button button--secondary" onClick={onClose}>关闭</button></footer>
      </div>
    </div>
  );
}
