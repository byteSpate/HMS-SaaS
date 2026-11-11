// Appointment contracts (T-SCH-02; FR-SCH-001..005; UC-SCH-01/02; C-035; AT-SCH-002..006). A booking
// holds one place in a published session. Rescheduling books the new session and marks the old
// appointment RESCHEDULED, linked to the new one; cancelling keeps the record with its reason. A
// booking is not attendance: no visit or invoice exists until check-in (FR-SCH-001).
import { z } from 'zod';
import { practitionerChoiceSchema } from './schedule-sessions.js';

export const APPOINTMENT_STATUSES = [
  'BOOKED',
  'CHECKED_IN',
  'RESCHEDULED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

const expectedVersion = z.number().int().min(1);

export const bookAppointmentRequestSchema = z.strictObject({
  patientId: z.uuid(),
  sessionId: z.uuid(),
});
export type BookAppointmentRequest = z.infer<typeof bookAppointmentRequestSchema>;

/** UC-SCH-02: the new session, with the version of the appointment the screen showed (SP-03). */
export const rescheduleAppointmentRequestSchema = z.strictObject({
  sessionId: z.uuid(),
  expectedVersion,
});
export type RescheduleAppointmentRequest = z.infer<typeof rescheduleAppointmentRequestSchema>;

/** FR-SCH-002: a cancellation keeps the record with its reason and who cancelled it. */
export const cancelAppointmentRequestSchema = z.strictObject({
  reason: z.string().trim().min(3).max(500),
  expectedVersion,
});
export type CancelAppointmentRequest = z.infer<typeof cancelAppointmentRequestSchema>;

/** FR-SCH-005: after the session has ended. */
export const markNoShowRequestSchema = z.strictObject({ expectedVersion });
export type MarkNoShowRequest = z.infer<typeof markNoShowRequestSchema>;

/** A session's list (reception) or a patient's list (the patient record): exactly one of them. */
export const appointmentListQuerySchema = z
  .strictObject({ sessionId: z.uuid().optional(), patientId: z.uuid().optional() })
  .superRefine((query, context) => {
    if ((query.sessionId === undefined) === (query.patientId === undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['sessionId'],
        message: 'Give either sessionId or patientId',
      });
    }
  });
export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;

export const appointmentPatientSchema = z.strictObject({
  patientId: z.uuid(),
  mrn: z.string(),
  nameBn: z.string().nullable(),
  nameEn: z.string().nullable(),
});

export const appointmentSessionSchema = z.strictObject({
  sessionId: z.uuid(),
  practitioner: practitionerChoiceSchema,
  sessionDate: z.iso.date(),
  /** HH:mm on the hospital clock. */
  startTime: z.string(),
  endTime: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

export const appointmentSchema = z.strictObject({
  appointmentId: z.uuid(),
  patient: appointmentPatientSchema,
  session: appointmentSessionSchema,
  status: appointmentStatusSchema,
  /** The appointment this one replaced (UC-SCH-02). */
  rescheduledFromId: z.uuid().nullable(),
  cancelReason: z.string().nullable(),
  bookedAt: z.iso.datetime(),
  version: z.number().int(),
});
export type Appointment = z.infer<typeof appointmentSchema>;

export const appointmentListSchema = z.strictObject({
  appointments: z.array(appointmentSchema),
});
export type AppointmentList = z.infer<typeof appointmentListSchema>;
