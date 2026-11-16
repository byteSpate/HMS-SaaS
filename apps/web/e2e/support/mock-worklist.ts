// In-memory stand-in for the doctor worklist and consultation note endpoints (T-CLI-01, T-CLI-02),
// answering with payloads that satisfy the shared contracts. The list carries an ETag and answers
// 304 to a matching If-None-Match, like the real API (ADR-015); the note keeps its draft, signed
// versions and version number. Tests change the list with pay() and unlink(). The real rules
// (eligibility, version checks, RLS) are covered by apps/api/src/worklist.api.spec.ts.
// Names are synthetic.
import {
  amendNoteRequestSchema,
  consultationNoteSchema,
  consultationSchema,
  doctorWorklistSchema,
  noteVersionRequestSchema,
  saveNoteDraftRequestSchema,
  startConsultationRequestSchema,
  type Consultation,
  type ConsultationNote,
  type WorklistEntry,
} from '@hms/contracts';

const ID = (n: number): string => `0199e0c0-0000-7000-8000-${String(n).padStart(12, '0')}`;

export interface WorklistAnswer {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

const problem = (status: number, code: string): WorklistAnswer => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code },
});

const patient = (n: number, nameEn: string) => ({
  patientId: ID(100 + n),
  mrn: `HMS-2026-00000${n}`,
  nameEn,
  nameBn: null,
});

function checkedIn(n: number, nameEn: string, status: WorklistEntry['status']): WorklistEntry {
  return {
    appointmentId: ID(n),
    patient: patient(n, nameEn),
    status,
    visitId: ID(200 + n),
    visitVersion: 1,
    queueNumber: n,
    arrivedAt: new Date(Date.now() - (20 - n) * 60_000).toISOString(),
    consultationId: null,
  };
}

export function createWorklistStore() {
  const entries: WorklistEntry[] = [
    checkedIn(1, 'Salma Begum', 'WAITING'),
    checkedIn(2, 'Rahim Uddin', 'WAITING_PAYMENT'),
    {
      appointmentId: ID(3),
      patient: patient(3, 'Karim Ahmed'),
      status: 'EXPECTED',
      visitId: null,
      visitVersion: null,
      queueNumber: null,
      arrivedAt: null,
      consultationId: null,
    },
  ];
  const consultations = new Map<string, Consultation>();
  const notes = new Map<string, ConsultationNote>();
  const state = { linked: true, revision: 1 };

  const worklist = () =>
    doctorWorklistSchema.parse({
      date: new Date().toISOString().slice(0, 10),
      practitioner: state.linked
        ? {
            practitionerId: ID(500),
            nameBn: null,
            nameEn: 'Nasrin Akter',
            specialty: 'Medicine',
            department: null,
          }
        : null,
      sessions: state.linked
        ? [
            {
              sessionId: ID(900),
              startsAt: new Date().toISOString(),
              endsAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
              startTime: '17:00',
              endTime: '21:00',
              entries,
            },
          ]
        : [],
    });

  /** The cashier takes the doctor fee: WAITING_PAYMENT becomes WAITING. */
  function pay(appointmentId: string): void {
    const entry = entries.find((row) => row.appointmentId === appointmentId);
    if (entry?.status === 'WAITING_PAYMENT') {
      entry.status = 'WAITING';
      state.revision += 1;
    }
  }

  function unlink(): void {
    state.linked = false;
    state.revision += 1;
  }

  function start(visitId: string, body: unknown): WorklistAnswer {
    const request = startConsultationRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const entry = entries.find((row) => row.visitId === visitId);
    if (!entry) return problem(404, 'NOT_FOUND');
    if (entry.status === 'WAITING_PAYMENT') return problem(409, 'PAYMENT_NOT_ELIGIBLE');
    if (entry.visitVersion !== request.data.expectedVersion) return problem(409, 'STALE_RECORD');
    if (entry.status !== 'WAITING') return problem(409, 'INVALID_TRANSITION');
    const consultation = consultationSchema.parse({
      consultationId: ID(300 + (entry.queueNumber ?? 0)),
      visitId,
      patient: entry.patient,
      status: 'IN_CONSULTATION',
      startedAt: new Date().toISOString(),
      version: 1,
    });
    consultations.set(consultation.consultationId, consultation);
    entry.status = 'IN_CONSULTATION';
    entry.visitVersion = 2;
    entry.consultationId = consultation.consultationId;
    state.revision += 1;
    return { status: 201, body: consultation };
  }

  function noteOf(consultationId: string): ConsultationNote {
    return (
      notes.get(consultationId) ?? {
        consultationId,
        status: 'NONE',
        draft: null,
        draftSavedAt: null,
        amendReason: null,
        versions: [],
        version: 0,
      }
    );
  }

  /** Stores the next state of a note at the next version, like the real API (SP-03). */
  function saveNote(
    consultationId: string,
    from: ConsultationNote,
    next: Omit<ConsultationNote, 'version' | 'consultationId'>,
  ): WorklistAnswer {
    const saved = consultationNoteSchema.parse({
      ...next,
      consultationId,
      version: from.version + 1,
    });
    notes.set(consultationId, saved);
    return { status: 200, body: saved };
  }

  const now = () => new Date().toISOString();

  function saveDraft(consultationId: string, note: ConsultationNote, body: unknown) {
    const request = saveNoteDraftRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (request.data.expectedVersion !== note.version) return problem(409, 'STALE_RECORD');
    if (note.status === 'SIGNED') return problem(409, 'INVALID_TRANSITION');
    return saveNote(consultationId, note, {
      ...note,
      status: 'DRAFT',
      draft: request.data.content,
      draftSavedAt: now(),
    });
  }

  function amend(consultationId: string, note: ConsultationNote, body: unknown) {
    const request = amendNoteRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (request.data.expectedVersion !== note.version) return problem(409, 'STALE_RECORD');
    const latest = note.versions[0];
    if (note.status !== 'SIGNED' || !latest) return problem(409, 'INVALID_TRANSITION');
    return saveNote(consultationId, note, {
      ...note,
      status: 'DRAFT',
      draft: latest.content,
      draftSavedAt: now(),
      amendReason: request.data.reason,
    });
  }

  function sign(consultationId: string, note: ConsultationNote): WorklistAnswer {
    if (!note.draft) return problem(409, 'INVALID_TRANSITION');
    const consultation = consultations.get(consultationId);
    if (consultation) consultations.set(consultationId, { ...consultation, status: 'CONSULTED' });
    const signed = {
      versionNo: (note.versions[0]?.versionNo ?? 0) + 1,
      content: note.draft,
      signedAt: now(),
      signedBy: 'Nasrin Akter',
      amendReason: note.amendReason,
    };
    return saveNote(consultationId, note, {
      status: 'SIGNED',
      draft: null,
      draftSavedAt: null,
      amendReason: null,
      versions: [signed, ...note.versions],
    });
  }

  function discard(consultationId: string, note: ConsultationNote): WorklistAnswer {
    if (!note.draft) return problem(409, 'INVALID_TRANSITION');
    return saveNote(consultationId, note, {
      ...note,
      status: note.versions.length > 0 ? 'SIGNED' : 'NONE',
      draft: null,
      draftSavedAt: null,
      amendReason: null,
    });
  }

  /** The note's commands, with the version check of the real API (SP-03). */
  function noteCommand(consultationId: string, action: string, body: unknown): WorklistAnswer {
    const note = noteOf(consultationId);
    if (action === 'draft') return saveDraft(consultationId, note, body);
    if (action === 'amend') return amend(consultationId, note, body);
    const request = noteVersionRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (request.data.expectedVersion !== note.version) return problem(409, 'STALE_RECORD');
    return action === 'sign' ? sign(consultationId, note) : discard(consultationId, note);
  }

  function worklistAnswer(ifNoneMatch: string | null): WorklistAnswer {
    const etag = `"worklist-${state.revision}"`;
    if (ifNoneMatch === etag) return { status: 304, headers: { ETag: etag } };
    return { status: 200, body: worklist(), headers: { ETag: etag } };
  }

  /** GET and the commands of /consultations/{id}/note, and GET /consultations/{id}. */
  function consultationAnswer(method: string, path: string, body: unknown): WorklistAnswer | null {
    const notePath = /^\/consultations\/([^/]+)\/note(?:\/(draft|sign|amend|discard))?$/.exec(path);
    const noteId = notePath?.[1];
    if (noteId && consultations.has(noteId)) {
      const action = notePath[2];
      if (action) return noteCommand(noteId, action, body);
      return method === 'GET' ? { status: 200, body: noteOf(noteId) } : null;
    }
    const readPath = /^\/consultations\/([^/]+)$/.exec(path);
    if (!readPath?.[1] || method !== 'GET') return null;
    const found = consultations.get(readPath[1]);
    return found ? { status: 200, body: found } : problem(404, 'NOT_FOUND');
  }

  function answer(
    method: string,
    path: string,
    body: unknown,
    ifNoneMatch: string | null,
  ): WorklistAnswer | null {
    if (path === '/worklist' && method === 'GET') return worklistAnswer(ifNoneMatch);
    const startPath = /^\/visits\/([^/]+)\/consultation\/start$/.exec(path);
    if (startPath?.[1] && method === 'POST') return start(startPath[1], body);
    return consultationAnswer(method, path, body);
  }

  return { entries, answer, pay, unlink };
}
