export interface AppSettings {
  id: 'main';
  refreshIntervalSeconds: number;
  historyRefreshIntervalMinutes: number;
  staleAfterSeconds: number;
  expiredAfterSeconds: number;
  pollingEnabled: boolean;
  closedMarketPolling: boolean;
  retryCount: number;
  bollingerPeriods: number;
  bollingerMultiplier: number;
  colorRule: 'CN' | 'GLOBAL';
  hiddenColumns: string[];
  lastExportedAt: string | null;
  hasUnbackedChanges: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'main',
  refreshIntervalSeconds: 15,
  historyRefreshIntervalMinutes: 1440,
  staleAfterSeconds: 45,
  expiredAfterSeconds: 300,
  pollingEnabled: true,
  closedMarketPolling: false,
  retryCount: 2,
  bollingerPeriods: 20,
  bollingerMultiplier: 2,
  colorRule: 'CN',
  hiddenColumns: [],
  lastExportedAt: null,
  hasUnbackedChanges: false,
};

export function normalizeSettings(settings?: Partial<AppSettings> | null): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    hiddenColumns: settings?.hiddenColumns ?? DEFAULT_SETTINGS.hiddenColumns,
  };
}
