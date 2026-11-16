// Doctor worklist and consultation start contracts (T-CLI-01; FR-CLI-002; UC-CLI-01 step 1; SCR-08;
// W-03; ADR-015). The worklist is today's sessions of the signed-in doctor (the practitioner linked
// to their account, FR-PRA-003), each with its patients in queue order and a status:
// EXPECTED (booked, not arrived), WAITING_PAYMENT (checked in, doctor fee not paid), WAITING
// (eligible), IN_CONSULTATION and CONSULTED. Starting a consultation needs the doctor fee eligible
// (C-011); the visit's version makes two doctors opening the same patient one success (SP-03).
import { z } from 'zod';
import { patientRefSchema } from './payments.js';
import { practitionerChoiceSchema, wallClockTime } from './schedule-sessions.js';

export const worklistStatusSchema = z.enum([
  'EXPECTED',
  'WAITING_PAYMENT',
  'WAITING',
  'IN_CONSULTATION',
  'CONSULTED',
]);
export type WorklistStatus = z.infer<typeof worklistStatusSchema>;

export const worklistEntrySchema = z.strictObject({
  appointmentId: z.uuid(),
  patient: patientRefSchema,
  status: worklistStatusSchema,
  /** Null while EXPECTED: there is no visit before check-in. */
  visitId: z.uuid().nullable(),
  /** The visit's version, sent back to start the consultation (SP-03). */
  visitVersion: z.number().int().nullable(),
  /** C-035: the serial number in the session's queue, given at check-in. */
  queueNumber: z.number().int().nullable(),
  arrivedAt: z.iso.datetime().nullable(),
  consultationId: z.uuid().nullable(),
});
export type WorklistEntry = z.infer<typeof worklistEntrySchema>;

export const worklistSessionSchema = z.strictObject({
  sessionId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  /** The session's hours on the hospital's clock, as the schedule screens show them. */
  startTime: wallClockTime,
  endTime: wallClockTime,
  /** Checked-in patients by serial number, then the expected ones by booking time. */
  entries: z.array(worklistEntrySchema),
});
export type WorklistSession = z.infer<typeof worklistSessionSchema>;

export const doctorWorklistSchema = z.strictObject({
  /** The hospital's calendar date the worklist is for. */
  date: z.iso.date(),
  /** Null when the signed-in account is not linked to a practitioner; sessions is then empty. */
  practitioner: practitionerChoiceSchema.nullable(),
  sessions: z.array(worklistSessionSchema),
});
export type DoctorWorklist = z.infer<typeof doctorWorklistSchema>;

/** UC-CLI-01 step 1: the visit with the version the worklist showed (SP-03). */
export const startConsultationRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
});
export type StartConsultationRequest = z.infer<typeof startConsultationRequestSchema>;

export const consultationSchema = z.strictObject({
  consultationId: z.uuid(),
  visitId: z.uuid(),
  patient: patientRefSchema,
  status: z.enum(['IN_CONSULTATION', 'CONSULTED']),
  startedAt: z.iso.datetime(),
  version: z.number().int(),
});
export type Consultation = z.infer<typeof consultationSchema>;
