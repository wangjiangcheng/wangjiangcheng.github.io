import { BookOpenText, CalendarDays, LoaderCircle, Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DiaryEntryDrawer } from '../components/DiaryEntryDrawer';
import { IconButton } from '../components/IconButton';
import { listDiaryEntries } from '../services/database';
import type { DiaryEntry } from '../types/diary';

function formatEntryDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(`${value}T00:00:00`));
}

function contentSummary(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function DiaryPage() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [editingEntry, setEditingEntry] = useState<DiaryEntry | 'new' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listDiaryEntries());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '日记读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  return (
    <div className="page diary-page">
      <header className="page-header diary-page__header">
        <div>
          <p className="eyebrow">PERSONAL JOURNAL</p>
          <h1>日记</h1>
          <p>个人观察与复盘记录</p>
        </div>
        <div className="page-header__actions">
          <span className="diary-count"><BookOpenText size={17} />共 <strong>{entries.length}</strong> 篇</span>
          <button type="button" className="button button--primary" onClick={() => setEditingEntry('new')}>
            <Plus size={17} />新增日记
          </button>
        </div>
      </header>

      {error && <div className="inline-alert inline-alert--error" role="alert">{error}</div>}

      <section className="diary-list" aria-label="日记列表">
        <div className="diary-list__header" aria-hidden="true">
          <span>日期</span><span>标题</span><span>内容摘要</span><span>最后编辑</span><span>操作</span>
        </div>
        {loading ? (
          <div className="diary-list__state"><LoaderCircle className="spin" size={24} /><span>正在读取日记</span></div>
        ) : entries.length === 0 ? (
          <div className="diary-list__state diary-list__state--empty">
            <span className="empty-state__mark"><BookOpenText size={25} /></span>
            <h2>暂无日记</h2>
            <button type="button" className="button button--primary" onClick={() => setEditingEntry('new')}><Plus size={17} />新增日记</button>
          </div>
        ) : (
          <div role="list">
            {entries.map((entry) => (
              <article className="diary-row" role="listitem" key={entry.id}>
                <time className="diary-row__date" dateTime={entry.entryDate}><CalendarDays size={15} />{formatEntryDate(entry.entryDate)}</time>
                <strong className="diary-row__title">{entry.title}</strong>
                <p className="diary-row__summary">{contentSummary(entry.content)}</p>
                <span className="diary-row__updated">{new Date(entry.updatedAt).toLocaleString('zh-CN')}</span>
                <IconButton label={`编辑日记 ${entry.title}`} onClick={() => setEditingEntry(entry)}><Pencil size={16} /></IconButton>
              </article>
            ))}
          </div>
        )}
      </section>

      {editingEntry && (
        <DiaryEntryDrawer
          entry={editingEntry === 'new' ? null : editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={loadEntries}
        />
      )}
    </div>
  );
}
