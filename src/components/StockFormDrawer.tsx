import { useEffect, useMemo, useState } from 'react';
import { Check, LoaderCircle, Search } from 'lucide-react';
import type { Market, SecurityInfo, WatchlistItem } from '../types/market';
import { eastmoneyProvider } from '../services/eastmoneyProvider';
import { db, upsertWatchlistItem } from '../services/database';
import { normalizeSymbol, validateDecimal, validateSymbol } from '../utils/validation';
import { Drawer } from './Drawer';

interface StockFormDrawerProps {
  item: WatchlistItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export function StockFormDrawer({ item, onClose, onSaved }: StockFormDrawerProps) {
  const [market, setMarket] = useState<Market>(item?.market ?? 'HK');
  const [symbol, setSymbol] = useState(item?.symbol ?? '');
  const [alias, setAlias] = useState(item?.alias ?? '');
  const [dividend, setDividend] = useState(item?.manualAnnualDividendPerShare ?? '');
  const [buyPrice, setBuyPrice] = useState(item?.averageBuyPrice ?? '');
  const [note, setNote] = useState(item?.note ?? '');
  const [security, setSecurity] = useState<SecurityInfo | null>(item);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbolError = useMemo(() => symbol ? validateSymbol(market, symbol) : null, [market, symbol]);

  useEffect(() => {
    if (item || !symbol || symbolError) {
      if (!item) setSecurity(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setResolving(true);
      setError(null);
      try {
        setSecurity(await eastmoneyProvider.resolveSecurity(market, symbol, controller.signal));
      } catch (reason) {
        if (!controller.signal.aborted) {
          setSecurity(null);
          setError(reason instanceof Error ? reason.message : '红绿识别失败');
        }
      } finally {
        if (!controller.signal.aborted) setResolving(false);
      }
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [item, market, symbol, symbolError]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!security) {
      setError('请先输入并识别有效红绿代码');
      return;
    }
    if (alias.length > 50) return setError('别名不能超过 50 字');
    if (note.length > 1000) return setError('备注不能超过 1000 字');
    const dividendError = validateDecimal(dividend, { allowZero: true, maxDecimals: 8, label: '手工红利' });
    const buyPriceError = validateDecimal(buyPrice, { allowZero: false, maxDecimals: 6, label: '买入价' });
    if (dividendError || buyPriceError) return setError(dividendError ?? buyPriceError);

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const sortOrder = item?.sortOrder ?? await db.watchlist.count();
      await upsertWatchlistItem({
        ...security,
        alias: alias.trim(),
        note: note.trim(),
        manualAnnualDividendPerShare: dividend.trim() || null,
        dividendUpdatedAt: dividend.trim() === (item?.manualAnnualDividendPerShare ?? '')
          ? item?.dividendUpdatedAt ?? null
          : dividend.trim() ? now : null,
        averageBuyPrice: buyPrice.trim() || null,
        sortOrder,
        enabled: true,
        createdAt: item?.createdAt ?? now,
        updatedAt: now,
      });
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={item ? '编辑观察项' : '新增红绿'}
      subtitle={item ? `${item.symbol}.${item.market} 的个人字段` : '代码识别成功后才可加入观察列表'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button--secondary" onClick={onClose}>取消</button>
          <button type="submit" form="stock-form" className="button button--primary" disabled={saving || resolving || !security}>
            {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
            {saving ? '保存中' : '保存'}
          </button>
        </>
      }
    >
      <form id="stock-form" className="form-stack" onSubmit={handleSubmit}>
        <section className="form-section">
          <h3>证券信息</h3>
          <div className="form-grid form-grid--2">
            <label className="field">
              <span>市场 <b>*</b></span>
              <select value={market} disabled={Boolean(item)} onChange={(event) => {
                setMarket(event.target.value as Market);
                setSymbol('');
                setSecurity(null);
              }}>
                <option value="HK">港股</option>
                <option value="SH">沪市</option>
                <option value="SZ">深市</option>
                <option value="BJ">北交所</option>
                <option value="US">美股</option>
              </select>
            </label>
            <label className="field">
              <span>红绿代码 <b>*</b></span>
              <div className="input-with-icon">
                <input
                  value={symbol}
                  disabled={Boolean(item)}
                  placeholder={market === 'HK' ? '例如 00001' : '输入证券代码'}
                  onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                  onBlur={() => setSymbol((value) => normalizeSymbol(market, value))}
                />
                {resolving ? <LoaderCircle className="spin" size={16} /> : security ? <Check size={16} /> : <Search size={16} />}
              </div>
              {symbolError && <small className="field-error">{symbolError}</small>}
            </label>
          </div>
          <div className={`security-result ${security ? 'security-result--success' : ''}`}>
            <span>{security ? security.name : '等待识别证券'}</span>
            <strong>{security ? `${security.symbol}.${security.market} · ${security.currency}` : '--'}</strong>
          </div>
        </section>

        <section className="form-section">
          <h3>个人字段</h3>
          <label className="field">
            <span>别名</span>
            <input value={alias} maxLength={50} placeholder="便于识别的自定义名称" onChange={(event) => setAlias(event.target.value)} />
            <small>{alias.length}/50</small>
          </label>
          <div className="form-grid form-grid--2">
            <label className="field">
              <span>每股年红利（手工）</span>
              <input inputMode="decimal" value={dividend} placeholder="留空表示未维护" onChange={(event) => setDividend(event.target.value)} />
            </label>
            <label className="field">
              <span>实际平均买入价</span>
              <input inputMode="decimal" value={buyPrice} placeholder="必须大于 0" onChange={(event) => setBuyPrice(event.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>备注</span>
            <textarea value={note} maxLength={1000} rows={5} placeholder="记录你的观察与判断" onChange={(event) => setNote(event.target.value)} />
            <small>{note.length}/1000</small>
          </label>
        </section>
        {error && <div className="inline-alert inline-alert--error" role="alert">{error}</div>}
      </form>
    </Drawer>
  );
}
