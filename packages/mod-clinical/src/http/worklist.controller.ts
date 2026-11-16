// The doctor worklist and consultation start (T-CLI-01; FR-CLI-002; UC-CLI-01 step 1; SCR-08;
// ADR-015): GET /api/v1/worklist is polled by the worklist screen and answers 304 when nothing
// changed; POST /api/v1/visits/{visitId}/consultation/start opens a waiting patient. All need
// clinical.consultation.record (the doctor role, C-009); which patients are the doctor's comes
// from the practitioner linked to the account (FR-PRA-003).
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  consultationSchema,
  doctorWorklistSchema,
  startConsultationRequestSchema,
  type Consultation,
  type DoctorWorklist,
  type StartConsultationRequest,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import {
  ApiEndpoint,
  ConditionalGet,
  Idempotent,
  SESSION_SECURITY,
  ZodBodyPipe,
} from '@hms/platform';
import { WorklistService } from '../application/worklist.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;

/** A malformed ID is NOT_FOUND, like a record of another hospital. */
const idPipe = (what: string) =>
  new ParseUUIDPipe({ exceptionFactory: () => new DomainError('NOT_FOUND', `${what} not found`) });

@ApiTags('clinical')
@ApiCookieAuth(SESSION_SECURITY)
@Controller()
export class WorklistController {
  constructor(@Inject(WorklistService) private readonly worklist: WorklistService) {}

  @Get('worklist')
  @RequirePermission('clinical.consultation.record')
  @ConditionalGet()
  @ApiEndpoint({
    summary: "Today's worklist of the signed-in doctor",
    description:
      "The published sessions of today (the hospital's date) of the practitioner linked to the " +
      'account, each with its booked and checked-in patients in queue order and their status: ' +
      'EXPECTED, WAITING_PAYMENT (doctor fee not paid), WAITING, IN_CONSULTATION, CONSULTED. ' +
      'practitioner is null when the account is not linked. Sends an ETag; with a matching ' +
      'If-None-Match it answers 304 Not Modified (ADR-015).',
    success: { status: 200, description: 'The worklist', schema: doctorWorklistSchema },
    errors: ACCESS_ERRORS,
  })
  today(): Promise<DoctorWorklist> {
    return this.worklist.today();
  }

  @Post('visits/:visitId/consultation/start')
  @HttpCode(201)
  @Idempotent('clinical.consultation.start')
  @RequirePermission('clinical.consultation.record')
  @ApiParam({ name: 'visitId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Start the consultation of a waiting patient',
    description:
      "Only the visit's doctor, on an open OPD consultation visit whose doctor fee is paid (C-011): " +
      'the consultation becomes IN_CONSULTATION. Send the visit version the worklist showed; ' +
      'a second doctor or tab gets STALE_RECORD or INVALID_TRANSITION. Needs an Idempotency-Key.',
    body: startConsultationRequestSchema,
    success: { status: 201, description: 'The consultation', schema: consultationSchema },
    errors: [
      ...ACCESS_ERRORS,
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'INVALID_TRANSITION',
      'STALE_RECORD',
      'PAYMENT_NOT_ELIGIBLE',
      'IDEMPOTENCY_KEY_REUSED',
    ],
    csrf: true,
  })
  start(
    @Param('visitId', idPipe('Visit')) visitId: string,
    @Body(new ZodBodyPipe(startConsultationRequestSchema)) request: StartConsultationRequest,
  ): Promise<Consultation> {
    return this.worklist.start(visitId, request);
  }

  @Get('consultations/:consultationId')
  @RequirePermission('clinical.consultation.record')
  @ApiParam({ name: 'consultationId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Read one of your consultations',
    description: "The signed-in doctor's own consultation; another doctor's is NOT_FOUND.",
    success: { status: 200, description: 'The consultation', schema: consultationSchema },
    errors: [...ACCESS_ERRORS, 'NOT_FOUND'],
  })
  consultation(
    @Param('consultationId', idPipe('Consultation')) consultationId: string,
  ): Promise<Consultation> {
    return this.worklist.consultation(consultationId);
  }
}
