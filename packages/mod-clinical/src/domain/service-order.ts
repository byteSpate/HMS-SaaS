// Service order rules (T-ORD-03; FR-ORD-004, FR-ORD-006 interim; UC-ORD-02; Q-017). Pure. An order
// is cancelled only while it is REQUESTED; after work has started the stages, approvals and
// reversal are Q-017's, so the step is not available. Whether its line is paid is billing's
// check, made in the same transaction.
import type { OrderStatus } from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';

export function assertCancellable(
  order: { status: OrderStatus; version: number },
  expectedVersion: number,
): void {
  if (order.version !== expectedVersion) {
    throw new DomainError('STALE_RECORD', 'The order changed elsewhere; reload it', {
      currentVersion: order.version,
    });
  }
  if (order.status === 'CANCELLED') {
    throw new DomainError('INVALID_TRANSITION', 'The order is already cancelled');
  }
  if (order.status !== 'REQUESTED') {
    throw new DomainError(
      'FEATURE_NOT_AVAILABLE',
      'Cancelling after work has started is not configured; see a supervisor',
    );
  }
}
