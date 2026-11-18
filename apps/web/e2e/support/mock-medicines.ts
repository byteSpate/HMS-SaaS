// In-memory stand-in for the medicine catalogue and prescribing list endpoints (T-CLI-03),
// answering with payloads that satisfy the shared contracts. Used by the browser tests; the real
// behaviour (RLS, audit, version checks, the brand-strength-form rule) is covered by
// apps/api/src/medicines.api.spec.ts. Names are synthetic.
import {
  createMedicineRequestSchema,
  createPrescribingTermRequestSchema,
  medicineChoiceListSchema,
  medicineListSchema,
  medicineRecordSchema,
  prescribingTermChoicesSchema,
  prescribingTermListSchema,
  prescribingTermRecordSchema,
  updateMedicineRequestSchema,
  updatePrescribingTermRequestSchema,
  type MedicineRecord,
  type PrescribingTermKind,
  type PrescribingTermRecord,
} from '@hms/contracts';

const ID = (n: number): string => `0199e0b0-0000-7000-8000-${String(n).padStart(12, '0')}`;

export interface CatalogueAnswer {
  status: number;
  body?: unknown;
}

const problem = (status: number, code: string, fields?: { path: string; message: string }[]) => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code, ...(fields ? { fields } : {}) },
});

const identityOf = (row: { brandName: string; strength?: string | null; form: string }) =>
  [row.brandName, row.strength ?? '', row.form].join('|').toLowerCase();

export function createMedicineStore() {
  let next = 720;
  const medicines: MedicineRecord[] = [
    {
      medicineId: ID(701),
      brandName: 'Napa',
      genericName: 'Paracetamol',
      strength: '500 mg',
      form: 'Tablet',
      nameBn: null,
      manufacturer: null,
      active: true,
      version: 1,
    },
    {
      medicineId: ID(702),
      brandName: 'Amoxil',
      genericName: 'Amoxicillin',
      strength: '500 mg',
      form: 'Capsule',
      nameBn: null,
      manufacturer: null,
      active: true,
      version: 1,
    },
  ];
  const terms: PrescribingTermRecord[] = [
    {
      termId: ID(801),
      kind: 'ROUTE',
      labelBn: null,
      labelEn: 'Oral',
      sortOrder: 0,
      active: true,
      version: 1,
    },
    {
      termId: ID(802),
      kind: 'FREQUENCY',
      labelBn: null,
      labelEn: 'Twice daily',
      sortOrder: 2,
      active: true,
      version: 1,
    },
    {
      termId: ID(803),
      kind: 'FREQUENCY',
      labelBn: null,
      labelEn: 'Once daily',
      sortOrder: 1,
      active: true,
      version: 1,
    },
    {
      termId: ID(804),
      kind: 'DURATION',
      labelBn: null,
      labelEn: '7 days',
      sortOrder: 0,
      active: true,
      version: 1,
    },
  ];

  const duplicate = (
    values: { brandName: string; strength?: string | null; form: string },
    exceptId?: string,
  ) =>
    medicines.some((row) => row.medicineId !== exceptId && identityOf(row) === identityOf(values));
  const duplicateAnswer = () =>
    problem(422, 'VALIDATION_FAILED', [{ path: 'brandName', message: 'Already in the catalogue' }]);

  function createMedicine(body: unknown): CatalogueAnswer {
    const request = createMedicineRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (duplicate(request.data)) return duplicateAnswer();
    const created = medicineRecordSchema.parse({
      strength: null,
      nameBn: null,
      manufacturer: null,
      ...request.data,
      medicineId: ID(next++),
      active: true,
      version: 1,
    });
    medicines.push(created);
    return { status: 201, body: created };
  }

  function updateMedicine(medicineId: string, body: unknown): CatalogueAnswer {
    const index = medicines.findIndex((row) => row.medicineId === medicineId);
    const stored = medicines[index];
    if (!stored) return problem(404, 'NOT_FOUND');
    const request = updateMedicineRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const { expectedVersion, ...fields } = request.data;
    if (expectedVersion !== stored.version) return problem(409, 'STALE_RECORD');
    if (duplicate(fields, medicineId)) return duplicateAnswer();
    const updated = medicineRecordSchema.parse({
      strength: null,
      nameBn: null,
      manufacturer: null,
      ...fields,
      medicineId,
      version: stored.version + 1,
    });
    medicines[index] = updated;
    return { status: 200, body: updated };
  }

  function createTerm(body: unknown): CatalogueAnswer {
    const request = createPrescribingTermRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const created = prescribingTermRecordSchema.parse({
      labelBn: null,
      labelEn: null,
      ...request.data,
      termId: ID(next++),
      active: true,
      version: 1,
    });
    terms.push(created);
    return { status: 201, body: created };
  }

  function updateTerm(termId: string, body: unknown): CatalogueAnswer {
    const index = terms.findIndex((row) => row.termId === termId);
    const stored = terms[index];
    if (!stored) return problem(404, 'NOT_FOUND');
    const request = updatePrescribingTermRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const { expectedVersion, ...fields } = request.data;
    if (expectedVersion !== stored.version) return problem(409, 'STALE_RECORD');
    const updated = prescribingTermRecordSchema.parse({
      labelBn: null,
      labelEn: null,
      ...fields,
      termId,
      kind: stored.kind,
      version: stored.version + 1,
    });
    terms[index] = updated;
    return { status: 200, body: updated };
  }

  function choicesOf(kind: PrescribingTermKind) {
    return terms
      .filter((term) => term.kind === kind && term.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ termId, labelBn, labelEn }) => ({ termId, labelBn, labelEn }));
  }

  function search(text: string): CatalogueAnswer {
    const needle = text.toLowerCase();
    const found = medicines
      .filter(
        (row) =>
          row.active &&
          (row.brandName.toLowerCase().includes(needle) ||
            row.genericName.toLowerCase().includes(needle)),
      )
      .map(({ medicineId, brandName, genericName, strength, form, nameBn }) => ({
        medicineId,
        brandName,
        genericName,
        strength,
        form,
        nameBn,
      }));
    return { status: 200, body: medicineChoiceListSchema.parse({ medicines: found }) };
  }

  function answerMedicines(method: string, path: string, body: unknown): CatalogueAnswer | null {
    if (path === '/admin/medicines' && method === 'GET') {
      const sorted = [...medicines].sort((a, b) => Number(b.active) - Number(a.active));
      return { status: 200, body: medicineListSchema.parse({ medicines: sorted }) };
    }
    if (path === '/admin/medicines' && method === 'POST') return createMedicine(body);
    const medicine = /^\/admin\/medicines\/([0-9a-f-]+)$/.exec(path);
    if (medicine?.[1] && method === 'PUT') return updateMedicine(medicine[1], body);
    return null;
  }

  function answerTerms(method: string, path: string, body: unknown): CatalogueAnswer | null {
    if (path === '/admin/prescribing-terms' && method === 'GET') {
      return { status: 200, body: prescribingTermListSchema.parse({ terms }) };
    }
    if (path === '/admin/prescribing-terms' && method === 'POST') return createTerm(body);
    const term = /^\/admin\/prescribing-terms\/([0-9a-f-]+)$/.exec(path);
    if (term?.[1] && method === 'PUT') return updateTerm(term[1], body);
    return null;
  }

  function answerPicker(method: string, path: string, params: URLSearchParams) {
    if (method !== 'GET') return null;
    if (path === '/prescribing/medicines') return search(params.get('q') ?? '');
    if (path !== '/prescribing/terms') return null;
    return {
      status: 200,
      body: prescribingTermChoicesSchema.parse({
        routes: choicesOf('ROUTE'),
        frequencies: choicesOf('FREQUENCY'),
        durations: choicesOf('DURATION'),
      }),
    };
  }

  function answer(
    method: string,
    path: string,
    body: unknown,
    params: URLSearchParams,
  ): CatalogueAnswer | null {
    return (
      answerMedicines(method, path, body) ??
      answerTerms(method, path, body) ??
      answerPicker(method, path, params)
    );
  }

  return { answer, medicines, terms };
}
