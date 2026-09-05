import * as React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import type { SessionUser } from '@exam/types';
import { navForRoles, orgHomePath } from '@/config/nav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const INSTITUTION = import.meta.env.VITE_INSTITUTION_NAME ?? 'University of Rajshahi';

export function AppShell({ user }: { user: SessionUser }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();
  const items = React.useMemo(() => {
    const orgHome = orgHomePath(user);
    // Point "Organization" at the scoped home (own department / own faculty) when the
    // user isn't a super admin, so scoped staff skip the faculties list entirely.
    return navForRoles(user.roles.map((r) => r.role)).map((it) =>
      it.path === '/org' && orgHome !== '/org' ? { ...it, path: orgHome } : it,
    );
  }, [user]);

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
        {/* Fluid width: grows with the viewport, capped generously on very wide
            screens so text lines never become unreadably long. */}
        <main className="mx-auto w-full max-w-[1600px] px-4 py-8 lg:px-8 2xl:max-w-[1920px] 2xl:px-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
