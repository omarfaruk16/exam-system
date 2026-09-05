import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Table2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { RoleName, SessionUser } from '@exam/types';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

/**
 * Where "Organization" should take a user, honouring their scope:
 * - a department head lands straight on their own department page,
 * - a faculty-scoped admin lands on their own faculty,
 * - super admins and unscoped admins get the full faculties list.
 */
export function orgHomePath(user: Pick<SessionUser, 'roles'>): string {
  const roles = user.roles;
  if (roles.some((r) => r.role === 'super_admin')) return '/org';
  const dh = roles.find((r) => r.role === 'department_head' && r.scopeDepartment);
  if (dh?.scopeDepartment) return `/org/departments/${dh.scopeDepartment.publicId}`;
  const fa = roles.find((r) => r.role === 'admin' && r.scopeFaculty);
  if (fa?.scopeFaculty) return `/org/faculties/${fa.scopeFaculty.publicId}`;
  return '/org';
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
    { label: 'Final Marking', path: '/final-marking', icon: Table2 },
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
    { label: 'Final Marking', path: '/final-marking', icon: Table2 },
    { label: 'Reports', path: '/reports', icon: BarChart3 },
    { label: 'Audit Log', path: '/audit', icon: ScrollText },
  ],
  department_head: [
    HOME,
    { label: 'Organization', path: '/org', icon: Building2 },
    { label: 'Question Bank', path: '/questions', icon: ListChecks },
    { label: 'Review', path: '/review', icon: ClipboardCheck },
    { label: 'Results', path: '/exam-results', icon: ClipboardList },
    { label: 'Final Marking', path: '/final-marking', icon: Table2 },
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
    { label: 'My Record', path: '/my-record', icon: Layers },
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
