import { LoaderCircle, Save } from 'lucide-react';
import { useState } from 'react';
import { saveDiaryEntry } from '../services/database';
import type { DiaryEntry } from '../types/diary';
import { Drawer } from './Drawer';

interface DiaryEntryDrawerProps {
  entry: DiaryEntry | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function todayForInput(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DiaryEntryDrawer({ entry, onClose, onSaved }: DiaryEntryDrawerProps) {
  const [entryDate, setEntryDate] = useState(entry?.entryDate ?? todayForInput());
  const [title, setTitle] = useState(entry?.title ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await saveDiaryEntry({ id: entry?.id, entryDate, title, content });
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '日记保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={entry ? '编辑日记' : '新增日记'}
      subtitle={entry ? `最后编辑于 ${new Date(entry.updatedAt).toLocaleString('zh-CN')}` : '记录当天的观察与复盘'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button--secondary" onClick={onClose}>取消</button>
          <button type="submit" form="diary-entry-form" className="button button--primary" disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}
            {saving ? '保存中' : '保存日记'}
          </button>
        </>
      }
    >
      <form id="diary-entry-form" className="diary-editor" onSubmit={handleSubmit}>
        <label className="field">
          <span>日记日期 <b>*</b></span>
          <input type="date" required value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
        </label>
        <label className="field">
          <span>标题 <b>*</b></span>
          <input required value={title} maxLength={100} placeholder="输入日记标题" onChange={(event) => setTitle(event.target.value)} />
          <small>{title.length}/100</small>
        </label>
        <label className="field">
          <span>正文 <b>*</b></span>
          <textarea
            required
            className="diary-editor__content"
            value={content}
            maxLength={10_000}
            placeholder="记录观察、判断和复盘"
            onChange={(event) => setContent(event.target.value)}
          />
          <small>{content.length}/10000</small>
        </label>
        {error && <div className="inline-alert inline-alert--error" role="alert">{error}</div>}
      </form>
    </Drawer>
  );
}
