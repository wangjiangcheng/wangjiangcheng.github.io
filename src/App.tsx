import { useEffect, useState } from 'react';
import { AppShell, type AppRoute } from './components/AppShell';
import { useDashboardData } from './hooks/useDashboardData';
import { useMarketRefresh } from './hooks/useMarketRefresh';
import { DashboardPage } from './pages/DashboardPage';
import { DiaryPage } from './pages/DiaryPage';
import { SettingsPage } from './pages/SettingsPage';

function currentRoute(): AppRoute {
  const route = window.location.hash.replace(/^#/, '');
  return route === '/diary' || route === '/settings' ? route : '/';
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(currentRoute);
  const data = useDashboardData();
  const refresh = useMarketRefresh(data.items, data.settings, data.reload);

  useEffect(() => {
    if (!window.location.hash) window.location.hash = '#/';
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <AppShell route={route}>
      {route === '/settings' ? (
        <SettingsPage settings={data.settings} watchlistCount={data.items.length} reload={data.reload} />
      ) : route === '/diary' ? (
        <DiaryPage />
      ) : (
        <DashboardPage
          items={data.items}
          quotes={data.quotes}
          indicators={data.indicators}
          settings={data.settings}
          loading={data.loading}
          loadError={data.error}
          refresh={refresh}
          reload={data.reload}
        />
      )}
    </AppShell>
  );
}
