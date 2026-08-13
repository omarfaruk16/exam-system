import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { RoleName } from '@exam/types';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Phase the section becomes functional — used to label placeholders during the build. */
  phase: number;
}

const HOME: NavItem = { label: 'Dashboard', path: '/', icon: LayoutDashboard, phase: 1 };

const BY_ROLE: Record<RoleName, NavItem[]> = {
  super_admin: [
    HOME,
    { label: 'Organization', path: '/org', icon: Building2, phase: 2 },
    { label: 'Students', path: '/students', icon: Upload, phase: 2 },
    { label: 'Exams', path: '/exams', icon: FileCheck2, phase: 3 },
    { label: 'Reports', path: '/reports', icon: BarChart3, phase: 5 },
    { label: 'Users', path: '/users', icon: Users, phase: 2 },
    { label: 'Audit Log', path: '/audit', icon: ScrollText, phase: 2 },
  ],
  admin: [
    HOME,
    { label: 'Organization', path: '/org', icon: Building2, phase: 2 },
    { label: 'Students', path: '/students', icon: Upload, phase: 2 },
    { label: 'Exams', path: '/exams', icon: FileCheck2, phase: 3 },
    { label: 'Reports', path: '/reports', icon: BarChart3, phase: 5 },
    { label: 'Audit Log', path: '/audit', icon: ScrollText, phase: 2 },
  ],
  department_head: [
    HOME,
    { label: 'Department', path: '/department', icon: Building2, phase: 2 },
    { label: 'Teachers', path: '/teachers', icon: Users, phase: 2 },
    { label: 'Exams', path: '/exams', icon: FileCheck2, phase: 3 },
    { label: 'Reports', path: '/reports', icon: BarChart3, phase: 5 },
  ],
  teacher: [
    HOME,
    { label: 'My Courses', path: '/courses', icon: BookOpen, phase: 2 },
    { label: 'Exams', path: '/exams', icon: FileCheck2, phase: 3 },
    { label: 'Question Bank', path: '/questions', icon: ListChecks, phase: 3 },
    { label: 'Grading', path: '/grading', icon: ClipboardCheck, phase: 5 },
  ],
  student: [
    HOME,
    { label: 'My Exams', path: '/my-exams', icon: GraduationCap, phase: 4 },
    { label: 'Results', path: '/results', icon: BarChart3, phase: 5 },
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
