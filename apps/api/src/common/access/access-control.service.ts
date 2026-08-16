import { ForbiddenException, Injectable } from '@nestjs/common';
import type { RoleName } from '@exam/types';
import type { AuthUser } from '../types/auth';

/**
 * Central scope-aware authorization helper (applied at the
 * service layer where the resource's faculty/department is known). Guards handle role gating;
 * this handles the *scope* question: "is this user allowed to touch data in THIS department?"
 */
@Injectable()
export class AccessControlService {
  isSuperAdmin(user: AuthUser): boolean {
    return user.roles.some((r) => r.role === 'super_admin');
  }

  hasRole(user: AuthUser, ...roles: RoleName[]): boolean {
    return user.roles.some((r) => roles.includes(r.role));
  }

  /** Whether the user may act on a faculty (super_admin, or an admin unscoped / scoped to it). */
  canAccessFaculty(user: AuthUser, facultyId: number): boolean {
    if (this.isSuperAdmin(user)) return true;
    return user.roles.some(
      (r) => r.role === 'admin' && (r.scopeFacultyId === null || r.scopeFacultyId === facultyId),
    );
  }

  assertFaculty(user: AuthUser, facultyId: number): void {
    if (!this.canAccessFaculty(user, facultyId)) {
      throw new ForbiddenException('Outside your faculty scope');
    }
  }

  /**
   * Whether the user may act on a department. super_admin always; an admin unscoped or scoped to
   * the department's faculty; a department_head scoped to that exact department.
   */
  canAccessDepartment(user: AuthUser, departmentId: number, facultyId?: number): boolean {
    if (this.isSuperAdmin(user)) return true;
    return user.roles.some((r) => {
      if (r.role === 'admin') {
        return (
          r.scopeFacultyId === null || (facultyId !== undefined && r.scopeFacultyId === facultyId)
        );
      }
      if (r.role === 'department_head') {
        return r.scopeDepartmentId === departmentId;
      }
      return false;
    });
  }

  assertDepartment(user: AuthUser, departmentId: number, facultyId?: number): void {
    if (!this.canAccessDepartment(user, departmentId, facultyId)) {
      throw new ForbiddenException('Outside your department scope');
    }
  }
}
