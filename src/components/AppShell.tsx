import { BarChart3, BookOpenText, Settings } from 'lucide-react';
import type { ReactNode } from 'react';

export type AppRoute = '/' | '/diary' | '/settings';

interface AppShellProps {
  route: AppRoute;
  children: ReactNode;
}

export function AppShell({ route, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand__mark">钱</span><div><strong>钱从四面八方来</strong><small>红绿与布林带观察台</small></div></div>
        <nav aria-label="主导航">
          <a aria-label="红绿观察台" className={route === '/' ? 'active' : ''} href="#/"><BarChart3 size={19} /><span>红绿观察台</span></a>
          <a aria-label="日记" className={route === '/diary' ? 'active' : ''} href="#/diary"><BookOpenText size={19} /><span>日记</span></a>
          <a aria-label="系统配置" className={route === '/settings' ? 'active' : ''} href="#/settings"><Settings size={19} /><span>系统配置</span></a>
        </nav>
        <div className="sidebar__footer"><span>数据源</span><strong>东方财富</strong><small>公开网页接口，仅供个人验证</small></div>
      </aside>
      <main className="main-content">{children}<footer className="legal-footer">行情可能延迟，数据仅供参考，不构成投资建议。</footer></main>
    </div>
  );
}
