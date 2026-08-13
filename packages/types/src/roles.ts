/**
 * Canonical role names. Kept in sync with the `Role.name` enum in the Prisma schema.
 * RBAC is scoped: a role assignment may carry a faculty and/or department scope.
 */
export const ROLE_NAMES = [
  'super_admin',
  'admin',
  'department_head',
  'teacher',
  'student',
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  department_head: 'Department Head',
  teacher: 'Teacher',
  student: 'Student',
};

/** Roles that can alter marks and therefore require TOTP 2FA (see §5 of the brief). */
export const TWO_FACTOR_REQUIRED_ROLES: readonly RoleName[] = [
  'super_admin',
  'admin',
  'department_head',
  'teacher',
];

export const USER_STATUS = ['active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUS)[number];
