// /api/v1/schedule-sessions (T-SCH-01; FR-SCH-002; AT-SCH-001; C-035): staff with
// scheduling.schedule.manage list sessions in a date range, add a session as a draft, publish it
// or cancel it. The practitioner picker is here, so scheduling does not need practitioner.manage.
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
  changeScheduleSessionRequestSchema,
  createScheduleSessionRequestSchema,
  MAX_SESSION_LIST_DAYS,
  practitionerChoiceListSchema,
  scheduleSessionListQuerySchema,
  scheduleSessionListSchema,
  scheduleSessionSchema,
  type ChangeScheduleSessionRequest,
  type CreateScheduleSessionRequest,
  type PractitionerChoiceList,
  type ScheduleSession,
  type ScheduleSessionList,
  type ScheduleSessionListQuery,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { ScheduleSessionService } from '../application/schedule-session.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;
const CHANGE_ERRORS = [
  ...ACCESS_ERRORS,
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'STALE_RECORD',
  'INVALID_TRANSITION',
  'IDEMPOTENCY_KEY_REUSED',
] as const;

/** A malformed ID is NOT_FOUND, like a session of another hospital. */
const sessionIdPipe = () =>
  new ParseUUIDPipe({
    exceptionFactory: () => new DomainError('NOT_FOUND', 'Session not found'),
  });

@ApiTags('scheduling')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('schedule-sessions')
export class ScheduleSessionsController {
  constructor(@Inject(ScheduleSessionService) private readonly sessions: ScheduleSessionService) {}

  @Get()
  @RequirePermission('scheduling.schedule.manage')
  @ApiQuery({ name: 'from', format: 'date' })
  @ApiQuery({ name: 'to', format: 'date' })
  @ApiQuery({ name: 'practitionerId', format: 'uuid', required: false })
  @ApiEndpoint({
    summary: 'List the sessions in a date range',
    description:
      `Sessions from \`from\` to \`to\` (hospital dates, both included, at most ` +
      `${MAX_SESSION_LIST_DAYS} days), in time order, cancelled ones included.`,
    success: { status: 200, description: 'The sessions', schema: scheduleSessionListSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED'],
  })
  list(
    @Query(new ZodBodyPipe(scheduleSessionListQuerySchema)) query: ScheduleSessionListQuery,
  ): Promise<ScheduleSessionList> {
    return this.sessions.list(query);
  }

  @Get('practitioner-choices')
  @RequirePermission('scheduling.schedule.manage')
  @ApiEndpoint({
    summary: 'List the practitioners a session can be given',
    description: 'The active practitioners of the hospital, by name.',
    success: {
      status: 200,
      description: 'The active practitioners',
      schema: practitionerChoiceListSchema,
    },
    errors: ACCESS_ERRORS,
  })
  practitionerChoices(): Promise<PractitionerChoiceList> {
    return this.sessions.practitionerChoices();
  }

  @Post()
  @HttpCode(201)
  @Idempotent('scheduling.session.create')
  @RequirePermission('scheduling.schedule.manage')
  @ApiEndpoint({
    summary: 'Add a session as a draft',
    description:
      'Date and times are on the hospital clock (HH:mm). The session must not have ended, must ' +
      'end after it starts, and must not overlap another session of the same practitioner that ' +
      'is not cancelled. Capacity is fixed and never exceeded (C-035). Needs an Idempotency-Key.',
    body: createScheduleSessionRequestSchema,
    success: { status: 201, description: 'The new draft session', schema: scheduleSessionSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED', 'IDEMPOTENCY_KEY_REUSED'],
    csrf: true,
  })
  create(
    @Body(new ZodBodyPipe(createScheduleSessionRequestSchema))
    request: CreateScheduleSessionRequest,
  ): Promise<ScheduleSession> {
    return this.sessions.create(request);
  }

  @Post(':sessionId/publish')
  @HttpCode(200)
  @Idempotent('scheduling.session.publish')
  @RequirePermission('scheduling.schedule.manage')
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Publish a draft session, so it takes bookings',
    description:
      'Only a draft that has not ended can be published; anything else is INVALID_TRANSITION ' +
      'or VALIDATION_FAILED. Send the version the screen showed (SP-03).',
    body: changeScheduleSessionRequestSchema,
    success: { status: 200, description: 'The published session', schema: scheduleSessionSchema },
    errors: CHANGE_ERRORS,
    csrf: true,
  })
  publish(
    @Param('sessionId', sessionIdPipe()) sessionId: string,
    @Body(new ZodBodyPipe(changeScheduleSessionRequestSchema))
    request: ChangeScheduleSessionRequest,
  ): Promise<ScheduleSession> {
    return this.sessions.publish(sessionId, request);
  }

  @Post(':sessionId/cancel')
  @HttpCode(200)
  @Idempotent('scheduling.session.cancel')
  @RequirePermission('scheduling.schedule.manage')
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Cancel a session that has no bookings',
    description:
      'A draft or published session with no bookings is cancelled and kept. A session with ' +
      'bookings is INVALID_TRANSITION: reschedule or cancel its appointments first (T-SCH-02).',
    body: changeScheduleSessionRequestSchema,
    success: { status: 200, description: 'The cancelled session', schema: scheduleSessionSchema },
    errors: CHANGE_ERRORS,
    csrf: true,
  })
  cancel(
    @Param('sessionId', sessionIdPipe()) sessionId: string,
    @Body(new ZodBodyPipe(changeScheduleSessionRequestSchema))
    request: ChangeScheduleSessionRequest,
  ): Promise<ScheduleSession> {
    return this.sessions.cancel(sessionId, request);
  }
}
