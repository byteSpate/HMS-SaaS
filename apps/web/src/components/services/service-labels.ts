// Catalog keys for the service categories (T-ORD-01), as literals so the unused-key check can see
// them. Shared by the Services screen, the price list and the order screens.
import type { OrderableCategory } from '@hms/contracts';

export const CATEGORY_KEYS = {
  LAB: 'services.categoryLAB',
  IMAGING: 'services.categoryIMAGING',
  PROCEDURE: 'services.categoryPROCEDURE',
  OTHER: 'services.categoryOTHER',
} as const satisfies Record<OrderableCategory, string>;
