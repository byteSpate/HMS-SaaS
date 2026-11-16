// Doctor worklist endpoints (T-CLI-01; FR-CLI-002; UC-CLI-01 step 1; ADR-015). The worklist is
// polled with the last ETag, so an unchanged list costs a 304 and no render. Starting a
// consultation carries an Idempotency-Key made once per patient row (SP-08) and the visit's
// version (SP-03). Every answer is checked against the shared contract.
import {
  consultationSchema,
  doctorWorklistSchema,
  type DoctorWorklist,
  type StartConsultationRequest,
} from '@hms/contracts';
import { apiConditionalGet, apiRequest } from './client';

export const WORKLIST_QUERY_KEY = ['worklist'] as const;
export const consultationQueryKey = (consultationId: string) =>
  ['consultations', consultationId] as const;

/** What the worklist query keeps: the list, its tag, and when the API last confirmed it. */
export interface PolledWorklist {
  worklist: DoctorWorklist;
  etag: string | null;
  checkedAt: Date;
}

export const worklistApi = {
  /** A poll: unchanged keeps the list shown, with a new check time (ADR-015). */
  today: async (previous: PolledWorklist | undefined): Promise<PolledWorklist> => {
    const answer = await apiConditionalGet(
      '/worklist',
      (data) => doctorWorklistSchema.parse(data),
      previous?.etag ?? null,
    );
    const checkedAt = new Date();
    if (answer.unchanged) {
      // A 304 is only sent for the tag of a list this screen holds.
      if (!previous) throw new Error('304 without a previous worklist');
      return { ...previous, checkedAt };
    }
    return { worklist: answer.data, etag: answer.etag, checkedAt };
  },
  start: (visitId: string, body: StartConsultationRequest, key: string) =>
    apiRequest(`/visits/${visitId}/consultation/start`, {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': key },
      parse: (data) => consultationSchema.parse(data),
    }),
  consultation: (consultationId: string) =>
    apiRequest(`/consultations/${consultationId}`, {
      parse: (data) => consultationSchema.parse(data),
    }),
};
