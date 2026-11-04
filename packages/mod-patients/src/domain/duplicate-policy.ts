// Duplicate candidates before registration (T-PAT-01; FR-PAT-001, FR-PAT-011). The signals are a
// matching heuristic, not a clinical rule, so their numbers are tuning values and live here.
import { DUPLICATE_CANDIDATES_PRESENT } from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';

/** pg_trgm similarity from which two names count as similar. */
export const NAME_SIMILARITY_THRESHOLD = 0.4;
/** Birth years (exact or estimated) within this many years count as near. */
export const BIRTH_YEAR_TOLERANCE = 2;
/** UC-PAT-01 shows at most 20 rows. */
export const MAX_CANDIDATES = 20;

export interface ConfirmationInput {
  confirmNewDespiteCandidates: boolean;
  shownCandidateIds: readonly string[];
}

/**
 * FR-PAT-001: a new patient is created only when nobody matches, or when the receptionist confirmed
 * after seeing every current candidate. A candidate that appeared after the screen was drawn has
 * not been reviewed, so the confirmation does not cover it.
 */
export function assertCandidatesConfirmed(
  candidateIds: readonly string[],
  confirmation: ConfirmationInput,
): void {
  if (candidateIds.length === 0) return;
  const shown = new Set(confirmation.shownCandidateIds);
  const reviewed = candidateIds.every((id) => shown.has(id));
  if (confirmation.confirmNewDespiteCandidates && reviewed) return;
  throw new DomainError('VALIDATION_FAILED', 'Possible existing patients must be reviewed first', {
    reason: DUPLICATE_CANDIDATES_PRESENT,
    candidateIds: [...candidateIds],
  });
}
