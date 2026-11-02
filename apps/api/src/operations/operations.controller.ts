// GET /api/v1/operations/{key}: what happened to a command whose answer the client never received
// (T-PLT-01; SP-08; AT-PLT-003; D section 8.2). Only the signed-in user's own commands in the
// current hospital are visible. Not found means nothing took effect, so a retry is safe.
import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { operationOutcomeSchema, type OperationOutcome } from '@hms/contracts';
import type { PrismaClient } from '@hms/database';
import { DomainError } from '@hms/domain-kernel';
import { AllowWithoutTenant } from '@hms/mod-identity-access';
import { ApiEndpoint, findOperation, PRISMA, SESSION_SECURITY } from '@hms/platform';

@ApiTags('operations')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('operations')
export class OperationsController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  // No permission marker fits: every user may ask about their own commands. findOperation still
  // needs a hospital and refuses without one.
  @AllowWithoutTenant()
  @Get(':key')
  @ApiParam({ name: 'key', format: 'uuid', description: 'The Idempotency-Key of the command' })
  @ApiEndpoint({
    summary: 'Outcome of a command by its idempotency key',
    description:
      'Use after a timeout, when the answer was lost. Not found means the command did not take ' +
      'effect, so sending it again with the same key is safe.',
    success: { status: 200, description: 'The finished command', schema: operationOutcomeSchema },
    errors: ['UNAUTHENTICATED', 'TENANT_NOT_SELECTED', 'NOT_FOUND'],
  })
  async outcome(@Param('key', ParseUUIDPipe) key: string): Promise<OperationOutcome> {
    const outcome = await findOperation(this.prisma, key);
    if (!outcome) throw new DomainError('NOT_FOUND', 'No finished command has this key');
    return outcome;
  }
}
