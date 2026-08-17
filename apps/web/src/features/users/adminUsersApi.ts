import type { AdminUserRow } from '@exam/types';
import { api } from '@/lib/api';

export const fetchAdminUsers = () => api.get<AdminUserRow[]>('/admin-users');

export const createAdminUser = (b: {
  username: string;
  displayName: string;
  email?: string;
  role: 'admin' | 'department_head';
  scopeFacultyPublicId?: string;
  scopeDepartmentPublicId?: string;
}) => api.post<AdminUserRow>('/admin-users', b);

export const updateAdminUser = (publicId: string, b: { displayName?: string; email?: string }) =>
  api.patch<AdminUserRow>(`/admin-users/${publicId}`, b);

export const deleteAdminUser = (publicId: string) => api.del(`/admin-users/${publicId}`);

export const setAdminUserPassword = (publicId: string, password: string) =>
  api.post<void>(`/admin-users/${publicId}/set-password`, { password });
