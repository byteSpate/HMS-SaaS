// In-memory stand-in for the practitioner endpoints (T-PRA-01), answering with payloads that satisfy
// the shared contracts. Used by the practitioner browser tests; the real behaviour (RLS, audit,
// version checks) is covered by apps/api/src/practitioners.api.spec.ts. Names are synthetic.
import {
  createPractitionerRequestSchema,
  departmentChoiceListSchema,
  practitionerListSchema,
  practitionerSchema,
  updatePractitionerRequestSchema,
  type DepartmentChoice,
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

/** The hospital's active departments, as the picker offers them (T-PRA-02). */
const DEPARTMENT_CHOICES: DepartmentChoice[] = [
  { departmentId: ID(601), code: 'MED', nameBn: null, nameEn: 'Medicine' },
  { departmentId: ID(602), code: 'PAED', nameBn: null, nameEn: 'Paediatrics' },
];

const departmentOf = (departmentId: string | null | undefined): DepartmentChoice | null =>
  DEPARTMENT_CHOICES.find((choice) => choice.departmentId === departmentId) ?? null;

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
      department: null,
      active: true,
      version: 1,
    },
  ];
  /** Set by a test to act as another administrator who saved first (SP-03). */
  const state = { changedElsewhere: false };

  function create(body: unknown): PractitionerAnswer {
    const request = createPractitionerRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const { departmentId, ...fields } = request.data;
    const created = practitionerSchema.parse({
      practitionerId: ID(next++),
      nameBn: null,
      nameEn: null,
      degrees: null,
      specialty: null,
      phone: null,
      registrationNo: null,
      ...fields,
      department: departmentOf(departmentId),
      active: true,
      version: 1,
    });
    practitioners.push(created);
    return { status: 201, body: created };
  }

  function update(practitionerId: string, body: unknown): PractitionerAnswer {
    const index = practitioners.findIndex((row) => row.practitionerId === practitionerId);
    const stored = practitioners[index];
    if (!stored) return problem(404, 'NOT_FOUND');
    const request = updatePractitionerRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const { expectedVersion, departmentId, ...fields } = request.data;
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
      department: departmentOf(departmentId),
      version: stored.version + 1,
    });
    practitioners[index] = updated;
    return { status: 200, body: updated };
  }

  function answer(method: string, path: string, body: unknown): PractitionerAnswer | null {
    if (path === '/practitioners/department-choices' && method === 'GET') {
      return {
        status: 200,
        body: departmentChoiceListSchema.parse({ departments: DEPARTMENT_CHOICES }),
      };
    }
    if (path === '/practitioners' && method === 'GET') {
      const sorted = [...practitioners].sort((a, b) => Number(b.active) - Number(a.active));
      return { status: 200, body: practitionerListSchema.parse({ practitioners: sorted }) };
    }
    if (path === '/practitioners' && method === 'POST') return create(body);
    const match = /^\/practitioners\/([0-9a-f-]+)$/.exec(path);
    if (match?.[1] && method === 'PUT') return update(match[1], body);
    return null;
  }

  return { answer, practitioners, state };
}
