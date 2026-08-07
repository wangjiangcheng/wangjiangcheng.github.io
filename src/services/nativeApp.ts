import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

function closeTopOverlay(): boolean {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
  const closeButton = dialogs.at(-1)?.querySelector<HTMLButtonElement>('button[aria-label="关闭"]');
  if (!closeButton) return false;
  closeButton.click();
  return true;
}

export async function initializeNativeApp(): Promise<void> {
  if (!isNativeApp()) return;
  document.documentElement.dataset.nativePlatform = Capacitor.getPlatform();

  await Promise.allSettled([
    StatusBar.setOverlaysWebView({ overlay: false }),
    StatusBar.setBackgroundColor({ color: '#0e203b' }),
    StatusBar.setStyle({ style: Style.Light }),
  ]);

  await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (closeTopOverlay()) return;
    if (window.location.hash.replace(/^#/, '') === '/settings') {
      window.location.hash = '#/';
      return;
    }
    if (canGoBack && window.history.length > 1) {
      window.history.back();
      return;
    }
    void CapacitorApp.exitApp();
  });

  await SplashScreen.hide();
}
