import { useCallback, useEffect, useRef, useState } from 'react';
import type { WatchlistItem } from '../types/market';
import type { AppSettings } from '../types/settings';
import { refreshMarketData } from '../services/marketRefresh';

interface RefreshState {
  refreshing: boolean;
  paused: boolean;
  secondsLeft: number;
  lastSuccessAt: string | null;
  lastDurationMs: number | null;
  returnedCount: number;
  error: string | null;
  rowErrors: Record<string, string>;
}

const CHANNEL_NAME = 'money-from-everywhere-snapshots';

export function useMarketRefresh(
  items: WatchlistItem[],
  settings: AppSettings,
  reload: () => Promise<void>,
) {
  const [state, setState] = useState<RefreshState>({
    refreshing: false,
    paused: false,
    secondsLeft: settings.refreshIntervalSeconds,
    lastSuccessAt: null,
    lastDurationMs: null,
    returnedCount: 0,
    error: null,
    rowErrors: {},
  });
  const runningRef = useRef(false);
  const nextRunAtRef = useRef(Date.now());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const itemsRef = useRef(items);
  const settingsRef = useRef(settings);
  itemsRef.current = items;
  settingsRef.current = settings;

  const executeRefresh = useCallback(async () => {
    const activeItems = itemsRef.current;
    const activeSettings = settingsRef.current;
    if (runningRef.current || activeItems.length === 0 || !navigator.onLine) return;
    runningRef.current = true;
    setState((current) => ({ ...current, refreshing: true, error: null }));
    try {
      const result = await refreshMarketData(activeItems, activeSettings);
      await reload();
      const now = new Date().toISOString();
      setState((current) => ({
        ...current,
        refreshing: false,
        lastSuccessAt: now,
        lastDurationMs: result.durationMs,
        returnedCount: result.quotes.length,
        rowErrors: result.errors,
        error: null,
      }));
      channelRef.current?.postMessage({ type: 'snapshot-updated', at: now });
    } catch (reason) {
      setState((current) => ({
        ...current,
        refreshing: false,
        error: reason instanceof Error ? reason.message : '行情刷新失败',
      }));
    } finally {
      runningRef.current = false;
      nextRunAtRef.current = Date.now() + activeSettings.refreshIntervalSeconds * 1000;
    }
  }, [reload]);

  const refreshNow = useCallback(async () => {
    const locks = navigator.locks;
    if (locks) {
      await locks.request('money-from-everywhere-refresh', { ifAvailable: true }, async (lock) => {
        if (lock) await executeRefresh();
      });
      return;
    }
    if (document.visibilityState === 'visible') await executeRefresh();
  }, [executeRefresh]);

  useEffect(() => {
    channelRef.current = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
    const channel = channelRef.current;
    if (channel) channel.onmessage = () => void reload();
    return () => {
      channel?.close();
      channelRef.current = null;
    };
  }, [reload]);

  useEffect(() => {
    if (!settings.pollingEnabled || state.paused || items.length === 0) return;
    nextRunAtRef.current = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((nextRunAtRef.current - Date.now()) / 1000));
      setState((current) => ({ ...current, secondsLeft: remaining }));
      if (remaining === 0 && !runningRef.current) void refreshNow();
    }, 1000);
    void refreshNow();
    return () => window.clearInterval(timer);
  }, [items.length, refreshNow, settings.pollingEnabled, state.paused]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !state.paused) void refreshNow();
    };
    const onOnline = () => void refreshNow();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [refreshNow, state.paused]);

  const togglePaused = useCallback(() => {
    setState((current) => ({ ...current, paused: !current.paused }));
  }, []);

  return { ...state, refreshNow, togglePaused };
}
