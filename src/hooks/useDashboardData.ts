import { useCallback, useEffect, useState } from 'react';
import type { IndicatorSnapshot, Quote, WatchlistItem } from '../types/market';
import type { AppSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { db, getSettings, initializeDatabase, listWatchlist } from '../services/database';

export interface DashboardData {
  items: WatchlistItem[];
  quotes: Record<string, Quote>;
  indicators: Record<string, IndicatorSnapshot>;
  settings: AppSettings;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useDashboardData(): DashboardData {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [indicators, setIndicators] = useState<Record<string, IndicatorSnapshot>>({});
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [nextItems, nextQuotes, nextIndicators, nextSettings] = await Promise.all([
        listWatchlist(),
        db.quotes.toArray(),
        db.indicatorSnapshots.toArray(),
        getSettings(),
      ]);
      setItems(nextItems);
      setQuotes(Object.fromEntries(nextQuotes.map((quote) => [quote.securityKey, quote])));
      setIndicators(Object.fromEntries(nextIndicators.map((snapshot) => [snapshot.securityKey, snapshot])));
      setSettings(nextSettings);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取本地数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void initializeDatabase().then(reload).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : '本地存储不可用');
      setLoading(false);
    });
  }, [reload]);

  return { items, quotes, indicators, settings, loading, error, reload };
}
