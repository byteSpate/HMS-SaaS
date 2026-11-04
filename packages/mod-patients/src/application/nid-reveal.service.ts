// Show a patient's full NID (T-PAT-03; FR-PAT-007, FR-AUD-003). Lists show the last four digits
// only; the full number needs patient.sensitive.view (checked at the route) and every reveal is an
// audit event, written in the same transaction as the read.
import { Inject, Injectable } from '@nestjs/common';
import type { RevealedNid } from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import { DomainError } from '@hms/domain-kernel';
import { appendAuditEvent, PRISMA } from '@hms/platform';
import { NidVault } from '../infrastructure/nid-vault.js';
import { requestScope } from './context.js';

@Injectable()
export class NidRevealService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(NidVault) private readonly vault: NidVault,
  ) {}

  reveal(patientId: string): Promise<RevealedNid> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, async (tx) => {
      // RLS hides other hospitals' rows, so a patient elsewhere is NOT_FOUND like a missing one.
      const identifier = await tx.patientIdentifier.findUnique({
        where: {
          tenantId_patientId_kind: { tenantId: scope.tenantId, patientId, kind: 'NID' },
        },
        select: { valueCiphertext: true },
      });
      if (!identifier) throw new DomainError('NOT_FOUND', 'No NID is recorded for this patient');
      const nid = this.vault.open(identifier.valueCiphertext);
      await appendAuditEvent(tx, {
        tenantId: scope.tenantId,
        action: 'patient.nid.revealed',
        outcome: 'SUCCEEDED',
        actorUserId: scope.userId,
        ...(scope.membershipId ? { membershipId: scope.membershipId } : {}),
        targetType: 'patient',
        targetId: patientId,
        correlationId: scope.correlationId,
      });
      return { nid };
    });
  }
}
