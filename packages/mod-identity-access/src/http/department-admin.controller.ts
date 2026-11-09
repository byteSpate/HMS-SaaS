// /api/v1/admin/departments (T-PRA-02; FR-CFG-001, FR-I18N-006; SP-03): the hospital
// administrator lists, adds and edits departments. Departments are hospital configuration, so the
// routes need admin.config.publish (ADM template). Reception pickers get their own read route with
// the scheduling permissions (T-SCH-01).
import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  createDepartmentRequestSchema,
  departmentListSchema,
  departmentRecordSchema,
  updateDepartmentRequestSchema,
  type CreateDepartmentRequest,
  type DepartmentList,
  type DepartmentRecord,
  type UpdateDepartmentRequest,
} from '@hms/contracts';
import { ApiEndpoint, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { DepartmentAdminService } from '../application/department-admin.service.js';
import {
  ADMIN_READ_ERRORS,
  ADMIN_WRITE_ERRORS,
  adminOf,
  idPipe,
  type AdminRequest,
} from './admin-request.js';
import { RequirePermission } from './decorators.js';

@ApiTags('admin: departments')
@ApiCookieAuth(SESSION_SECURITY)
@RequirePermission('admin.config.publish')
@Controller('admin/departments')
export class DepartmentAdminController {
  constructor(private readonly departments: DepartmentAdminService) {}

  @Get()
  @ApiEndpoint({
    summary: 'List the departments of this hospital',
    description: 'Active ones first, then by code. Inactive departments are included.',
    success: { status: 200, description: 'The departments', schema: departmentListSchema },
    errors: ADMIN_READ_ERRORS,
  })
  list(@Req() request: AdminRequest): Promise<DepartmentList> {
    return this.departments.list(adminOf(request));
  }

  @Get(':departmentId')
  @ApiParam({ name: 'departmentId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Get a department with the current version',
    success: { status: 200, description: 'The department', schema: departmentRecordSchema },
    errors: [...ADMIN_READ_ERRORS, 'NOT_FOUND'],
  })
  detail(
    @Param('departmentId', idPipe('Department')) departmentId: string,
    @Req() request: AdminRequest,
  ): Promise<DepartmentRecord> {
    return this.departments.detail(adminOf(request), departmentId);
  }

  @Post()
  @HttpCode(201)
  @ApiEndpoint({
    summary: 'Add a department',
    description:
      'A code (stored upper case, unique in this hospital: VALIDATION_FAILED on `code` ' +
      'otherwise) and a name in Bangla or English.',
    body: createDepartmentRequestSchema,
    success: { status: 201, description: 'The new department', schema: departmentRecordSchema },
    errors: ADMIN_WRITE_ERRORS,
    csrf: true,
  })
  create(
    @Body(new ZodBodyPipe(createDepartmentRequestSchema)) body: CreateDepartmentRequest,
    @Req() request: AdminRequest,
  ): Promise<DepartmentRecord> {
    return this.departments.create(adminOf(request), body, request.correlationId);
  }

  @Put(':departmentId')
  @ApiParam({ name: 'departmentId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Edit or deactivate a department',
    description:
      'Send the whole record with the version the screen showed; a name left out is cleared. ' +
      'Another version is STALE_RECORD (SP-03). `active: false` hides the department from ' +
      'selection lists; the record is never deleted.',
    body: updateDepartmentRequestSchema,
    success: { status: 200, description: 'The new version', schema: departmentRecordSchema },
    errors: [...ADMIN_WRITE_ERRORS, 'NOT_FOUND', 'STALE_RECORD'],
    csrf: true,
  })
  update(
    @Param('departmentId', idPipe('Department')) departmentId: string,
    @Body(new ZodBodyPipe(updateDepartmentRequestSchema)) body: UpdateDepartmentRequest,
    @Req() request: AdminRequest,
  ): Promise<DepartmentRecord> {
    return this.departments.update(adminOf(request), departmentId, body, request.correlationId);
  }
}
