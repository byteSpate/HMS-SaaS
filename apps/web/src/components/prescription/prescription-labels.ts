// Catalog keys for the prescription screens (T-CLI-03), as literals so the unused-key check can
// see them.
import type { Fulfilment } from '@hms/contracts';

export const FULFILMENT_LABEL = {
  HOSPITAL_PHARMACY: 'prescription.fulfilmentHospital',
  EXTERNAL: 'prescription.fulfilmentExternal',
} as const satisfies Record<Fulfilment, string>;
