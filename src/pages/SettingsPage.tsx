import {
  ArrowLeft,
  Check,
  Database,
  Download,
  FlaskConical,
  LoaderCircle,
  RefreshCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ImportPreview } from '../services/backupService';
import { exportBackup, previewImport } from '../services/backupService';
import { clearMarketCache, saveSettings } from '../services/database';
import { eastmoneyProvider } from '../services/eastmoneyProvider';
import type { AppSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { BackupImportDialog } from '../components/BackupImportDialog';

interface SettingsPageProps {
  settings: AppSettings;
  watchlistCount: number;
  reload: () => Promise<void>;
}

interface ConnectionResult {
  price: string;
  name: string;
  bars: number;
  latestDate: string;
  latency: number;
}

export function SettingsPage({ settings, watchlistCount, reload }: SettingsPageProps) {
  const [form, setForm] = useState(settings);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionResult | null>(null);
  const [storageBytes, setStorageBytes] = useState<number | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(settings);
    setDirty(false);
  }, [settings]);

  useEffect(() => {
    void navigator.storage?.estimate().then((estimate) => setStorageBytes(estimate.usage ?? null));
  }, []);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setMessage(null);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!Number.isInteger(form.refreshIntervalSeconds) || form.refreshIntervalSeconds < 15 || form.refreshIntervalSeconds > 3600) return setError('刷新间隔应为 15 至 3600 秒的整数');
    if (form.staleAfterSeconds >= form.expiredAfterSeconds) return setError('延迟阈值必须小于过期阈值');
    if (form.bollingerPeriods < 2 || form.bollingerPeriods > 120) return setError('布林带周期应为 2 至 120');
    if (form.bollingerMultiplier <= 0 || form.bollingerMultiplier > 10) return setError('标准差倍数应大于 0 且不超过 10');
    setSaving(true);
    try {
      await saveSettings(form);
      await reload();
      setDirty(false);
      setMessage('配置已保存，下一轮刷新生效');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '配置保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    setConnection(null);
    const started = performance.now();
    try {
      const security = await eastmoneyProvider.resolveSecurity('HK', '00001');
      const [quote] = await eastmoneyProvider.getQuotes([security]);
      const bars = await eastmoneyProvider.getDailyBars(security);
      if (!quote || bars.length < 20) throw new Error('00001 返回的数据不足以计算指标');
      setConnection({
        price: quote.currentPrice,
        name: security.name,
        bars: bars.length,
        latestDate: bars.at(-1)?.date ?? '--',
        latency: Math.round(performance.now() - started),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '连接测试失败');
    } finally {
      setTesting(false);
    }
  }

  async function handleClearCache() {
    if (!window.confirm('清理行情缓存后，观察红绿和个人字段会保留。确认继续？')) return;
    try {
      await clearMarketCache();
      setMessage('行情缓存已清理，返回观察台后将重新获取');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '缓存清理失败');
    }
  }

  async function handleReset() {
    if (!window.confirm('确认恢复刷新和指标默认配置？个人红绿不会被删除。')) return;
    const next = { ...DEFAULT_SETTINGS, hiddenColumns: form.hiddenColumns, hasUnbackedChanges: true };
    await saveSettings(next);
    await reload();
    setMessage('已恢复默认配置');
  }

  async function handleImportFile(file?: File) {
    if (!file) return;
    setError(null);
    try {
      setImportPreview(await previewImport(await file.text()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '备份校验失败');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="page settings-page">
      <header className="page-header page-header--settings">
        <div className="settings-title"><button type="button" className="back-button" onClick={() => { window.location.hash = '#/'; }}><ArrowLeft size={18} />返回观察台</button><p className="eyebrow">SYSTEM SETTINGS</p><h1>系统配置</h1><p>{dirty ? '有未保存修改' : '当前配置已同步到本地存储'}</p></div>
        <button type="submit" form="settings-form" className="button button--primary" disabled={!dirty || saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{saving ? '保存中' : '保存配置'}</button>
      </header>

      {error && <div className="inline-alert inline-alert--error" role="alert">{error}</div>}
      {message && <div className="inline-alert inline-alert--success"><Check size={17} /><span>{message}</span></div>}

      <form id="settings-form" className="settings-form" onSubmit={handleSave}>
        <section className="settings-section">
          <header><div className="settings-section__icon"><RefreshCcw size={20} /></div><div><h2>行情刷新</h2><p>东方财富公开接口 · 最小刷新间隔 15 秒</p></div></header>
          <div className="settings-grid">
            <label className="field"><span>刷新间隔（秒）</span><input type="number" min="15" max="3600" step="1" value={form.refreshIntervalSeconds} onChange={(event) => update('refreshIntervalSeconds', Number(event.target.value))} /></label>
            <label className="field"><span>延迟阈值（秒）</span><input type="number" min="1" step="1" value={form.staleAfterSeconds} onChange={(event) => update('staleAfterSeconds', Number(event.target.value))} /></label>
            <label className="field"><span>过期阈值（秒）</span><input type="number" min="2" step="1" value={form.expiredAfterSeconds} onChange={(event) => update('expiredAfterSeconds', Number(event.target.value))} /></label>
            <label className="field"><span>失败重试次数</span><input type="number" min="0" max="5" step="1" value={form.retryCount} onChange={(event) => update('retryCount', Number(event.target.value))} /></label>
          </div>
          <div className="toggle-list">
            <label><span><strong>交易时段自动轮询</strong><small>关闭后仅保留手动刷新</small></span><input type="checkbox" role="switch" checked={form.pollingEnabled} onChange={(event) => update('pollingEnabled', event.target.checked)} /></label>
            <label><span><strong>休市时继续轮询</strong><small>默认关闭，减少无效请求</small></span><input type="checkbox" role="switch" checked={form.closedMarketPolling} onChange={(event) => update('closedMarketPolling', event.target.checked)} /></label>
          </div>
        </section>

        <section className="settings-section">
          <header><div className="settings-section__icon settings-section__icon--teal"><FlaskConical size={20} /></div><div><h2>指标口径</h2><p>前复权收盘价 · 总体标准差 ddof=0</p></div></header>
          <div className="settings-grid">
            <label className="field"><span>布林带周期 N</span><input type="number" min="2" max="120" step="1" value={form.bollingerPeriods} onChange={(event) => update('bollingerPeriods', Number(event.target.value))} /></label>
            <label className="field"><span>标准差倍数 K</span><input type="number" min="0.1" max="10" step="0.1" value={form.bollingerMultiplier} onChange={(event) => update('bollingerMultiplier', Number(event.target.value))} /></label>
            <label className="field"><span>涨跌配色</span><select value={form.colorRule} onChange={(event) => update('colorRule', event.target.value as AppSettings['colorRule'])}><option value="CN">中国市场：红涨绿跌</option><option value="GLOBAL">国际市场：绿涨红跌</option></select></label>
            <label className="field"><span>历史价格</span><select disabled value="forward"><option value="forward">前复权</option></select></label>
          </div>
        </section>

        <section className="settings-section">
          <header><div className="settings-section__icon settings-section__icon--amber"><Database size={20} /></div><div><h2>数据源与连接</h2><p>浏览器直接访问，不保存 API 密钥</p></div></header>
          <div className="provider-row"><div><span className="provider-logo">东</span><div><strong>东方财富</strong><small>实时报价、证券识别、前复权日 K</small></div></div><button type="button" className="button button--secondary" onClick={() => void testConnection()} disabled={testing}>{testing ? <LoaderCircle className="spin" size={17} /> : <FlaskConical size={17} />}{testing ? '测试中' : '用 00001 测试连接'}</button></div>
          {connection && <div className="connection-result"><Check size={18} /><div><strong>连接正常：{connection.name}（00001.HK）= {connection.price} HKD</strong><span>{connection.bars} 根前复权日 K · 最新 {connection.latestDate} · {connection.latency} ms</span></div></div>}
        </section>

        <section className="settings-section">
          <header><div className="settings-section__icon settings-section__icon--gray"><Database size={20} /></div><div><h2>本地存储与迁移</h2><p>个人数据保存在当前浏览器 IndexedDB</p></div></header>
          <div className="storage-stats"><div><span>观察红绿</span><strong>{watchlistCount} 个</strong></div><div><span>估算占用</span><strong>{storageBytes == null ? '--' : `${(storageBytes / 1024).toFixed(1)} KB`}</strong></div><div><span>最近备份</span><strong>{settings.lastExportedAt ? new Date(settings.lastExportedAt).toLocaleDateString('zh-CN') : '尚未备份'}</strong></div></div>
          <div className="migration-actions"><button type="button" className="button button--secondary" onClick={() => void exportBackup().then(reload)}><Download size={17} />导出备份</button><button type="button" className="button button--secondary" onClick={() => fileInputRef.current?.click()}><Upload size={17} />导入备份</button><button type="button" className="button button--secondary" onClick={() => void handleClearCache()}><Trash2 size={17} />清理行情缓存</button><button type="button" className="button button--secondary" onClick={() => void handleReset()}><RefreshCcw size={17} />恢复默认配置</button><input ref={fileInputRef} type="file" hidden accept="application/json,.json" onChange={(event) => void handleImportFile(event.target.files?.[0])} /></div>
        </section>
      </form>

      {importPreview && <BackupImportDialog preview={importPreview} onClose={() => setImportPreview(null)} onImported={async () => { await reload(); setMessage('备份导入成功'); }} />}
    </div>
  );
}
