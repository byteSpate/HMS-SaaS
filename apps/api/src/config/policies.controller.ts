// /api/v1/config/policies: publish, preview and list a hospital's effective-dated settings (T-PLT-05;
// FR-CFG-002, FR-SAA-005; P-004; AT-CFG-001, -003). Needs admin.config.publish, and every
// publication is audited. Publishing is idempotent, so a retried request makes one version.
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  policyPreviewSchema,
  policyVersionListSchema,
  policyVersionSchema,
  previewPolicyRequestSchema,
  publishPolicyRequestSchema,
  type PolicyPreview,
  type PolicyVersionRow,
  type PreviewPolicyRequest,
  type PublishPolicyRequest,
} from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import {
  ApiEndpoint,
  assertPolicyKey,
  getRequestContext,
  Idempotent,
  listPolicyVersions,
  previewPolicy,
  PRISMA,
  publishPolicyVersion,
  SESSION_SECURITY,
  ZodBodyPipe,
} from '@hms/platform';

const READ_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND'] as const;
const KEY_PARAM = { name: 'policyKey', description: 'numbering or security' };

function requestScope() {
  const context = getRequestContext();
  if (!context?.tenantId || !context.userId) {
    throw new DomainError('TENANT_NOT_SELECTED', 'Choose a hospital first');
  }
  return { ...context, tenantId: context.tenantId, userId: context.userId };
}

@ApiTags('config: policies')
@ApiCookieAuth(SESSION_SECURITY)
@RequirePermission('admin.config.publish')
@Controller('config/policies')
export class PoliciesController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get(':policyKey')
  @ApiParam(KEY_PARAM)
  @ApiEndpoint({
    summary: 'List the versions of a policy',
    description: 'Newest first, including versions that take effect later.',
    success: { status: 200, description: 'The versions', schema: policyVersionListSchema },
    errors: READ_ERRORS,
  })
  list(@Param('policyKey') policyKey: string): Promise<PolicyVersionRow[]> {
    assertPolicyKey(policyKey);
    return withTenant(this.prisma, requestScope(), (tx) => listPolicyVersions(tx, policyKey));
  }

  @Post(':policyKey/preview')
  @HttpCode(200)
  @ApiParam(KEY_PARAM)
  @ApiEndpoint({
    summary: 'See what publishing would change',
    description: 'Checks the values and compares them with the version in force. Saves nothing.',
    body: previewPolicyRequestSchema,
    success: { status: 200, description: 'The changes', schema: policyPreviewSchema },
    errors: [...READ_ERRORS, 'VALIDATION_FAILED'],
    csrf: true,
  })
  preview(
    @Param('policyKey') policyKey: string,
    @Body(new ZodBodyPipe(previewPolicyRequestSchema)) request: PreviewPolicyRequest,
  ): Promise<PolicyPreview> {
    assertPolicyKey(policyKey);
    return withTenant(this.prisma, requestScope(), (tx) =>
      previewPolicy(tx, policyKey, request.body, new Date()),
    );
  }

  @Post(':policyKey/versions')
  @HttpCode(201)
  @Idempotent('config.policy.publish')
  @ApiParam(KEY_PARAM)
  @ApiEndpoint({
    summary: 'Publish a new version of a policy',
    description:
      'Applies at once, or at `effectiveFrom`. A past time answers VALIDATION_FAILED, because ' +
      'existing records must keep the version they used (FR-SAA-005). Needs an Idempotency-Key.',
    body: publishPolicyRequestSchema,
    success: { status: 201, description: 'The new version', schema: policyVersionSchema },
    errors: [...READ_ERRORS, 'VALIDATION_FAILED', 'IDEMPOTENCY_KEY_REUSED'],
    csrf: true,
  })
  publish(
    @Param('policyKey') policyKey: string,
    @Body(new ZodBodyPipe(publishPolicyRequestSchema)) request: PublishPolicyRequest,
  ): Promise<PolicyVersionRow> {
    const scope = requestScope();
    const now = new Date();
    return withTenant(this.prisma, scope, (tx) =>
      publishPolicyVersion(tx, {
        tenantId: scope.tenantId,
        actorUserId: scope.userId,
        ...(scope.membershipId ? { membershipId: scope.membershipId } : {}),
        correlationId: scope.correlationId,
        policyKey,
        body: request.body,
        effectiveFrom: request.effectiveFrom ? new Date(request.effectiveFrom) : now,
        reason: request.reason,
        now,
      }),
    );
  }
}
