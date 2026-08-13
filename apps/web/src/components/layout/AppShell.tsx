import * as React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import type { SessionUser } from '@exam/types';
import { navForRoles } from '@/config/nav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const INSTITUTION = import.meta.env.VITE_INSTITUTION_NAME ?? 'University of Rajshahi';

export function AppShell({ user }: { user: SessionUser }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();
  const items = React.useMemo(() => navForRoles(user.roles.map((r) => r.role)), [user.roles]);

  const current = items.find((i) =>
    i.path === '/' ? location.pathname === '/' : location.pathname.startsWith(i.path),
  );

  return (
    <div className="min-h-screen">
      <Sidebar
        items={items}
        institution={INSTITUTION}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />
      <div className="lg:pl-64">
        <Topbar
          title={current?.label ?? 'Dashboard'}
          user={user}
          onMenu={() => setMobileOpen(true)}
        />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
