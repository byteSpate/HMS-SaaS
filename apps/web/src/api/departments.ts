// Department master endpoints (T-PRA-02; FR-CFG-001). Every answer is checked against the shared
// contract. A repeated create is refused by the code rule, so no Idempotency-Key is needed.
import {
  departmentListSchema,
  departmentRecordSchema,
  type CreateDepartmentRequest,
  type UpdateDepartmentRequest,
} from '@hms/contracts';
import { apiRequest } from './client';

export const DEPARTMENTS_QUERY_KEY = ['departments'] as const;

export const departmentsApi = {
  list: () =>
    apiRequest('/admin/departments', {
      parse: (data) => departmentListSchema.parse(data).departments,
    }),
  create: (body: CreateDepartmentRequest) =>
    apiRequest('/admin/departments', {
      method: 'POST',
      body,
      parse: (data) => departmentRecordSchema.parse(data),
    }),
  update: (departmentId: string, body: UpdateDepartmentRequest) =>
    apiRequest(`/admin/departments/${departmentId}`, {
      method: 'PUT',
      body,
      parse: (data) => departmentRecordSchema.parse(data),
    }),
};
