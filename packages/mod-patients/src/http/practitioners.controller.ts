// /api/v1/practitioners (T-PRA-01; FR-PRA-001..003): the hospital administrator lists, adds and
// edits practitioners. Every route needs practitioner.manage; the scheduling picker gets its own
// read route with the scheduling permissions (T-SCH-01).
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  createPractitionerRequestSchema,
  practitionerListSchema,
  practitionerSchema,
  updatePractitionerRequestSchema,
  type CreatePractitionerRequest,
  type Practitioner,
  type PractitionerList,
  type UpdatePractitionerRequest,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { PractitionerService } from '../application/practitioner.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;

/** A malformed ID is NOT_FOUND, like a practitioner of another hospital. */
const practitionerIdPipe = () =>
  new ParseUUIDPipe({
    exceptionFactory: () => new DomainError('NOT_FOUND', 'Practitioner not found'),
  });

@ApiTags('practitioners')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('practitioners')
export class PractitionersController {
  constructor(@Inject(PractitionerService) private readonly practitioners: PractitionerService) {}

  @Get()
  @RequirePermission('practitioner.manage')
  @ApiEndpoint({
    summary: 'List the practitioners of the hospital',
    description: 'Active ones first, then by name. Inactive practitioners are included.',
    success: { status: 200, description: 'The practitioners', schema: practitionerListSchema },
    errors: ACCESS_ERRORS,
  })
  list(): Promise<PractitionerList> {
    return this.practitioners.list();
  }

  @Get(':practitionerId')
  @RequirePermission('practitioner.manage')
  @ApiParam({ name: 'practitionerId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Get a practitioner with the current version',
    success: { status: 200, description: 'The practitioner', schema: practitionerSchema },
    errors: [...ACCESS_ERRORS, 'NOT_FOUND'],
  })
  detail(
    @Param('practitionerId', practitionerIdPipe()) practitionerId: string,
  ): Promise<Practitioner> {
    return this.practitioners.detail(practitionerId);
  }

  @Post()
  @HttpCode(201)
  @Idempotent('practitioner.create')
  @RequirePermission('practitioner.manage')
  @ApiEndpoint({
    summary: 'Add a practitioner',
    description:
      'A name in Bangla or English is required. Two practitioners may share a name ' +
      '(FR-PRA-001); degrees, specialty and registration number tell them apart. Needs an ' +
      'Idempotency-Key: a retry returns the same practitioner.',
    body: createPractitionerRequestSchema,
    success: { status: 201, description: 'The new practitioner', schema: practitionerSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED', 'IDEMPOTENCY_KEY_REUSED'],
    csrf: true,
  })
  create(
    @Body(new ZodBodyPipe(createPractitionerRequestSchema)) request: CreatePractitionerRequest,
  ): Promise<Practitioner> {
    return this.practitioners.create(request);
  }

  @Put(':practitionerId')
  @Idempotent('practitioner.update')
  @RequirePermission('practitioner.manage')
  @ApiParam({ name: 'practitionerId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Edit or deactivate a practitioner',
    description:
      'Send the whole record with the version the screen showed; a field left out is cleared. ' +
      'Another version is STALE_RECORD (SP-03). `active: false` hides the practitioner from ' +
      'selection lists; the record is never deleted. Needs an Idempotency-Key.',
    body: updatePractitionerRequestSchema,
    success: { status: 200, description: 'The new version', schema: practitionerSchema },
    errors: [
      ...ACCESS_ERRORS,
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'STALE_RECORD',
      'IDEMPOTENCY_KEY_REUSED',
    ],
    csrf: true,
  })
  update(
    @Param('practitionerId', practitionerIdPipe()) practitionerId: string,
    @Body(new ZodBodyPipe(updatePractitionerRequestSchema)) request: UpdatePractitionerRequest,
  ): Promise<Practitioner> {
    return this.practitioners.update(practitionerId, request);
  }
}
