// In-memory stand-in for the patient registry endpoints (T-PAT-01..04), answering with payloads that
// satisfy the shared contracts. Used by the front desk browser tests; the real behaviour, including
// matching, sealing and history, is covered by apps/api/src/patients.api.spec.ts. Names synthetic.
import {
  duplicateCandidatesResponseSchema,
  patientDetailSchema,
  patientSearchResponseSchema,
  patientVersionSchema,
  registeredPatientSchema,
  revealedNidSchema,
  type PatientDetail,
} from '@hms/contracts';

const ID = (n: number): string => `0199e0b0-0000-7000-8000-${String(n).padStart(12, '0')}`;

export interface PatientAnswer {
  status: number;
  body?: unknown;
}

interface StoredPatient extends PatientDetail {
  nid: string | null;
}

const problem = (status: number, code: string, extra: object = {}): PatientAnswer => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code, ...extra },
});

const digits = (value: string) => value.replace(/\D/g, '').replace(/^880/, '0');

export function createPatientStore() {
  let next = 2;
  const patients: StoredPatient[] = [
    {
      patientId: ID(1),
      mrn: 'MRN-000001',
      identityStatus: 'CONFIRMED',
      nameBn: null,
      nameEn: 'Karim Ahmed',
      sex: 'MALE',
      ageYears: 36,
      ageEstimated: false,
      phone: '01700000001',
      nidLast4: '7890',
      birthDate: '1990-05-14',
      birthDatePrecision: 'EXACT',
      reportedAgeYears: null,
      reportedAgeOn: null,
      addressText: null,
      version: 1,
      nid: '1234567890',
    },
  ];
  /** Set by a test to act as another user who saved first (SP-03). */
  const state = { changedElsewhere: false };

  // The schema drops keys it does not know, so the full NID never leaves the mock unasked.
  const summary = (patient: StoredPatient) => patientDetailSchema.parse(patient);

  function search(term: string): PatientAnswer {
    const number = digits(term);
    const matches = (patient: StoredPatient) =>
      number.length > 0
        ? patient.phone === number || patient.nid === number || patient.mrn.endsWith(number)
        : `${patient.nameEn ?? ''} ${patient.nameBn ?? ''}`
            .toLowerCase()
            .includes(term.toLowerCase());
    const found = patients.filter(matches);
    let matchedBy: 'PHONE' | 'NID' | 'MRN' | 'NAME' = 'NAME';
    if (number.length === 11) matchedBy = 'PHONE';
    else if (number.length === 10) matchedBy = 'NID';
    else if (number.length > 0) matchedBy = 'MRN';
    return {
      status: 200,
      body: patientSearchResponseSchema.parse({ matchedBy, patients: found.map(summary) }),
    };
  }

  function candidatesFor(body: { nameEn?: string; phone?: string | null }) {
    return patients
      .filter(
        (patient) =>
          (body.phone && patient.phone === digits(body.phone)) ||
          (body.nameEn &&
            patient.nameEn?.split(' ')[0]?.toLowerCase() ===
              body.nameEn.split(' ')[0]?.toLowerCase()),
      )
      .map((patient) => ({
        patientId: patient.patientId,
        mrn: patient.mrn,
        nameBn: patient.nameBn,
        nameEn: patient.nameEn,
        sex: patient.sex,
        birthYear: 1990,
        birthDatePrecision: patient.birthDatePrecision,
        phoneLast4: patient.phone?.slice(-4) ?? null,
        reasons: [
          body.phone && patient.phone === digits(body.phone) ? 'SAME_PHONE' : 'SIMILAR_NAME',
        ],
      }));
  }

  function register(body: {
    nameEn?: string;
    nameBn?: string;
    sex: PatientDetail['sex'];
    phone: string | null;
    confirmNewDespiteCandidates: boolean;
    shownCandidateIds: string[];
  }): PatientAnswer {
    const candidateIds = candidatesFor(body).map((candidate) => candidate.patientId);
    const reviewed = candidateIds.every((id) => body.shownCandidateIds.includes(id));
    if (candidateIds.length > 0 && !(body.confirmNewDespiteCandidates && reviewed)) {
      return problem(422, 'VALIDATION_FAILED', {
        reason: 'DUPLICATE_CANDIDATES_PRESENT',
        candidateIds,
      });
    }
    const patient: StoredPatient = {
      ...patients[0]!,
      patientId: ID(next),
      mrn: `MRN-${String(next).padStart(6, '0')}`,
      nameEn: body.nameEn ?? null,
      nameBn: body.nameBn ?? null,
      sex: body.sex,
      phone: body.phone ? digits(body.phone) : null,
      nidLast4: null,
      nid: null,
      version: 1,
    };
    next += 1;
    patients.push(patient);
    return {
      status: 201,
      body: registeredPatientSchema.parse({
        patientId: patient.patientId,
        mrn: patient.mrn,
        version: 1,
      }),
    };
  }

  function correct(
    patient: StoredPatient,
    body: { expectedVersion: number; changes: Partial<PatientDetail> },
  ): PatientAnswer {
    if (state.changedElsewhere) patient.version += 1;
    state.changedElsewhere = false;
    if (body.expectedVersion !== patient.version) {
      return problem(409, 'STALE_RECORD', { currentVersion: patient.version });
    }
    Object.assign(patient, body.changes);
    patient.version += 1;
    return {
      status: 200,
      body: patientVersionSchema.parse({
        patientId: patient.patientId,
        mrn: patient.mrn,
        version: patient.version,
      }),
    };
  }

  /** Null when the path is not a patient endpoint this mock knows. */
  function answer(method: string, path: string, body: never): PatientAnswer | null {
    if (path === '/patients/search' && method === 'POST') {
      return search((body as { term: string }).term);
    }
    if (path === '/patients/duplicate-candidates' && method === 'POST') {
      return {
        status: 200,
        body: duplicateCandidatesResponseSchema.parse({ candidates: candidatesFor(body) }),
      };
    }
    if (path === '/patients' && method === 'POST') return register(body);
    const match = /^\/patients\/([^/]+)(\/identity|\/nid\/reveal)?$/.exec(path);
    const patient = patients.find((item) => item.patientId === match?.[1]);
    if (!match) return null;
    if (!patient) return problem(404, 'NOT_FOUND');
    if (!match[2] && method === 'GET') return { status: 200, body: summary(patient) };
    if (match[2] === '/identity' && method === 'POST') return correct(patient, body);
    if (match[2] === '/nid/reveal' && method === 'POST') {
      return { status: 200, body: revealedNidSchema.parse({ nid: patient.nid }) };
    }
    return null;
  }

  return { answer, patients, state };
}
