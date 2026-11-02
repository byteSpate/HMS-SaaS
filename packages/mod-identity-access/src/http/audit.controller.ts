// GET /api/v1/audit/events: search this hospital's audit trail (T-PLT-02; FR-AUD-005; AT-AUD-005;
// SCR-24). Needs audit.view. Results are paged and limited to the hospital by RLS.
import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { auditEventSchema, auditSearchQuerySchema, type AuditSearchQuery } from '@hms/contracts';
import type { PrismaClient } from '@hms/database';
import { ApiEndpoint, PagedResult, PRISMA, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { searchAuditEvents } from '../infrastructure/audit-search.repository.js';
import { ADMIN_READ_ERRORS, adminOf, type AdminRequest } from './admin-request.js';
import { RequirePermission } from './decorators.js';

@ApiTags('audit')
@ApiCookieAuth(SESSION_SECURITY)
@RequirePermission('audit.view')
@Controller('audit/events')
export class AuditController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get()
  @ApiQuery({ name: 'actor', required: false, description: 'Exact username of a member' })
  @ApiQuery({ name: 'action', required: false, description: 'Start of an action code' })
  @ApiQuery({ name: 'targetId', required: false, description: 'The record the event is about' })
  @ApiQuery({ name: 'from', required: false, description: 'From this time, RFC 3339' })
  @ApiQuery({ name: 'to', required: false, description: 'Up to this time, RFC 3339' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size, at most 100' })
  @ApiQuery({ name: 'cursor', required: false, description: 'meta.nextCursor of the last page' })
  @ApiEndpoint({
    summary: 'Search the audit trail of this hospital',
    description: 'Newest first. `meta.nextCursor` is null on the last page.',
    success: { status: 200, description: 'One page of events', schema: auditEventSchema },
    errors: [...ADMIN_READ_ERRORS, 'VALIDATION_FAILED'],
  })
  async search(
    @Query(new ZodBodyPipe(auditSearchQuerySchema)) query: AuditSearchQuery,
    @Req() request: AdminRequest,
  ) {
    const page = await searchAuditEvents(this.prisma, adminOf(request), query);
    return new PagedResult(page.rows, page.nextCursor);
  }
}
