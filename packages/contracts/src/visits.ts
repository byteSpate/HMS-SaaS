// Visit contracts (T-VIS-01; UC-VIS-01; FR-VIS-002, FR-VIS-004, FR-VIS-005, FR-SCH-004,
// FR-BIL-010; C-007, C-008, C-035). Check-in of a booked appointment creates the visit, gives the
// serial number in the doctor's queue and issues the doctor-fee invoice. When the doctor has no
// fee configured the visit still exists and the answer says so (UC-VIS-01 A1).
import { z } from 'zod';
import { invoiceSummarySchema } from './invoices.js';
import { practitionerChoiceSchema } from './schedule-sessions.js';

/** UC-VIS-01: the appointment with the version the screen showed (SP-03). */
export const checkInRequestSchema = z.strictObject({
  appointmentId: z.uuid(),
  expectedVersion: z.number().int().min(1),
});
export type CheckInRequest = z.infer<typeof checkInRequestSchema>;

export const doctorFeeOutcomeSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ISSUED'),
    /** C-041: a return within the doctor's follow-up window is charged the follow-up fee. */
    followUp: z.boolean(),
    invoice: invoiceSummarySchema,
  }),
  z.strictObject({ status: z.literal('POLICY_NOT_CONFIGURED') }),
]);
export type DoctorFeeOutcome = z.infer<typeof doctorFeeOutcomeSchema>;

export const visitCheckInSchema = z.strictObject({
  visitId: z.uuid(),
  appointmentId: z.uuid(),
  patientId: z.uuid(),
  kind: z.literal('OPD_CONSULTATION'),
  status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']),
  practitioner: practitionerChoiceSchema,
  /** C-035: the serial number in the doctor's queue for the session, in check-in order. */
  queueNumber: z.number().int(),
  arrivedAt: z.iso.datetime(),
  doctorFee: doctorFeeOutcomeSchema,
});
export type VisitCheckIn = z.infer<typeof visitCheckInSchema>;
