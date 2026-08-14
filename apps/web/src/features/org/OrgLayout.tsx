import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const ADMIN_TABS = [
  { to: '/org', label: 'Structure', end: true },
  { to: '/org/terms', label: 'Academic terms', end: false },
  { to: '/org/offerings', label: 'Course offerings', end: false },
];

export function OrgLayout() {
  const { data: user } = useSession();
  const isAdmin = (user?.roles ?? []).some((r) => r.role === 'admin' || r.role === 'super_admin');
  // Structure + terms are admin-only; a department head sees only offerings.
  const tabs = isAdmin
    ? ADMIN_TABS
    : [{ to: '/org/offerings', label: 'Course offerings', end: false }];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage the academic structure, terms, and course offerings.
        </p>
      </header>

      <nav className="mb-6 flex gap-1 border-b">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
