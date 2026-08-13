import { KeyRound, LogOut, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { SessionUser } from '@exam/types';
import { ThemeToggle } from '@/components/theme';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout } from '@/lib/session';
import { initials, primaryRoleLabel } from '@/lib/user';

interface TopbarProps {
  title: string;
  user: SessionUser;
  onMenu: () => void;
}

export function Topbar({ title, user, onMenu }: TopbarProps) {
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <header className="border-border bg-background/85 sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-4 backdrop-blur lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenu}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>
      <h1 className="text-base font-medium">{title}</h1>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="hover:bg-accent focus-visible:ring-ring flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2">
              <Avatar>
                <AvatarFallback>{initials(user.displayName)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:block">{user.displayName}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="font-medium">{user.displayName}</div>
              <div className="text-muted-foreground text-xs font-normal">
                {primaryRoleLabel(user)}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/change-password')}>
              <KeyRound />
              Change password
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => logout.mutate()}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
