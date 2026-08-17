import { GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { NavItem } from '@/config/nav';
import { cn } from '@/lib/utils';

interface SidebarProps {
  items: NavItem[];
  institution: string;
  mobileOpen: boolean;
  onNavigate: () => void;
}

export function Sidebar({ items, institution, mobileOpen, onNavigate }: SidebarProps) {
  const [logoOk, setLogoOk] = useState(true);
  return (
    <>
      {mobileOpen && (
        <div
          className="bg-foreground/20 fixed inset-0 z-30 backdrop-blur-sm lg:hidden"
          onClick={onNavigate}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'border-border bg-card fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r transition-transform duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-border flex h-16 items-center gap-2.5 border-b px-5">
          {logoOk ? (
            <img
              src="/ru-logo.png"
              alt={institution}
              className="h-9 w-9 shrink-0 object-contain"
              onError={() => setLogoOk(false)}
            />
          ) : (
            <div className="bg-primary text-primary-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
              <GraduationCap className="size-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium leading-tight">{institution}</div>
            <div className="text-muted-foreground text-xs">Examination System</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <item.icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-border text-muted-foreground border-t px-5 py-3 text-xs">
          University of Rajshahi
        </div>
      </aside>
    </>
  );
}
