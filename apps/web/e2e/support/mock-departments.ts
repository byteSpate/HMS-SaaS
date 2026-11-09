// In-memory stand-in for the department endpoints (T-PRA-02), answering with payloads that satisfy
// the shared contracts. Used by the department browser tests; the real behaviour (RLS, audit,
// version checks) is covered by apps/api/src/departments.api.spec.ts. Names are synthetic.
import {
  createDepartmentRequestSchema,
  departmentListSchema,
  departmentRecordSchema,
  updateDepartmentRequestSchema,
  type DepartmentRecord,
} from '@hms/contracts';

const ID = (n: number): string => `0199e0b0-0000-7000-8000-${String(n).padStart(12, '0')}`;

export interface DepartmentAnswer {
  status: number;
  body?: unknown;
}

const problem = (status: number, code: string, fields?: { path: string; message: string }[]) => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code, ...(fields ? { fields } : {}) },
});

const codeTaken = () =>
  problem(422, 'VALIDATION_FAILED', [{ path: 'code', message: 'Code already used' }]);

export function createDepartmentStore() {
  let next = 602;
  const departments: DepartmentRecord[] = [
    {
      departmentId: ID(601),
      code: 'MED',
      nameBn: null,
      nameEn: 'Medicine',
      active: true,
      version: 1,
    },
  ];
  /** Set by a test to act as another administrator who saved first (SP-03). */
  const state = { changedElsewhere: false };

  const taken = (code: string, exceptId?: string) =>
    departments.some((row) => row.code === code && row.departmentId !== exceptId);

  function create(body: unknown): DepartmentAnswer {
    const request = createDepartmentRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (taken(request.data.code)) return codeTaken();
    const created = departmentRecordSchema.parse({
      departmentId: ID(next++),
      nameBn: null,
      nameEn: null,
      ...request.data,
      active: true,
      version: 1,
    });
    departments.push(created);
    return { status: 201, body: created };
  }

  function update(departmentId: string, body: unknown): DepartmentAnswer {
    const index = departments.findIndex((row) => row.departmentId === departmentId);
    const stored = departments[index];
    if (!stored) return problem(404, 'NOT_FOUND');
    const request = updateDepartmentRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const { expectedVersion, ...fields } = request.data;
    if (state.changedElsewhere || expectedVersion !== stored.version) {
      return problem(409, 'STALE_RECORD');
    }
    if (taken(fields.code, stored.departmentId)) return codeTaken();
    const updated = departmentRecordSchema.parse({
      departmentId: stored.departmentId,
      nameBn: null,
      nameEn: null,
      ...fields,
      version: stored.version + 1,
    });
    departments[index] = updated;
    return { status: 200, body: updated };
  }

  function answer(method: string, path: string, body: unknown): DepartmentAnswer | null {
    if (path === '/admin/departments' && method === 'GET') {
      const sorted = [...departments].sort((a, b) => Number(b.active) - Number(a.active));
      return { status: 200, body: departmentListSchema.parse({ departments: sorted }) };
    }
    if (path === '/admin/departments' && method === 'POST') return create(body);
    const match = /^\/admin\/departments\/([0-9a-f-]+)$/.exec(path);
    if (match?.[1] && method === 'PUT') return update(match[1], body);
    return null;
  }

  return { answer, departments, state };
}
