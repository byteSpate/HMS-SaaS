// /api/v1/billing/cashier-sessions (T-BIL-03; FR-BIL-026; UC-BIL-04): the cashier
// (billing.cashier_session.manage) reads, opens and closes their own session; finance
// (billing.cashier_session.review) lists closed sessions and reviews them. The server computes the
// expected amounts and the variance; the client only sends what was counted.
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
  cashierSessionListQuerySchema,
  cashierSessionListSchema,
  cashierSessionSchema,
  closeCashierSessionRequestSchema,
  currentCashierSessionSchema,
  openCashierSessionRequestSchema,
  reviewCashierSessionRequestSchema,
  type CashierSession,
  type CashierSessionList,
  type CashierSessionListQuery,
  type CloseCashierSessionRequest,
  type CurrentCashierSession,
  type OpenCashierSessionRequest,
  type ReviewCashierSessionRequest,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { CashierSessionService } from '../application/cashier-session.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;
const COMMAND_ERRORS = [...ACCESS_ERRORS, 'VALIDATION_FAILED', 'IDEMPOTENCY_KEY_REUSED'] as const;

/** A malformed ID is NOT_FOUND, like a session of another hospital. */
function sessionIdPipe(): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () => new DomainError('NOT_FOUND', 'Cashier session not found'),
  });
}

@ApiTags('billing')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('billing/cashier-sessions')
export class CashierSessionsController {
  constructor(@Inject(CashierSessionService) private readonly sessions: CashierSessionService) {}

  @Get('current')
  @RequirePermission('billing.cashier_session.manage')
  @ApiEndpoint({
    summary: 'Read my open cashier session',
    description: "The signed-in cashier's open session with its expected amounts, or null.",
    success: {
      status: 200,
      description: 'The open session or null',
      schema: currentCashierSessionSchema,
    },
    errors: [...ACCESS_ERRORS],
  })
  current(): Promise<CurrentCashierSession> {
    return this.sessions.current();
  }

  @Post()
  @HttpCode(201)
  @Idempotent('billing.cashier_session.open')
  @RequirePermission('billing.cashier_session.manage')
  @ApiEndpoint({
    summary: 'Open my cashier session',
    description:
      'One open session per cashier (UC-BIL-04 D1): a second one is INVALID_TRANSITION. The ' +
      'opening float is the cash in the drawer at the start, 0.00 when omitted.',
    body: openCashierSessionRequestSchema,
    success: { status: 201, description: 'The open session', schema: cashierSessionSchema },
    errors: [...COMMAND_ERRORS, 'INVALID_TRANSITION'],
    csrf: true,
  })
  open(
    @Body(new ZodBodyPipe(openCashierSessionRequestSchema)) request: OpenCashierSessionRequest,
  ): Promise<CashierSession> {
    return this.sessions.open(request);
  }

  @Post(':sessionId/close')
  @HttpCode(200)
  @Idempotent('billing.cashier_session.close')
  @RequirePermission('billing.cashier_session.manage')
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Close my cashier session',
    description:
      'Send the amount counted for every method. The server stores the expected amount of each ' +
      '(payments, plus the float for cash) and the variance, and the session waits for review.',
    body: closeCashierSessionRequestSchema,
    success: { status: 200, description: 'The closed session', schema: cashierSessionSchema },
    errors: [...COMMAND_ERRORS, 'NOT_FOUND', 'STALE_RECORD', 'INVALID_TRANSITION'],
    csrf: true,
  })
  close(
    @Param('sessionId', sessionIdPipe()) sessionId: string,
    @Body(new ZodBodyPipe(closeCashierSessionRequestSchema)) request: CloseCashierSessionRequest,
  ): Promise<CashierSession> {
    return this.sessions.close(sessionId, request);
  }

  @Get()
  @RequirePermission('billing.cashier_session.review')
  @ApiQuery({ name: 'status', required: false, enum: ['CLOSED_PENDING_REVIEW', 'REVIEWED'] })
  @ApiEndpoint({
    summary: 'List closed cashier sessions',
    description: 'Waiting for review (oldest first, the default) or reviewed (newest first).',
    success: { status: 200, description: 'The sessions', schema: cashierSessionListSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED'],
  })
  list(
    @Query(new ZodBodyPipe(cashierSessionListQuerySchema)) query: CashierSessionListQuery,
  ): Promise<CashierSessionList> {
    return this.sessions.list(query);
  }

  @Post(':sessionId/review')
  @HttpCode(200)
  @Idempotent('billing.cashier_session.review')
  @RequirePermission('billing.cashier_session.review')
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Review a closed cashier session',
    description:
      'A finance user other than the cashier (SEGREGATION_OF_DUTY) accepts the session; a ' +
      'variance needs a note.',
    body: reviewCashierSessionRequestSchema,
    success: { status: 200, description: 'The reviewed session', schema: cashierSessionSchema },
    errors: [
      ...COMMAND_ERRORS,
      'NOT_FOUND',
      'STALE_RECORD',
      'INVALID_TRANSITION',
      'SEGREGATION_OF_DUTY',
    ],
    csrf: true,
  })
  review(
    @Param('sessionId', sessionIdPipe()) sessionId: string,
    @Body(new ZodBodyPipe(reviewCashierSessionRequestSchema)) request: ReviewCashierSessionRequest,
  ): Promise<CashierSession> {
    return this.sessions.review(sessionId, request);
  }
}
