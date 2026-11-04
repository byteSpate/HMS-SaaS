// Find a patient at the front desk (T-PAT-02; UC-PAT-01 step 1; FR-PAT-003, FR-PAT-010,
// FR-I18N-003). Read only: a list of banner rows, ranked, at most 20.
import { Inject, Injectable } from '@nestjs/common';
import type { PatientSearchRequest, PatientSearchResponse, PatientSummary } from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import type { Clock } from '@hms/domain-kernel';
import { PRISMA } from '@hms/platform';
import { ageOn } from '../domain/age.js';
import { searchTermOf, type SearchTerm } from '../domain/search-term.js';
import { findPatients, type PatientRow } from '../infrastructure/patient-search.repository.js';
import { hospitalToday, PATIENTS_CLOCK, requestScope } from './context.js';

function summaryOf(row: PatientRow, today: string): PatientSummary {
  const age = ageOn(row, today);
  return {
    patientId: row.id,
    mrn: row.mrn,
    identityStatus: row.identityStatus as PatientSummary['identityStatus'],
    nameBn: row.nameBn,
    nameEn: row.nameEn,
    sex: row.sex as PatientSummary['sex'],
    ageYears: age?.years ?? null,
    ageEstimated: age?.estimated ?? false,
    phone: row.phoneNormalized,
  };
}

function matchedBy(term: SearchTerm): PatientSearchResponse['matchedBy'] {
  return term.kind === 'MRN_NUMBER' ? 'MRN' : term.kind;
}

@Injectable()
export class PatientSearchService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PATIENTS_CLOCK) private readonly clock: Clock,
  ) {}

  async search(request: PatientSearchRequest): Promise<PatientSearchResponse> {
    const scope = requestScope();
    const term = searchTermOf(request.term);
    const rows = await withTenant(this.prisma, scope, (tx) =>
      findPatients(tx, scope.tenantId, term),
    );
    const today = hospitalToday(this.clock);
    return { matchedBy: matchedBy(term), patients: rows.map((row) => summaryOf(row, today)) };
  }
}
