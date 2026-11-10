// Schedule session contracts (T-SCH-01; FR-SCH-002; C-035; AT-SCH-001). A session is one sitting
// of a practitioner on one hospital date, entered on the hospital clock, with a fixed capacity and
// no overbooking (C-035). It is created as DRAFT and published; only a published session takes
// bookings (T-SCH-02).
import { z } from 'zod';
import { departmentChoiceSchema } from './departments.js';

const isoDate = z.iso.date();
/** HH:mm, 24-hour clock. */
const wallClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm, 24-hour clock');

export const SCHEDULE_SESSION_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const;
export const scheduleSessionStatusSchema = z.enum(SCHEDULE_SESSION_STATUSES);
export type ScheduleSessionStatus = z.infer<typeof scheduleSessionStatusSchema>;

/** The largest capacity one sitting may have; a larger number is taken as a typing mistake. */
export const MAX_SESSION_CAPACITY = 500;

export const createScheduleSessionRequestSchema = z.strictObject({
  practitionerId: z.uuid(),
  sessionDate: isoDate,
  startTime: wallClockTime,
  endTime: wallClockTime,
  /** C-035: the number of patients the session takes; never exceeded. */
  capacity: z.number().int().min(1).max(MAX_SESSION_CAPACITY),
});
export type CreateScheduleSessionRequest = z.infer<typeof createScheduleSessionRequestSchema>;

/** Publish or cancel: the version the screen showed (SP-03). */
export const changeScheduleSessionRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
});
export type ChangeScheduleSessionRequest = z.infer<typeof changeScheduleSessionRequestSchema>;

/** At most 62 days per list, about two months of a reception calendar. */
export const MAX_SESSION_LIST_DAYS = 62;

const DAY_MS = 86_400_000;

/** `from` to `to`, both included, at most MAX_SESSION_LIST_DAYS days. */
export const scheduleSessionListQuerySchema = z
  .strictObject({
    from: isoDate,
    to: isoDate,
    practitionerId: z.uuid().optional(),
  })
  .superRefine((query, context) => {
    const days = (Date.parse(query.to) - Date.parse(query.from)) / DAY_MS + 1;
    if (days < 1) {
      context.addIssue({ code: 'custom', path: ['to'], message: 'End on or after the start' });
    } else if (days > MAX_SESSION_LIST_DAYS) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: `Choose at most ${MAX_SESSION_LIST_DAYS} days`,
      });
    }
  });
export type ScheduleSessionListQuery = z.infer<typeof scheduleSessionListQuerySchema>;

/** A practitioner as the session form's picker and the session list show them. */
export const practitionerChoiceSchema = z.strictObject({
  practitionerId: z.uuid(),
  nameBn: z.string().nullable(),
  nameEn: z.string().nullable(),
  specialty: z.string().nullable(),
  department: departmentChoiceSchema.nullable(),
});
export type PractitionerChoice = z.infer<typeof practitionerChoiceSchema>;

export const practitionerChoiceListSchema = z.strictObject({
  practitioners: z.array(practitionerChoiceSchema),
});
export type PractitionerChoiceList = z.infer<typeof practitionerChoiceListSchema>;

export const scheduleSessionSchema = z.strictObject({
  sessionId: z.uuid(),
  practitioner: practitionerChoiceSchema,
  sessionDate: isoDate,
  /** HH:mm on the hospital clock. */
  startTime: wallClockTime,
  endTime: wallClockTime,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  capacity: z.number().int(),
  bookedCount: z.number().int(),
  status: scheduleSessionStatusSchema,
  version: z.number().int(),
});
export type ScheduleSession = z.infer<typeof scheduleSessionSchema>;

export const scheduleSessionListSchema = z.strictObject({
  sessions: z.array(scheduleSessionSchema),
});
export type ScheduleSessionList = z.infer<typeof scheduleSessionListSchema>;
