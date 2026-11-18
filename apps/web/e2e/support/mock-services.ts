// In-memory stand-in for the service catalogue endpoints (T-ORD-01), answering with payloads that
// satisfy the shared contracts. The real behaviour (code rule, version checks, audit) is covered
// by apps/api/src/services.api.spec.ts. Codes and names are synthetic.
import {
  createServiceRequestSchema,
  serviceListSchema,
  serviceRecordSchema,
  updateServiceRequestSchema,
  type ServiceRecord,
} from '@hms/contracts';

const ID = (n: number): string => `0199e0b0-0000-7000-8000-${String(n).padStart(12, '0')}`;

const problem = (status: number, code: string, fields?: { path: string; message: string }[]) => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code, ...(fields ? { fields } : {}) },
});

export function createServiceStore() {
  let next = 1020;
  const services: ServiceRecord[] = [
    {
      serviceItemId: ID(1001),
      code: 'CBC',
      category: 'LAB',
      nameBn: null,
      nameEn: 'Complete blood count',
      directlyOrderable: true,
      reportHours: 6,
      active: true,
      version: 1,
    },
    {
      serviceItemId: ID(1002),
      code: 'XRAY-CHEST',
      category: 'IMAGING',
      nameBn: null,
      nameEn: 'Chest X-ray',
      directlyOrderable: false,
      reportHours: 24,
      active: true,
      version: 1,
    },
  ];

  function create(body: unknown) {
    const request = createServiceRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (services.some((row) => row.code === request.data.code)) {
      return problem(422, 'VALIDATION_FAILED', [{ path: 'code', message: 'Code in use' }]);
    }
    const created = serviceRecordSchema.parse({
      nameBn: null,
      nameEn: null,
      ...request.data,
      serviceItemId: ID(next++),
      active: true,
      version: 1,
    });
    services.push(created);
    return { status: 201, body: created };
  }

  function update(serviceItemId: string, body: unknown) {
    const index = services.findIndex((row) => row.serviceItemId === serviceItemId);
    const stored = services[index];
    if (!stored) return problem(404, 'NOT_FOUND');
    const request = updateServiceRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const { expectedVersion, ...fields } = request.data;
    if (expectedVersion !== stored.version) return problem(409, 'STALE_RECORD');
    const updated = serviceRecordSchema.parse({
      ...stored,
      nameBn: null,
      nameEn: null,
      ...fields,
      version: stored.version + 1,
    });
    services[index] = updated;
    return { status: 200, body: updated };
  }

  function answer(method: string, path: string, body: unknown) {
    if (path === '/billing/services' && method === 'GET') {
      return { status: 200, body: serviceListSchema.parse({ services }) };
    }
    if (path === '/billing/services' && method === 'POST') return create(body);
    const match = /^\/billing\/services\/([0-9a-f-]+)$/.exec(path);
    if (match?.[1] && method === 'PUT') return update(match[1], body);
    return null;
  }

  return { answer, services };
}
