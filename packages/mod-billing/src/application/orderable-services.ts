// What other modules may order (T-ORD-01; FR-ORD-001, FR-ORD-003, FR-ORD-007, FR-BIL-007): the
// active services that the price list in force at `at` prices, found by text or by ID. Runs in the
// caller's transaction. Billing stays the only module that reads prices.
import type { OrderableService } from '@hms/contracts';
import type { TenantTx } from '@hms/database';
import { findVersionInForce } from '../infrastructure/price-list.repository.js';
import { findOrderableServices } from '../infrastructure/service-item.repository.js';

export async function orderableServicesInForce(
  tx: TenantTx,
  query: { text?: string; serviceItemId?: string; directOnly: boolean },
  at: Date,
): Promise<OrderableService[]> {
  const version = await findVersionInForce(tx, at);
  if (!version) return [];
  return findOrderableServices(tx, { ...query, versionId: version.id });
}
