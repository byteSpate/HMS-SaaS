// The success body of every JSON API response (T-PLT-08; D section 8.2; ADR-005). Errors are not
// wrapped: they stay RFC 9457 problem details, which also carry correlationId.
import { z, type ZodType } from 'zod';

export const responseMetaSchema = z.object({
  correlationId: z.string(),
  /** Only on keyset lists; null on the last page. */
  nextCursor: z.string().nullable().optional(),
});
export type ResponseMeta = z.infer<typeof responseMetaSchema>;

export function successEnvelopeSchema<T extends ZodType>(data: T) {
  return z.object({ data, meta: responseMetaSchema });
}

/** For a client that checks the data separately with its own schema. */
export const anySuccessEnvelopeSchema = successEnvelopeSchema(z.unknown());
