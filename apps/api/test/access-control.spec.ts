import { describe, expect, it } from 'vitest';
import { AccessControlService } from '../src/common/access/access-control.service';
import type { AuthUser } from '../src/common/types/auth';

const acl = new AccessControlService();

function user(roles: AuthUser['roles']): AuthUser {
  return {
    id: 1,
    publicId: 'p',
    username: 'u',
    email: null,
    displayName: 'U',
    status: 'active',
    mustChangePassword: false,
    twoFactorEnabled: false,
    roles,
  };
}

describe('AccessControlService (scoped RBAC)', () => {
  it('super_admin reaches any department or faculty', () => {
    const u = user([{ role: 'super_admin', scopeFacultyId: null, scopeDepartmentId: null }]);
    expect(acl.isSuperAdmin(u)).toBe(true);
    expect(acl.canAccessDepartment(u, 5, 2)).toBe(true);
    expect(acl.canAccessFaculty(u, 9)).toBe(true);
  });

  it('unscoped admin reaches any department', () => {
    const u = user([{ role: 'admin', scopeFacultyId: null, scopeDepartmentId: null }]);
    expect(acl.canAccessDepartment(u, 5, 2)).toBe(true);
  });

  it('faculty-scoped admin is confined to its faculty', () => {
    const u = user([{ role: 'admin', scopeFacultyId: 2, scopeDepartmentId: null }]);
    expect(acl.canAccessDepartment(u, 5, 2)).toBe(true);
    expect(acl.canAccessDepartment(u, 5, 3)).toBe(false);
    expect(acl.canAccessFaculty(u, 2)).toBe(true);
    expect(acl.canAccessFaculty(u, 3)).toBe(false);
  });

  it('department_head is confined to its own department', () => {
    const u = user([{ role: 'department_head', scopeFacultyId: null, scopeDepartmentId: 7 }]);
    expect(acl.canAccessDepartment(u, 7)).toBe(true);
    expect(acl.canAccessDepartment(u, 8)).toBe(false);
  });

  it('a plain teacher has no administrative department access', () => {
    const u = user([{ role: 'teacher', scopeFacultyId: null, scopeDepartmentId: null }]);
    expect(acl.canAccessDepartment(u, 7)).toBe(false);
    expect(acl.canAccessFaculty(u, 1)).toBe(false);
  });
});
