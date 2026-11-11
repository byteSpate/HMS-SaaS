// /api/v1/billing/price-lists (T-BIL-01; FR-CFG-001, FR-CFG-002, FR-BIL-007; C-041): staff with
// admin.price.publish (ADM, FIN) list the price list versions, open the draft, set or remove a
// doctor's fee in it, preview the changes and publish it now or from a later time.
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
  practitionerChoiceListSchema,
  priceListChangesSchema,
  priceListListSchema,
  priceListSchema,
  publishPriceListRequestSchema,
  removeDoctorFeeRequestSchema,
  setDoctorFeeRequestSchema,
  type PractitionerChoiceList,
  type PriceList,
  type PriceListChanges,
  type PriceListList,
  type PublishPriceListRequest,
  type RemoveDoctorFeeRequest,
  type SetDoctorFeeRequest,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { PriceListService } from '../application/price-list.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;
const DRAFT_ERRORS = [
  ...ACCESS_ERRORS,
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'STALE_RECORD',
  'INVALID_TRANSITION',
  'IDEMPOTENCY_KEY_REUSED',
] as const;

/** A malformed ID is NOT_FOUND, like a price list of another hospital. */
const uuidPipe = (what: string) =>
  new ParseUUIDPipe({ exceptionFactory: () => new DomainError('NOT_FOUND', `${what} not found`) });

@ApiTags('billing')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('billing/price-lists')
export class PriceListsController {
  constructor(@Inject(PriceListService) private readonly priceLists: PriceListService) {}

  @Get()
  @RequirePermission('admin.price.publish')
  @ApiEndpoint({
    summary: 'List the price list versions',
    description:
      'Newest first: the draft, if any, then the published versions with their effective time. ' +
      'inForce marks the version that prices records now.',
    success: { status: 200, description: 'The versions', schema: priceListListSchema },
    errors: ACCESS_ERRORS,
  })
  list(): Promise<PriceListList> {
    return this.priceLists.list();
  }

  @Post()
  @HttpCode(201)
  @Idempotent('billing.price_list.draft')
  @RequirePermission('admin.price.publish')
  @ApiEndpoint({
    summary: 'Open a draft price list',
    description:
      'A copy of the newest published version, to edit and publish. One draft at a time: a ' +
      'second one is INVALID_TRANSITION. Needs an Idempotency-Key.',
    success: { status: 201, description: 'The draft', schema: priceListSchema },
    errors: [...ACCESS_ERRORS, 'INVALID_TRANSITION', 'IDEMPOTENCY_KEY_REUSED'],
    csrf: true,
  })
  createDraft(): Promise<PriceList> {
    return this.priceLists.createDraft();
  }

  // Declared before ':priceListId' routes, so the path is not read as an ID. Its own route, because
  // a finance user who sets fees need not be allowed to manage schedules.
  @Get('practitioner-choices')
  @RequirePermission('admin.price.publish')
  @ApiEndpoint({
    summary: 'List the practitioners a fee can be set for',
    description: 'The active practitioners of the hospital, by name.',
    success: {
      status: 200,
      description: 'The active practitioners',
      schema: practitionerChoiceListSchema,
    },
    errors: ACCESS_ERRORS,
  })
  practitionerChoices(): Promise<PractitionerChoiceList> {
    return this.priceLists.practitionerChoices();
  }

  @Get(':priceListId')
  @RequirePermission('admin.price.publish')
  @ApiParam({ name: 'priceListId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Read a price list version with its doctor fees',
    success: { status: 200, description: 'The version', schema: priceListSchema },
    errors: [...ACCESS_ERRORS, 'NOT_FOUND'],
  })
  get(@Param('priceListId', uuidPipe('Price list')) priceListId: string): Promise<PriceList> {
    return this.priceLists.get(priceListId);
  }

  @Get(':priceListId/changes')
  @RequirePermission('admin.price.publish')
  @ApiParam({ name: 'priceListId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Preview what publishing this version changes',
    description: 'Doctor by doctor, against the version in force now (FR-CFG-002).',
    success: { status: 200, description: 'The changes', schema: priceListChangesSchema },
    errors: [...ACCESS_ERRORS, 'NOT_FOUND'],
  })
  changes(
    @Param('priceListId', uuidPipe('Price list')) priceListId: string,
  ): Promise<PriceListChanges> {
    return this.priceLists.changes(priceListId);
  }

  @Put(':priceListId/doctor-fees/:practitionerId')
  @Idempotent('billing.doctor_fee.set')
  @RequirePermission('admin.price.publish')
  @ApiParam({ name: 'priceListId', format: 'uuid' })
  @ApiParam({ name: 'practitionerId', format: 'uuid' })
  @ApiEndpoint({
    summary: "Set a doctor's fee in the draft",
    description:
      'The new-patient fee, the follow-up fee and the follow-up window in days (C-041). Both ' +
      'fees are more than 0.00; only an active practitioner can be given a fee.',
    body: setDoctorFeeRequestSchema,
    success: { status: 200, description: 'The draft', schema: priceListSchema },
    errors: DRAFT_ERRORS,
    csrf: true,
  })
  setDoctorFee(
    @Param('priceListId', uuidPipe('Price list')) priceListId: string,
    @Param('practitionerId', uuidPipe('Practitioner')) practitionerId: string,
    @Body(new ZodBodyPipe(setDoctorFeeRequestSchema)) request: SetDoctorFeeRequest,
  ): Promise<PriceList> {
    return this.priceLists.setDoctorFee(priceListId, practitionerId, request);
  }

  @Post(':priceListId/doctor-fees/:practitionerId/remove')
  @HttpCode(200)
  @Idempotent('billing.doctor_fee.remove')
  @RequirePermission('admin.price.publish')
  @ApiParam({ name: 'priceListId', format: 'uuid' })
  @ApiParam({ name: 'practitionerId', format: 'uuid' })
  @ApiEndpoint({
    summary: "Remove a doctor's fee from the draft",
    description: 'After publication, check-in for this doctor issues no doctor-fee invoice.',
    body: removeDoctorFeeRequestSchema,
    success: { status: 200, description: 'The draft', schema: priceListSchema },
    errors: DRAFT_ERRORS,
    csrf: true,
  })
  removeDoctorFee(
    @Param('priceListId', uuidPipe('Price list')) priceListId: string,
    @Param('practitionerId', uuidPipe('Practitioner')) practitionerId: string,
    @Body(new ZodBodyPipe(removeDoctorFeeRequestSchema)) request: RemoveDoctorFeeRequest,
  ): Promise<PriceList> {
    return this.priceLists.removeDoctorFee(priceListId, practitionerId, request.expectedVersion);
  }

  @Post(':priceListId/publish')
  @HttpCode(200)
  @Idempotent('billing.price_list.publish')
  @RequirePermission('admin.price.publish')
  @ApiParam({ name: 'priceListId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Publish the draft',
    description:
      'Now when no effectiveFrom is given, otherwise from that time, which must not have ' +
      'passed. Records priced earlier keep their version (AT-CFG-002); the publication is ' +
      'audited with its change counts.',
    body: publishPriceListRequestSchema,
    success: { status: 200, description: 'The published version', schema: priceListSchema },
    errors: DRAFT_ERRORS,
    csrf: true,
  })
  publish(
    @Param('priceListId', uuidPipe('Price list')) priceListId: string,
    @Body(new ZodBodyPipe(publishPriceListRequestSchema)) request: PublishPriceListRequest,
  ): Promise<PriceList> {
    return this.priceLists.publish(priceListId, request);
  }
}
