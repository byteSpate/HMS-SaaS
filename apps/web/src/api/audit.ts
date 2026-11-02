// Audit search endpoint (T-PLT-02; FR-AUD-005; SCR-24). The API checks audit.view on every request.
import { auditEventSchema, type AuditEventRow } from '@hms/contracts';
import { apiPage, type Page } from './client';

export interface AuditFilters {
  actor?: string;
  action?: string;
  targetId?: string;
  from?: string;
  to?: string;
}

export const auditApi = {
  search: (filters: AuditFilters, cursor?: string): Promise<Page<AuditEventRow>> => {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(filters)) {
      if (value) query.set(name, value);
    }
    if (cursor) query.set('cursor', cursor);
    return apiPage(`/audit/events?${query.toString()}`, (item) => auditEventSchema.parse(item));
  },
};
