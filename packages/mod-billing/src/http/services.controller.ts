// /api/v1/billing/services (T-ORD-01; FR-ORD-001, FR-ORD-007, FR-CFG-001; SP-03): the staff who
// keep the price list (admin.price.publish, ADM and FIN) list, add and edit the orderable
// services: tests, imaging, procedures. Prices are set in the price list draft.
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
  createServiceRequestSchema,
  serviceListSchema,
  serviceRecordSchema,
  updateServiceRequestSchema,
  type CreateServiceRequest,
  type ServiceList,
  type ServiceRecord,
  type UpdateServiceRequest,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { ServiceCatalogueService } from '../application/service-catalogue.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;
const WRITE_ERRORS = [...ACCESS_ERRORS, 'CSRF_TOKEN_INVALID', 'VALIDATION_FAILED'] as const;

@ApiTags('billing')
@ApiCookieAuth(SESSION_SECURITY)
@RequirePermission('admin.price.publish')
@Controller('billing/services')
export class ServicesController {
  constructor(
    @Inject(ServiceCatalogueService) private readonly services: ServiceCatalogueService,
  ) {}

  @Get()
  @ApiEndpoint({
    summary: 'List the orderable services of this hospital',
    description: 'Lab tests, imaging, procedures and other services; active first, then by code.',
    success: { status: 200, description: 'The services', schema: serviceListSchema },
    errors: ACCESS_ERRORS,
  })
  list(): Promise<ServiceList> {
    return this.services.list();
  }

  @Post()
  @HttpCode(201)
  @ApiEndpoint({
    summary: 'Add a service',
    description:
      'A code (upper case, unique among all items of this hospital), a category, a name in ' +
      'Bangla or English, whether reception may order it directly, and the expected hours to ' +
      'the report. The service is orderable once the price list in force has its price.',
    body: createServiceRequestSchema,
    success: { status: 201, description: 'The new service', schema: serviceRecordSchema },
    errors: WRITE_ERRORS,
    csrf: true,
  })
  create(
    @Body(new ZodBodyPipe(createServiceRequestSchema)) body: CreateServiceRequest,
  ): Promise<ServiceRecord> {
    return this.services.create(body);
  }

  @Put(':serviceItemId')
  @ApiParam({ name: 'serviceItemId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Edit or deactivate a service',
    description:
      'The whole editable record with the version the screen showed (SP-03). The code and ' +
      'the category never change. Orders already placed keep their charge.',
    body: updateServiceRequestSchema,
    success: { status: 200, description: 'The new version', schema: serviceRecordSchema },
    errors: [...WRITE_ERRORS, 'NOT_FOUND', 'STALE_RECORD'],
    csrf: true,
  })
  update(
    // A malformed ID is NOT_FOUND, like a service of another hospital.
    @Param(
      'serviceItemId',
      new ParseUUIDPipe({
        exceptionFactory: () => new DomainError('NOT_FOUND', 'Service not found'),
      }),
    )
    serviceItemId: string,
    @Body(new ZodBodyPipe(updateServiceRequestSchema)) body: UpdateServiceRequest,
  ): Promise<ServiceRecord> {
    return this.services.update(serviceItemId, body);
  }
}
