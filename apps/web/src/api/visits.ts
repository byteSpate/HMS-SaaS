// Visit endpoints (T-VIS-01; UC-VIS-01). The answer is checked against the shared contract. A
// check-in carries an Idempotency-Key made once per dialog, so a retry after a timeout returns
// the same visit instead of a second one (R1, SP-08).
import { visitCheckInSchema, type CheckInRequest } from '@hms/contracts';
import { apiRequest } from './client';

export const visitsApi = {
  checkIn: (body: CheckInRequest, key: string) =>
    apiRequest('/visits/check-in', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': key },
      parse: (data) => visitCheckInSchema.parse(data),
    }),
};
