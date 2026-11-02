// Effective-dated hospital settings (T-PLT-05; FR-CFG-002, FR-SAA-005; P-004). Only settings with a
// confirmed meaning have a schema here: numbering (C-033) and security values (C-032). A feature
// adds its own when it needs one, and an unknown key is refused.
import { z } from 'zod';

export const policyBodySchemas = {
  /** CP-09: the prefix of {PREFIX}-{seq:6}. Other document formats are open (Q-034). */
  numbering: z.strictObject({ mrnPrefix: z.string().regex(/^[A-Z0-9]{2,8}$/) }),
  /** CP-12: session and lockout values per hospital. */
  security: z.strictObject({
    idleMinutes: z.number().int().positive(),
    absoluteHours: z.number().int().positive(),
    lockoutAttempts: z.number().int().positive(),
    lockoutMinutes: z.number().int().positive(),
  }),
} as const;

export type PolicyKey = keyof typeof policyBodySchemas;
export type PolicyBody<K extends PolicyKey> = z.infer<(typeof policyBodySchemas)[K]>;

export function isPolicyKey(key: string): key is PolicyKey {
  return Object.hasOwn(policyBodySchemas, key);
}

export const publishPolicyRequestSchema = z.object({
  body: z.record(z.string(), z.unknown()),
  /** Omit to apply at once. A past time is refused: history never changes. */
  effectiveFrom: z.iso.datetime({ offset: true }).optional(),
  reason: z.string().trim().min(3).max(500),
});
export type PublishPolicyRequest = z.infer<typeof publishPolicyRequestSchema>;

export const previewPolicyRequestSchema = z.object({ body: z.record(z.string(), z.unknown()) });
export type PreviewPolicyRequest = z.infer<typeof previewPolicyRequestSchema>;

export const policyVersionSchema = z.object({
  id: z.uuid(),
  policyKey: z.string(),
  versionNo: z.number().int().positive(),
  effectiveFrom: z.iso.datetime(),
  body: z.record(z.string(), z.unknown()),
  publishedBy: z.uuid().nullable(),
  publishedAt: z.iso.datetime(),
});
export type PolicyVersionRow = z.infer<typeof policyVersionSchema>;

export const policyVersionListSchema = z.array(policyVersionSchema);

export const policyPreviewSchema = z.object({
  changes: z.array(z.object({ path: z.string(), from: z.unknown(), to: z.unknown() })),
});
export type PolicyPreview = z.infer<typeof policyPreviewSchema>;
