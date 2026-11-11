// Issuing the doctor fee of a consultation visit (T-VIS-01 billing half; FR-BIL-010, FR-VIS-005;
// C-008, C-041; UC-VIS-01). Called by check-in inside its transaction. Billing owns the fee rule:
// the version in force at arrival gives the doctor's fees, and a return within the doctor's
// follow-up window is charged the follow-up fee. No fee configured: nothing is posted and the
// caller is told (A1), so the visit still exists.
import type { DoctorFeeOutcome } from '@hms/contracts';
import type { TenantTx } from '@hms/database';
import { calendarDateIn } from '@hms/domain-kernel';
import type { Scope } from '@hms/platform';
import { DOCTOR_FEE_FOLLOW_UP, DOCTOR_FEE_NEW, isFollowUp } from '../domain/price-list.js';
import { doctorFeesOf, findVersionInForce } from '../infrastructure/price-list.repository.js';
import { invoiceSummaryOf } from './invoice.service.js';
import { postCharge } from './post-charge.js';

// C-024: one facility per hospital for now, and every pilot hospital is in Bangladesh. When a
// hospital can have facilities in other zones, read facility.timezone here instead.
const HOSPITAL_TIME_ZONE = 'Asia/Dhaka';

export interface DoctorFeeRequest {
  visitId: string;
  patientId: string;
  practitionerId: string;
  arrivedAt: Date;
  /** The patient's last consultation with this doctor before this visit, if any. */
  lastConsultationAt: Date | null;
}

export async function issueDoctorFee(
  tx: TenantTx,
  scope: Scope,
  request: DoctorFeeRequest,
  at: Date,
): Promise<DoctorFeeOutcome> {
  const version = await findVersionInForce(tx, request.arrivedAt);
  const fee = version
    ? (await doctorFeesOf(tx, version.id)).get(request.practitionerId)
    : undefined;
  if (!fee) return { status: 'POLICY_NOT_CONFIGURED' };

  const followUp = isFollowUp(
    request.lastConsultationAt
      ? calendarDateIn(request.lastConsultationAt, HOSPITAL_TIME_ZONE)
      : null,
    calendarDateIn(request.arrivedAt, HOSPITAL_TIME_ZONE),
    fee.followUpDays,
  );
  const posted = await postCharge(
    tx,
    scope,
    {
      // FPR-09: one doctor-fee posting per visit's check-in.
      source: { module: 'clinical', type: 'visit', id: request.visitId, event: 'CHECKED_IN' },
      patientId: request.patientId,
      visitId: request.visitId,
      serviceItemCode: followUp ? DOCTOR_FEE_FOLLOW_UP : DOCTOR_FEE_NEW,
      practitionerId: request.practitionerId,
      quantity: 1,
      serviceTime: request.arrivedAt,
    },
    at,
  );
  return { status: 'ISSUED', followUp, invoice: await invoiceSummaryOf(tx, posted.invoiceId) };
}
