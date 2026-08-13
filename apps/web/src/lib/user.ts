import { ROLE_LABELS, type SessionUser } from '@exam/types';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function primaryRoleLabel(user: SessionUser): string {
  const role = user.roles[0]?.role;
  return role ? ROLE_LABELS[role] : 'User';
}
