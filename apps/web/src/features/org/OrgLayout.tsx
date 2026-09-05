import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/org', label: 'Departments', end: true, adminOnly: false },
  { to: '/org/batches', label: 'Sessions', end: false, adminOnly: false },
  { to: '/org/students', label: 'Students', end: false, adminOnly: false },
  { to: '/org/teachers', label: 'Teachers', end: false, adminOnly: false },
];

export function OrgLayout() {
  const { data: user } = useSession();
  const isAdmin = (user?.roles ?? []).some((r) => r.role === 'admin' || r.role === 'super_admin');
  const visible = tabs.filter((t) => isAdmin || !t.adminOnly);

  return (
    <div className="w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {isAdmin
            ? 'Manage the academic structure, sessions, students and teachers. Import, export and templates are on each page.'
            : 'View your department’s structure, sessions, students and faculty.'}
        </p>
      </header>

      <nav className="mb-6 flex gap-1 border-b">
        {visible.map((t) => (
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
