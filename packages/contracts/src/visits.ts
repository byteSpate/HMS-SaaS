// Visit contracts (T-VIS-01; UC-VIS-01; FR-VIS-002, FR-VIS-004, FR-VIS-005, FR-SCH-004,
// FR-BIL-010; C-007, C-008, C-035). Check-in of a booked appointment creates the visit, gives the
// serial number in the doctor's queue and issues the doctor-fee invoice. When the doctor has no
// fee configured the visit still exists and the answer says so (UC-VIS-01 A1).
import { z } from 'zod';
import { placeOrdersRequestSchema, serviceOrderSchema } from './orders.js';
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

/**
 * UC-VIS-02 diagnostic path (T-VIS-02; FR-VIS-001, FR-ORD-001, FR-BIL-009): reception opens a
 * DIAGNOSTIC visit for the patient with directly orderable services, in one request. No
 * consultation and no doctor fee; the orders go on the visit's service invoice.
 */
export const createDiagnosticVisitRequestSchema = z.strictObject({
  patientId: z.uuid(),
  items: placeOrdersRequestSchema.shape.items,
});
export type CreateDiagnosticVisitRequest = z.infer<typeof createDiagnosticVisitRequestSchema>;

export const diagnosticVisitSchema = z.strictObject({
  visitId: z.uuid(),
  patientId: z.uuid(),
  arrivedAt: z.iso.datetime(),
  orders: z.array(serviceOrderSchema),
});
export type DiagnosticVisit = z.infer<typeof diagnosticVisitSchema>;

/** A patient's orders in their open visits, for reception (T-VIS-02, T-ORD-03). */
export const patientOrdersQuerySchema = z.strictObject({ patientId: z.uuid() });
export type PatientOrdersQuery = z.infer<typeof patientOrdersQuerySchema>;
