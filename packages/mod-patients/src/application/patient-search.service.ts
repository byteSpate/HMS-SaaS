// Find a patient at the front desk (T-PAT-02; UC-PAT-01 step 1; FR-PAT-003, FR-PAT-010,
// FR-I18N-003; T-PAT-03 for NID lookup). Read only: a list of banner rows, ranked, at most 20.
import { Inject, Injectable } from '@nestjs/common';
import type { PatientSearchRequest, PatientSearchResponse } from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import type { Clock } from '@hms/domain-kernel';
import { PRISMA } from '@hms/platform';
import { searchTermOf, type SearchTerm } from '../domain/search-term.js';
import { NidVault } from '../infrastructure/nid-vault.js';
import { findPatients, type PatientQuery } from '../infrastructure/patient-search.repository.js';
import { hospitalToday, PATIENTS_CLOCK, requestScope } from './context.js';
import { summaryOf } from './patient-view.js';

function matchedBy(term: SearchTerm): PatientSearchResponse['matchedBy'] {
  return term.kind === 'MRN_NUMBER' ? 'MRN' : term.kind;
}

@Injectable()
export class PatientSearchService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PATIENTS_CLOCK) private readonly clock: Clock,
    @Inject(NidVault) private readonly vault: NidVault,
  ) {}

  /** An NID is looked up by its keyed hash; the plain number never reaches the query. */
  private queryOf(term: SearchTerm): PatientQuery {
    return term.kind === 'NID' ? { kind: 'NID_HASH', hash: this.vault.lookupHash(term.nid) } : term;
  }

  async search(request: PatientSearchRequest): Promise<PatientSearchResponse> {
    const scope = requestScope();
    const term = searchTermOf(request.term);
    const rows = await withTenant(this.prisma, scope, (tx) =>
      findPatients(tx, scope.tenantId, this.queryOf(term)),
    );
    const today = hospitalToday(this.clock);
    return { matchedBy: matchedBy(term), patients: rows.map((row) => summaryOf(row, today)) };
  }
}
