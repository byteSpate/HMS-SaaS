// Prescribing lists (T-CLI-03; Q-067 interim: the hospital enters its routes, frequencies and
// durations in Bangla and English; FR-I18N-006; FR-AUD-001; SP-03). The administrator keeps them;
// the doctor picks from the active ones. A prescription line keeps the labels it was written
// with, so editing a term never changes a signed prescription.
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreatePrescribingTermRequest,
  PrescribingTermChoices,
  PrescribingTermList,
  PrescribingTermRecord,
  UpdatePrescribingTermRequest,
} from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import { DomainError, fieldError, type Clock } from '@hms/domain-kernel';
import { PRISMA, recordChange, requestScope } from '@hms/platform';
import { changedFields, termValuesOf } from '../domain/catalogue.js';
import {
  findTerm,
  insertTerm,
  listTermChoices,
  listTerms,
  updateTerm,
} from '../infrastructure/prescribing-term.repository.js';
import { PHARMACY_CLOCK } from './context.js';

const notFound = () => new DomainError('NOT_FOUND', 'Prescribing term not found');
const stale = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'Someone else changed this term; reload it', {
    currentVersion,
  });

@Injectable()
export class PrescribingTermService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PHARMACY_CLOCK) private readonly clock: Clock,
  ) {}

  async list(): Promise<PrescribingTermList> {
    return { terms: await withTenant(this.prisma, requestScope(), listTerms) };
  }

  choices(): Promise<PrescribingTermChoices> {
    return withTenant(this.prisma, requestScope(), listTermChoices);
  }

  create(request: CreatePrescribingTermRequest): Promise<PrescribingTermRecord> {
    const scope = requestScope();
    const values = { ...termValuesOf(request), kind: request.kind };
    return withTenant(this.prisma, scope, async (tx) => {
      const created = await insertTerm(tx, scope, values);
      await recordChange(tx, scope, {
        action: 'pharmacy.prescribing_term.created',
        eventType: 'PrescribingTermChanged',
        targetType: 'prescribing_term',
        targetId: created.termId,
        details: { kind: created.kind, version: created.version },
      });
      return created;
    });
  }

  update(termId: string, request: UpdatePrescribingTermRequest): Promise<PrescribingTermRecord> {
    const scope = requestScope();
    const next = { ...termValuesOf(request), active: request.active };
    return withTenant(this.prisma, scope, async (tx) => {
      const stored = await findTerm(tx, termId);
      if (!stored) throw notFound();
      if (stored.version !== request.expectedVersion) throw stale(stored.version);
      const changed = changedFields(stored, next);
      if (changed.length === 0) {
        throw fieldError('labelEn', 'Nothing differs from the current values');
      }
      const target = {
        termId,
        expectedVersion: request.expectedVersion,
        userId: scope.userId,
        at: this.clock.now(),
      };
      // A concurrent edit may have won since the read; the version check decides.
      if ((await updateTerm(tx, target, next)) === 0) throw stale(request.expectedVersion + 1);
      const version = request.expectedVersion + 1;
      await recordChange(tx, scope, {
        action: 'pharmacy.prescribing_term.changed',
        eventType: 'PrescribingTermChanged',
        targetType: 'prescribing_term',
        targetId: termId,
        details: { changedFields: changed.join(','), fromVersion: version - 1, toVersion: version },
      });
      return { termId, kind: stored.kind, ...next, version };
    });
  }
}
