// /api/v1/visits (T-VIS-01; UC-VIS-01; FR-VIS-002, FR-SCH-004, FR-BIL-010; C-035): staff with
// visit.checkin (reception) check in a booked appointment on its session date. The answer is the
// visit with its serial number and the doctor-fee invoice, or POLICY_NOT_CONFIGURED for the fee.
import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  checkInRequestSchema,
  visitCheckInSchema,
  type CheckInRequest,
  type VisitCheckIn,
} from '@hms/contracts';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { VisitService } from '../application/visit.service.js';

@ApiTags('clinical')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('visits')
export class VisitsController {
  constructor(@Inject(VisitService) private readonly visits: VisitService) {}

  @Post('check-in')
  @HttpCode(201)
  @Idempotent('visit.checkin')
  @RequirePermission('visit.checkin')
  @ApiEndpoint({
    summary: 'Check in a booked appointment',
    description:
      'On the session date: the appointment becomes CHECKED_IN, one OPD_CONSULTATION visit is ' +
      "created with the next serial number of the doctor's session (C-035), and the doctor-fee " +
      'invoice is issued at the fee in force (new patient, or follow-up within the window). ' +
      'With no fee configured the visit is still created and doctorFee.status is ' +
      'POLICY_NOT_CONFIGURED. Needs an Idempotency-Key: a repeat returns the same visit.',
    body: checkInRequestSchema,
    success: { status: 201, description: 'The visit', schema: visitCheckInSchema },
    errors: [
      'UNAUTHENTICATED',
      'PERMISSION_DENIED',
      'ENTITLEMENT_MISSING',
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'STALE_RECORD',
      'INVALID_TRANSITION',
      'IDEMPOTENCY_KEY_REUSED',
    ],
    csrf: true,
  })
  checkIn(
    @Body(new ZodBodyPipe(checkInRequestSchema)) request: CheckInRequest,
  ): Promise<VisitCheckIn> {
    return this.visits.checkIn(request);
  }
}
