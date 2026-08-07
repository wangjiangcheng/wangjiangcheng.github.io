const HISTORY_LAST_ATTEMPT_KEY = 'money-from-everywhere-history-last-attempt';

export function readHistoryLastAttempt(): number | null {
  try {
    const stored = globalThis.localStorage?.getItem(HISTORY_LAST_ATTEMPT_KEY);
    if (stored == null) return 0;
    const value = Number(stored);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return null;
  }
}

export function writeHistoryLastAttempt(value: number): void {
  try {
    globalThis.localStorage?.setItem(HISTORY_LAST_ATTEMPT_KEY, String(value));
  } catch {
    // The hook also keeps an in-memory timestamp for restricted storage contexts.
  }
}

export function resetHistoryLastAttempt(): void {
  try {
    globalThis.localStorage?.removeItem(HISTORY_LAST_ATTEMPT_KEY);
  } catch {
    // Clearing the IndexedDB cache remains useful when local storage is restricted.
  }
}
