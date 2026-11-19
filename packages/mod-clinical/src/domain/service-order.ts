// Service order rules (T-ORD-03, T-ORD-02; FR-ORD-004, FR-ORD-006 interim; UC-ORD-02; Q-017). Pure.
// An order is cancelled only while it is REQUESTED; after work has started the stages, approvals
// and reversal are Q-017's, so the step is not available. A department starts only a REQUESTED
// order (REQUESTED -> IN_PROGRESS). Whether its line is paid is billing's check, made in the same
// transaction (FR-BIL-003).
import type { OrderStatus } from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';

type OrderFacts = { status: OrderStatus; version: number };

/** SP-03: the screen acts on the version it showed. */
function assertVersion(order: OrderFacts, expectedVersion: number): void {
  if (order.version !== expectedVersion) {
    throw new DomainError('STALE_RECORD', 'The order changed elsewhere; reload it', {
      currentVersion: order.version,
    });
  }
}

export function assertCancellable(order: OrderFacts, expectedVersion: number): void {
  assertVersion(order, expectedVersion);
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

/** FR-ORD-004: a department starts work only on an order still waiting for it. */
export function assertStartable(order: OrderFacts, expectedVersion: number): void {
  assertVersion(order, expectedVersion);
  if (order.status !== 'REQUESTED') {
    throw new DomainError('INVALID_TRANSITION', 'The order is not waiting to be started', {
      status: order.status,
    });
  }
}
