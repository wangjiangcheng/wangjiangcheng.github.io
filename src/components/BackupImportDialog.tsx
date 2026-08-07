import { LoaderCircle, Upload, X } from 'lucide-react';
import { useState } from 'react';
import type { ImportPreview } from '../services/backupService';
import { importBackup } from '../services/backupService';
import { IconButton } from './IconButton';

interface BackupImportDialogProps {
  preview: ImportPreview;
  onClose: () => void;
  onImported: () => Promise<void>;
}

export function BackupImportDialog({ preview, onClose, onImported }: BackupImportDialogProps) {
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (mode === 'replace' && !window.confirm('全部替换会覆盖现有个人数据，系统将先自动下载安全备份。确认继续？')) return;
    setLoading(true);
    setError(null);
    try {
      await importBackup(preview.backup, mode);
      await onImported();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '导入失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="overlay overlay--center" role="presentation" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="导入预览" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal__header"><div><h2>导入预览</h2><p>{preview.backup.record_count} 个红绿 · {preview.backup.purchase_record_count ?? 0} 条买入记录 · {preview.diaryAdded + preview.diaryUpdated} 篇日记 · 版本 {preview.backup.schema_version}</p></div><IconButton label="关闭" onClick={onClose}><X size={18} /></IconButton></header>
        <div className="modal__body">
          <div className="import-stats"><span><strong>{preview.added}</strong>新增</span><span><strong>{preview.updated}</strong>更新</span><span><strong>{preview.skipped}</strong>跳过</span><span><strong>{preview.errors.length}</strong>错误</span></div>
          <fieldset className="segmented-fieldset">
            <legend>导入方式</legend>
            <label className={mode === 'merge' ? 'selected' : ''}><input type="radio" name="mode" value="merge" checked={mode === 'merge'} onChange={() => setMode('merge')} /><span>合并导入</span><small>同代码采用备份中的个人字段</small></label>
            <label className={mode === 'replace' ? 'selected' : ''}><input type="radio" name="mode" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} /><span>全部替换</span><small>先下载安全备份，再替换现有列表</small></label>
          </fieldset>
          {error && <div className="inline-alert inline-alert--error">{error}</div>}
        </div>
        <footer className="modal__footer"><button type="button" className="button button--secondary" onClick={onClose}>取消</button><button type="button" className="button button--primary" onClick={handleImport} disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}{loading ? '导入中' : '确认导入'}</button></footer>
      </div>
    </div>
  );
}
