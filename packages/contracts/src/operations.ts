// The outcome of a command looked up by its idempotency key (T-PLT-01; SP-08; D section 8.2).
import { z } from 'zod';

export const operationOutcomeSchema = z.object({
  idempotencyKey: z.uuid(),
  operation: z.string(),
  status: z.literal('COMPLETED'),
  /** The command's original data; its own contract was checked when it first ran. */
  result: z.unknown(),
});
export type OperationOutcome = z.infer<typeof operationOutcomeSchema>;
