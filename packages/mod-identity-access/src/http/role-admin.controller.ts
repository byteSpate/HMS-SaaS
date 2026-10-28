// /api/v1/admin/roles endpoints (T-ACC-05; FR-ACC-008; C-045; SCR-22): list roles with the
// product templates, create a role (usually from a template) and replace a role's permissions.
// Hospital administrators only (admin.role.manage); every change is audited.
import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  adminRoleListSchema,
  adminRoleSchema,
  createRoleRequestSchema,
  setRolePermissionsRequestSchema,
  type AdminRole,
  type AdminRoleList,
  type CreateRoleRequest,
  type SetRolePermissionsRequest,
} from '@hms/contracts';
import { ApiEndpoint, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { RoleAdminService } from '../application/role-admin.service.js';
import {
  ADMIN_READ_ERRORS,
  ADMIN_WRITE_ERRORS,
  adminOf,
  idPipe,
  type AdminRequest,
} from './admin-request.js';
import { RequirePermission } from './decorators.js';

@ApiTags('admin: roles')
@ApiCookieAuth(SESSION_SECURITY)
@RequirePermission('admin.role.manage')
@Controller('admin/roles')
export class RoleAdminController {
  constructor(private readonly roles: RoleAdminService) {}

  @Get()
  @ApiEndpoint({
    summary: 'List the roles of this hospital',
    description: 'Each role with its permissions and member count, and the 9 product templates.',
    success: { status: 200, description: 'Roles and templates', schema: adminRoleListSchema },
    errors: ADMIN_READ_ERRORS,
  })
  list(@Req() request: AdminRequest): Promise<AdminRoleList> {
    return this.roles.list(adminOf(request));
  }

  @Post()
  @HttpCode(201)
  @ApiEndpoint({
    summary: 'Create a role',
    description:
      'Usually a copy of a product template (C-045) given by `templateCode`; the code must be ' +
      'unique in this hospital (VALIDATION_FAILED on `code` otherwise).',
    body: createRoleRequestSchema,
    success: { status: 201, description: 'The new role', schema: adminRoleSchema },
    errors: ADMIN_WRITE_ERRORS,
    csrf: true,
  })
  create(
    @Body(new ZodBodyPipe(createRoleRequestSchema)) body: CreateRoleRequest,
    @Req() request: AdminRequest,
  ): Promise<AdminRole> {
    return this.roles.create(adminOf(request), body, request.correlationId);
  }

  @Put(':roleId/permissions')
  @ApiParam({ name: 'roleId', format: 'uuid', description: 'A role of this hospital' })
  @ApiEndpoint({
    summary: 'Replace the permissions of a role',
    description:
      'Applies on the next request of everyone holding the role. You cannot remove ' +
      'admin.user.manage or admin.role.manage from a role you hold (PERMISSION_DENIED).',
    body: setRolePermissionsRequestSchema,
    success: { status: 200, description: 'The role after the change', schema: adminRoleSchema },
    errors: [...ADMIN_WRITE_ERRORS, 'NOT_FOUND'],
    csrf: true,
  })
  setPermissions(
    @Param('roleId', idPipe('Role')) roleId: string,
    @Body(new ZodBodyPipe(setRolePermissionsRequestSchema)) body: SetRolePermissionsRequest,
    @Req() request: AdminRequest,
  ): Promise<AdminRole> {
    return this.roles.setPermissions(
      adminOf(request),
      roleId,
      body.permissions,
      request.correlationId,
    );
  }
}
