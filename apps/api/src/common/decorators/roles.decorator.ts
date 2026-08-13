import { SetMetadata } from '@nestjs/common';
import type { RoleName } from '@exam/types';

export const ROLES_KEY = 'roles';

/** Restricts a route to principals holding at least one of the given roles (checked by RolesGuard). */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
