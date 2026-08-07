import { useCallback, useEffect, useRef, useState } from 'react';
import type { WatchlistItem } from '../types/market';
import type { AppSettings } from '../types/settings';
import { readHistoryLastAttempt, writeHistoryLastAttempt } from '../services/historyRefreshSchedule';
import { refreshHistoryData, refreshQuoteData } from '../services/marketRefresh';

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
  const historyRunningRef = useRef(false);
  const nextRunAtRef = useRef(Date.now());
  const historyLastAttemptRef = useRef(readHistoryLastAttempt() ?? 0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const quoteErrorsRef = useRef<Record<string, string>>({});
  const historyErrorsRef = useRef<Record<string, string>>({});
  const knownItemKeysRef = useRef<Set<string> | null>(null);
  const itemBaselineReadyRef = useRef(false);
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
      const result = await refreshQuoteData(activeItems, activeSettings);
      quoteErrorsRef.current = result.errors;
      await reload();
      const now = new Date().toISOString();
      setState((current) => ({
        ...current,
        refreshing: false,
        lastSuccessAt: now,
        lastDurationMs: result.durationMs,
        returnedCount: result.quotes.length,
        rowErrors: { ...quoteErrorsRef.current, ...historyErrorsRef.current },
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

  const executeHistoryRefresh = useCallback(async () => {
    const activeItems = itemsRef.current;
    const activeSettings = settingsRef.current;
    if (historyRunningRef.current || activeItems.length === 0 || !navigator.onLine) return;
    historyRunningRef.current = true;
    const attemptedAt = Date.now();
    historyLastAttemptRef.current = attemptedAt;
    writeHistoryLastAttempt(attemptedAt);
    try {
      const result = await refreshHistoryData(activeItems, activeSettings);
      historyErrorsRef.current = result.errors;
      await reload();
      setState((current) => ({
        ...current,
        rowErrors: { ...quoteErrorsRef.current, ...historyErrorsRef.current },
      }));
      channelRef.current?.postMessage({ type: 'snapshot-updated', at: new Date().toISOString() });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '历史 K 线刷新失败';
      historyErrorsRef.current = Object.fromEntries(activeItems.map((item) => [item.securityKey, message]));
      setState((current) => ({
        ...current,
        rowErrors: { ...quoteErrorsRef.current, ...historyErrorsRef.current },
      }));
    } finally {
      historyRunningRef.current = false;
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

  const refreshHistoryNow = useCallback(async () => {
    const locks = navigator.locks;
    if (locks) {
      await locks.request('money-from-everywhere-history-refresh', { ifAvailable: true }, async (lock) => {
        if (lock) await executeHistoryRefresh();
      });
      return;
    }
    if (document.visibilityState === 'visible') await executeHistoryRefresh();
  }, [executeHistoryRefresh]);

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
    if (!settings.pollingEnabled || state.paused || items.length === 0) return;
    const intervalMs = settings.historyRefreshIntervalMinutes * 60_000;
    const checkDue = () => {
      const persistedAttempt = readHistoryLastAttempt();
      const lastAttempt = persistedAttempt ?? historyLastAttemptRef.current;
      if (Date.now() - lastAttempt >= intervalMs && !historyRunningRef.current) void refreshHistoryNow();
    };
    checkDue();
    const timer = window.setInterval(checkDue, Math.min(intervalMs, 60_000));
    return () => window.clearInterval(timer);
  }, [items.length, refreshHistoryNow, settings.historyRefreshIntervalMinutes, settings.pollingEnabled, state.paused]);

  useEffect(() => {
    const currentKeys = new Set(items.map((item) => item.securityKey));
    const previousKeys = knownItemKeysRef.current;
    knownItemKeysRef.current = currentKeys;
    if (!itemBaselineReadyRef.current) {
      if (currentKeys.size > 0) itemBaselineReadyRef.current = true;
      return;
    }
    if (!previousKeys || !settings.pollingEnabled || state.paused) return;
    const hasNewItem = [...currentKeys].some((key) => !previousKeys.has(key));
    if (hasNewItem) void refreshHistoryNow();
  }, [items, refreshHistoryNow, settings.pollingEnabled, state.paused]);

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

  return { ...state, refreshNow, refreshHistoryNow, togglePaused };
}
