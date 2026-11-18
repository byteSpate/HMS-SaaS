// Catalog keys for the prescribing term kinds (T-CLI-03), as literals so the unused-key check can
// see them. Shared by the administrator's lists and the prescription form.
import type { PrescribingTermKind } from '@hms/contracts';

export const TERM_KIND_KEYS = {
  ROUTE: 'prescribingTerms.kindRoute',
  FREQUENCY: 'prescribingTerms.kindFrequency',
  DURATION: 'prescribingTerms.kindDuration',
} as const satisfies Record<PrescribingTermKind, string>;
