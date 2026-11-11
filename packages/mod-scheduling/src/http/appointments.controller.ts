// /api/v1/appointments (T-SCH-02; FR-SCH-001..005; UC-SCH-01/02; AT-SCH-002..006; C-035): staff with
// scheduling.appointment.book list a session's or a patient's appointments, find bookable sessions,
// book, reschedule, cancel and mark no-shows. Booking needs no right to manage schedules.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  appointmentListQuerySchema,
  appointmentListSchema,
  appointmentSchema,
  bookAppointmentRequestSchema,
  cancelAppointmentRequestSchema,
  markNoShowRequestSchema,
  rescheduleAppointmentRequestSchema,
  scheduleSessionListQuerySchema,
  scheduleSessionListSchema,
  type Appointment,
  type AppointmentList,
  type AppointmentListQuery,
  type BookAppointmentRequest,
  type CancelAppointmentRequest,
  type MarkNoShowRequest,
  type RescheduleAppointmentRequest,
  type ScheduleSessionList,
  type ScheduleSessionListQuery,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { AppointmentService } from '../application/appointment.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;
const CHANGE_ERRORS = [
  ...ACCESS_ERRORS,
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'STALE_RECORD',
  'INVALID_TRANSITION',
  'IDEMPOTENCY_KEY_REUSED',
] as const;

/** A malformed ID is NOT_FOUND, like an appointment of another hospital. */
const appointmentIdPipe = () =>
  new ParseUUIDPipe({
    exceptionFactory: () => new DomainError('NOT_FOUND', 'Appointment not found'),
  });

@ApiTags('scheduling')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('appointments')
export class AppointmentsController {
  constructor(@Inject(AppointmentService) private readonly appointments: AppointmentService) {}

  @Get()
  @RequirePermission('scheduling.appointment.book')
  @ApiQuery({ name: 'sessionId', format: 'uuid', required: false })
  @ApiQuery({ name: 'patientId', format: 'uuid', required: false })
  @ApiEndpoint({
    summary: "List a session's or a patient's appointments",
    description:
      'Give exactly one of sessionId (in booking order) or patientId (in session order). Every ' +
      'status is included: booked, checked in, rescheduled, cancelled and no-show.',
    success: { status: 200, description: 'The appointments', schema: appointmentListSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED'],
  })
  list(
    @Query(new ZodBodyPipe(appointmentListQuerySchema)) query: AppointmentListQuery,
  ): Promise<AppointmentList> {
    return this.appointments.list(query);
  }

  // Declared before ':appointmentId' routes, so the path is not read as an ID.
  @Get('bookable-sessions')
  @RequirePermission('scheduling.appointment.book')
  @ApiQuery({ name: 'from', format: 'date' })
  @ApiQuery({ name: 'to', format: 'date' })
  @ApiQuery({ name: 'practitionerId', format: 'uuid', required: false })
  @ApiEndpoint({
    summary: 'List the sessions a booking can go into',
    description:
      'Published sessions in the date range that have not ended, in time order, with their ' +
      'booked count and capacity (UC-SCH-01).',
    success: { status: 200, description: 'The sessions', schema: scheduleSessionListSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED'],
  })
  bookableSessions(
    @Query(new ZodBodyPipe(scheduleSessionListQuerySchema)) query: ScheduleSessionListQuery,
  ): Promise<ScheduleSessionList> {
    return this.appointments.bookableSessions(query);
  }

  @Post()
  @HttpCode(201)
  @Idempotent('scheduling.appointment.book')
  @RequirePermission('scheduling.appointment.book')
  @ApiEndpoint({
    summary: 'Book a patient into a session',
    description:
      'The session must be published and not ended; a full one is CAPACITY_FULL and is never ' +
      'overbooked (C-035). One patient holds one booking per session. No visit or invoice is ' +
      'created (FR-SCH-001). Needs an Idempotency-Key.',
    body: bookAppointmentRequestSchema,
    success: { status: 201, description: 'The booking', schema: appointmentSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED', 'CAPACITY_FULL', 'IDEMPOTENCY_KEY_REUSED'],
    csrf: true,
  })
  book(
    @Body(new ZodBodyPipe(bookAppointmentRequestSchema)) request: BookAppointmentRequest,
  ): Promise<Appointment> {
    return this.appointments.book(request);
  }

  @Post(':appointmentId/reschedule')
  @HttpCode(201)
  @Idempotent('scheduling.appointment.reschedule')
  @RequirePermission('scheduling.appointment.book')
  @ApiParam({ name: 'appointmentId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Move a booking to another session',
    description:
      'In one step: books the new session (CAPACITY_FULL if full), marks this appointment ' +
      'RESCHEDULED and frees its place. Answers with the new appointment, linked to this one.',
    body: rescheduleAppointmentRequestSchema,
    success: { status: 201, description: 'The new appointment', schema: appointmentSchema },
    errors: [...CHANGE_ERRORS, 'CAPACITY_FULL'],
    csrf: true,
  })
  reschedule(
    @Param('appointmentId', appointmentIdPipe()) appointmentId: string,
    @Body(new ZodBodyPipe(rescheduleAppointmentRequestSchema))
    request: RescheduleAppointmentRequest,
  ): Promise<Appointment> {
    return this.appointments.reschedule(appointmentId, request);
  }

  @Post(':appointmentId/cancel')
  @HttpCode(200)
  @Idempotent('scheduling.appointment.cancel')
  @RequirePermission('scheduling.appointment.book')
  @ApiParam({ name: 'appointmentId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Cancel a booking with a reason',
    description:
      'Before the session ends. The record is kept with the reason and who cancelled it; the ' +
      'place is freed. After the end, mark a no-show instead.',
    body: cancelAppointmentRequestSchema,
    success: { status: 200, description: 'The cancelled appointment', schema: appointmentSchema },
    errors: CHANGE_ERRORS,
    csrf: true,
  })
  cancel(
    @Param('appointmentId', appointmentIdPipe()) appointmentId: string,
    @Body(new ZodBodyPipe(cancelAppointmentRequestSchema)) request: CancelAppointmentRequest,
  ): Promise<Appointment> {
    return this.appointments.cancel(appointmentId, request);
  }

  @Post(':appointmentId/no-show')
  @HttpCode(200)
  @Idempotent('scheduling.appointment.no-show')
  @RequirePermission('scheduling.appointment.book')
  @ApiParam({ name: 'appointmentId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Mark a booking as a no-show',
    description:
      'Only after the session has ended (FR-SCH-005). No visit or invoice is created; the place ' +
      'stays counted.',
    body: markNoShowRequestSchema,
    success: { status: 200, description: 'The no-show appointment', schema: appointmentSchema },
    errors: CHANGE_ERRORS,
    csrf: true,
  })
  markNoShow(
    @Param('appointmentId', appointmentIdPipe()) appointmentId: string,
    @Body(new ZodBodyPipe(markNoShowRequestSchema)) request: MarkNoShowRequest,
  ): Promise<Appointment> {
    return this.appointments.markNoShow(appointmentId, request);
  }
}
