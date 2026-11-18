// In-memory stand-in for the prescription endpoints (T-CLI-03), answering with payloads that
// satisfy the shared contracts. Lines are kept with the medicine and labels from the catalogue
// mock, like the real API; versions and the version check follow the real rules (SP-03). The real
// behaviour (no stock or charge, catalogue checks, audit) is covered by
// apps/api/src/prescriptions.api.spec.ts.
import {
  amendPrescriptionRequestSchema,
  prescriptionSchema,
  prescriptionVersionRequestSchema,
  printPrescriptionRequestSchema,
  savePrescriptionDraftRequestSchema,
  type MedicineRecord,
  type Prescription,
  type PrescriptionContent,
  type PrescriptionLineInput,
  type PrescribingTermRecord,
} from '@hms/contracts';

export interface PrescriptionAnswer {
  status: number;
  body?: unknown;
}

const problem = (status: number, code: string) => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code },
});

const SIGNED_AT = '2026-11-18T05:00:00.000Z';

export function createPrescriptionStore(
  medicines: readonly MedicineRecord[],
  terms: readonly PrescribingTermRecord[],
) {
  const prescriptions = new Map<string, Prescription>();

  const of = (consultationId: string): Prescription =>
    prescriptions.get(consultationId) ?? {
      consultationId,
      status: 'NONE',
      draft: null,
      draftSavedAt: null,
      amendReason: null,
      versions: [],
      version: 0,
    };

  function store(
    from: Prescription,
    next: Omit<Prescription, 'version' | 'consultationId'>,
  ): PrescriptionAnswer {
    const saved = prescriptionSchema.parse({
      ...next,
      consultationId: from.consultationId,
      version: from.version + 1,
    });
    prescriptions.set(from.consultationId, saved);
    return { status: 200, body: saved };
  }

  const termOf = (termId: string | null) => {
    const term = terms.find((row) => row.termId === termId);
    return term ? { termId: term.termId, labelBn: term.labelBn, labelEn: term.labelEn } : null;
  };

  function keep(inputs: readonly PrescriptionLineInput[]): PrescriptionContent | null {
    const lines = [];
    for (const input of inputs) {
      const medicine = medicines.find((row) => row.medicineId === input.medicineId && row.active);
      if (!medicine) return null;
      lines.push({
        ...input,
        medicine: {
          medicineId: medicine.medicineId,
          brandName: medicine.brandName,
          genericName: medicine.genericName,
          strength: medicine.strength,
          form: medicine.form,
          nameBn: medicine.nameBn,
        },
        route: termOf(input.routeTermId),
        frequency: termOf(input.frequencyTermId),
        duration: termOf(input.durationTermId),
      });
    }
    return { lines };
  }

  function saveDraft(prescription: Prescription, body: unknown): PrescriptionAnswer {
    const request = savePrescriptionDraftRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (request.data.expectedVersion !== prescription.version) return problem(409, 'STALE_RECORD');
    if (prescription.status === 'SIGNED') return problem(409, 'INVALID_TRANSITION');
    const draft = keep(request.data.lines);
    if (!draft) return problem(422, 'VALIDATION_FAILED');
    return store(prescription, {
      ...prescription,
      status: 'DRAFT',
      draft,
      draftSavedAt: SIGNED_AT,
    });
  }

  function sign(prescription: Prescription): PrescriptionAnswer {
    if (!prescription.draft || prescription.draft.lines.length === 0) {
      return problem(422, 'VALIDATION_FAILED');
    }
    const version = {
      versionNo: (prescription.versions[0]?.versionNo ?? 0) + 1,
      content: prescription.draft,
      signedAt: SIGNED_AT,
      signedBy: 'Karim Uddin',
      amendReason: prescription.amendReason,
    };
    return store(prescription, {
      status: 'SIGNED',
      draft: null,
      draftSavedAt: null,
      amendReason: null,
      versions: [version, ...prescription.versions],
    });
  }

  function amend(prescription: Prescription, body: unknown): PrescriptionAnswer {
    const request = amendPrescriptionRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (request.data.expectedVersion !== prescription.version) return problem(409, 'STALE_RECORD');
    const latest = prescription.versions[0];
    if (prescription.status !== 'SIGNED' || !latest) return problem(409, 'INVALID_TRANSITION');
    return store(prescription, {
      ...prescription,
      status: 'DRAFT',
      draft: latest.content,
      draftSavedAt: SIGNED_AT,
      amendReason: request.data.reason,
    });
  }

  function discard(prescription: Prescription): PrescriptionAnswer {
    if (!prescription.draft) return problem(409, 'INVALID_TRANSITION');
    const signedBefore = prescription.versions.length > 0;
    return store(prescription, {
      ...prescription,
      status: signedBefore ? 'SIGNED' : 'NONE',
      draft: null,
      draftSavedAt: null,
      amendReason: null,
    });
  }

  function print(prescription: Prescription, body: unknown): PrescriptionAnswer {
    if (!printPrescriptionRequestSchema.safeParse(body).success) {
      return problem(422, 'VALIDATION_FAILED');
    }
    const latest = prescription.versions[0];
    if (!latest) return problem(409, 'INVALID_TRANSITION');
    return {
      status: 201,
      body: { versionNo: latest.versionNo, html: '<!doctype html><title>Rx</title><p>Rx</p>' },
    };
  }

  function command(prescription: Prescription, action: string, body: unknown) {
    if (action === 'draft') return saveDraft(prescription, body);
    if (action === 'amend') return amend(prescription, body);
    if (action === 'prints') return print(prescription, body);
    const request = prescriptionVersionRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (request.data.expectedVersion !== prescription.version) return problem(409, 'STALE_RECORD');
    return action === 'sign' ? sign(prescription) : discard(prescription);
  }

  function answer(method: string, path: string, body: unknown): PrescriptionAnswer | null {
    const match =
      /^\/consultations\/([^/]+)\/prescription(?:\/(draft|sign|amend|discard|prints))?$/.exec(path);
    const consultationId = match?.[1];
    if (!consultationId) return null;
    const action = match[2];
    if (action) return command(of(consultationId), action, body);
    return method === 'GET' ? { status: 200, body: of(consultationId) } : null;
  }

  return { answer, prescriptions };
}
