// In-memory stand-in for the practitioner endpoints (T-PRA-01), answering with payloads that satisfy
// the shared contracts. Used by the practitioner browser tests; the real behaviour (RLS, audit,
// version checks) is covered by apps/api/src/practitioners.api.spec.ts. Names are synthetic.
import {
  createPractitionerRequestSchema,
  practitionerListSchema,
  practitionerSchema,
  updatePractitionerRequestSchema,
  type Practitioner,
} from '@hms/contracts';

const ID = (n: number): string => `0199e0b0-0000-7000-8000-${String(n).padStart(12, '0')}`;

export interface PractitionerAnswer {
  status: number;
  body?: unknown;
}

const problem = (status: number, code: string): PractitionerAnswer => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code },
});

export function createPractitionerStore() {
  let next = 502;
  const practitioners: Practitioner[] = [
    {
      practitionerId: ID(501),
      nameBn: null,
      nameEn: 'Nasrin Akter',
      degrees: 'MBBS, FCPS (Paediatrics)',
      specialty: 'Paediatrics',
      phone: null,
      registrationNo: 'A-40001',
      active: true,
      version: 1,
    },
  ];
  /** Set by a test to act as another administrator who saved first (SP-03). */
  const state = { changedElsewhere: false };

  function answer(method: string, path: string, body: unknown): PractitionerAnswer | null {
    if (path === '/practitioners' && method === 'GET') {
      const sorted = [...practitioners].sort((a, b) => Number(b.active) - Number(a.active));
      return { status: 200, body: practitionerListSchema.parse({ practitioners: sorted }) };
    }
    if (path === '/practitioners' && method === 'POST') {
      const request = createPractitionerRequestSchema.safeParse(body);
      if (!request.success) return problem(422, 'VALIDATION_FAILED');
      const created = practitionerSchema.parse({
        practitionerId: ID(next++),
        nameBn: null,
        nameEn: null,
        degrees: null,
        specialty: null,
        phone: null,
        registrationNo: null,
        ...request.data,
        active: true,
        version: 1,
      });
      practitioners.push(created);
      return { status: 201, body: created };
    }
    const match = /^\/practitioners\/([0-9a-f-]+)$/.exec(path);
    if (match && method === 'PUT') {
      const index = practitioners.findIndex((row) => row.practitionerId === match[1]);
      const stored = practitioners[index];
      if (!stored) return problem(404, 'NOT_FOUND');
      const request = updatePractitionerRequestSchema.safeParse(body);
      if (!request.success) return problem(422, 'VALIDATION_FAILED');
      const { expectedVersion, ...fields } = request.data;
      if (state.changedElsewhere || expectedVersion !== stored.version) {
        return problem(409, 'STALE_RECORD');
      }
      const updated = practitionerSchema.parse({
        practitionerId: stored.practitionerId,
        nameBn: null,
        nameEn: null,
        degrees: null,
        specialty: null,
        phone: null,
        registrationNo: null,
        ...fields,
        version: stored.version + 1,
      });
      practitioners[index] = updated;
      return { status: 200, body: updated };
    }
    return null;
  }

  return { answer, practitioners, state };
}
