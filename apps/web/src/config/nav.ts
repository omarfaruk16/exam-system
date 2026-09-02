import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { RoleName } from '@exam/types';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

const HOME: NavItem = { label: 'Dashboard', path: '/', icon: LayoutDashboard };

const BY_ROLE: Record<RoleName, NavItem[]> = {
  super_admin: [
    HOME,
    { label: 'Organization', path: '/org', icon: Building2 },
    { label: 'Exams', path: '/exams', icon: FileCheck2 },
    { label: 'Question Bank', path: '/questions', icon: ListChecks },
    { label: 'Review', path: '/review', icon: ClipboardCheck },
    { label: 'Results', path: '/exam-results', icon: ClipboardList },
    { label: 'Reports', path: '/reports', icon: BarChart3 },
    { label: 'Users', path: '/users', icon: Users },
    { label: 'Audit Log', path: '/audit', icon: ScrollText },
  ],
  admin: [
    HOME,
    { label: 'Organization', path: '/org', icon: Building2 },
    { label: 'Exams', path: '/exams', icon: FileCheck2 },
    { label: 'Question Bank', path: '/questions', icon: ListChecks },
    { label: 'Review', path: '/review', icon: ClipboardCheck },
    { label: 'Results', path: '/exam-results', icon: ClipboardList },
    { label: 'Reports', path: '/reports', icon: BarChart3 },
    { label: 'Audit Log', path: '/audit', icon: ScrollText },
  ],
  department_head: [
    HOME,
    { label: 'Organization', path: '/org', icon: Building2 },
    { label: 'Question Bank', path: '/questions', icon: ListChecks },
    { label: 'Review', path: '/review', icon: ClipboardCheck },
    { label: 'Results', path: '/exam-results', icon: ClipboardList },
    { label: 'Reports', path: '/reports', icon: BarChart3 },
  ],
  teacher: [
    HOME,
    { label: 'My Courses', path: '/courses', icon: BookOpen },
    { label: 'Exams', path: '/exams', icon: FileCheck2 },
    { label: 'Question Bank', path: '/questions', icon: ListChecks },
    { label: 'Grading', path: '/grading', icon: ClipboardCheck },
    { label: 'Results', path: '/exam-results', icon: ClipboardList },
    { label: 'Reports', path: '/reports', icon: BarChart3 },
  ],
  student: [
    HOME,
    { label: 'My Exams', path: '/my-exams', icon: GraduationCap },
    { label: 'My Results', path: '/results', icon: BarChart3 },
  ],
};

/** Union of the nav items for all of a user's roles, de-duplicated by path, in canonical order. */
export function navForRoles(roles: RoleName[]): NavItem[] {
  const seen = new Set<string>();
  const out: NavItem[] = [];
  const order: RoleName[] = ['super_admin', 'admin', 'department_head', 'teacher', 'student'];
  for (const role of order) {
    if (!roles.includes(role)) continue;
    for (const item of BY_ROLE[role]) {
      if (seen.has(item.path)) continue;
      seen.add(item.path);
      out.push(item);
    }
  }
  return out.length > 0 ? out : [HOME];
}
