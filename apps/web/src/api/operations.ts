// The outcome of a command by its Idempotency-Key (T-PLT-01, T-BIL-05; SP-08; FR-BIL-036). Asked
// after a timeout, when the answer was lost: NOT_FOUND means nothing took effect, so the command
// may be sent again with the same key.
import { operationOutcomeSchema } from '@hms/contracts';
import { apiRequest } from './client';

export const operationsApi = {
  outcome: (key: string) =>
    apiRequest(`/operations/${key}`, { parse: (data) => operationOutcomeSchema.parse(data) }),
};
