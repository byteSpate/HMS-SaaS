// /api/v1/consultations/{consultationId}/prescription (T-CLI-03; FR-CLI-001, FR-CLI-004..006;
// UC-CLI-01 steps 4 and 5; UC-CLI-02; C00 section 8): the consultation's doctor reads the
// prescription, autosaves, signs and discards the draft (clinical.prescription.create, "create and
// sign prescription"), and amends a signed one with a reason (also clinical.document.amend).
// Every command carries the prescription's version (SP-03) and an Idempotency-Key (SP-01); a
// print renders the latest signed version (FR-CLI-005).
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
  amendPrescriptionRequestSchema,
  prescriptionPrintSchema,
  prescriptionSchema,
  printPrescriptionRequestSchema,
  prescriptionVersionRequestSchema,
  savePrescriptionDraftRequestSchema,
  type AmendPrescriptionRequest,
  type Prescription,
  type PrescriptionPrint,
  type PrescriptionVersionRequest,
  type PrintPrescriptionRequest,
  type SavePrescriptionDraftRequest,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { PrescriptionService } from '../application/prescription.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;
const COMMAND_ERRORS = [
  ...ACCESS_ERRORS,
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'INVALID_TRANSITION',
  'STALE_RECORD',
  'IDEMPOTENCY_KEY_REUSED',
] as const;
const PRESCRIPTION = {
  status: 200,
  description: 'The prescription',
  schema: prescriptionSchema,
} as const;

/** A malformed ID is NOT_FOUND, like another doctor's consultation. */
const consultationIdPipe = () =>
  new ParseUUIDPipe({
    exceptionFactory: () => new DomainError('NOT_FOUND', 'Consultation not found'),
  });

@ApiTags('clinical')
@ApiCookieAuth(SESSION_SECURITY)
@ApiParam({ name: 'consultationId', format: 'uuid' })
@RequirePermission('clinical.prescription.create')
@Controller('consultations/:consultationId/prescription')
export class PrescriptionsController {
  constructor(@Inject(PrescriptionService) private readonly prescriptions: PrescriptionService) {}

  @Get()
  @ApiEndpoint({
    summary: 'Read the prescription',
    description:
      'The draft (seen only by the consultation doctor) and the signed versions, newest first. ' +
      'status is NONE before anything is written.',
    success: PRESCRIPTION,
    errors: [...ACCESS_ERRORS, 'NOT_FOUND'],
  })
  read(
    @Param('consultationId', consultationIdPipe()) consultationId: string,
  ): Promise<Prescription> {
    return this.prescriptions.read(consultationId);
  }

  @Put('draft')
  @Idempotent('clinical.prescription.draft')
  @ApiEndpoint({
    summary: 'Save the draft (autosave)',
    description:
      'Replaces the lines with those sent, at the version the screen holds (0 for a new ' +
      'prescription). Each line keeps the medicine and labels as they are now; an inactive ' +
      'medicine or list entry is VALIDATION_FAILED on that line. A signed prescription is ' +
      'INVALID_TRANSITION: amend it first.',
    body: savePrescriptionDraftRequestSchema,
    success: PRESCRIPTION,
    errors: COMMAND_ERRORS,
    csrf: true,
  })
  saveDraft(
    @Param('consultationId', consultationIdPipe()) consultationId: string,
    @Body(new ZodBodyPipe(savePrescriptionDraftRequestSchema))
    request: SavePrescriptionDraftRequest,
  ): Promise<Prescription> {
    return this.prescriptions.saveDraft(consultationId, request);
  }

  @Post('sign')
  @HttpCode(200)
  @Idempotent('clinical.prescription.sign')
  @ApiEndpoint({
    summary: 'Sign the draft',
    description:
      'The draft becomes the next signed version (v1, or the amendment linked to the version ' +
      'it amends). At least one line, each with a frequency or instructions, and every medicine ' +
      'still active. Signing moves no stock and creates no charge (FR-CLI-001).',
    body: prescriptionVersionRequestSchema,
    success: PRESCRIPTION,
    errors: COMMAND_ERRORS,
    csrf: true,
  })
  sign(
    @Param('consultationId', consultationIdPipe()) consultationId: string,
    @Body(new ZodBodyPipe(prescriptionVersionRequestSchema)) request: PrescriptionVersionRequest,
  ): Promise<Prescription> {
    return this.prescriptions.sign(consultationId, request);
  }

  @Post('amend')
  @HttpCode(200)
  @Idempotent('clinical.prescription.amend')
  @RequirePermission('clinical.document.amend')
  @ApiEndpoint({
    summary: 'Start an amendment of the signed prescription',
    description:
      'A new draft from the latest signed version, with the mandatory reason (UC-CLI-02). ' +
      'Signing it makes the next version; earlier versions stay readable.',
    body: amendPrescriptionRequestSchema,
    success: PRESCRIPTION,
    errors: COMMAND_ERRORS,
    csrf: true,
  })
  amend(
    @Param('consultationId', consultationIdPipe()) consultationId: string,
    @Body(new ZodBodyPipe(amendPrescriptionRequestSchema)) request: AmendPrescriptionRequest,
  ): Promise<Prescription> {
    return this.prescriptions.amend(consultationId, request);
  }

  @Post('discard')
  @HttpCode(200)
  @Idempotent('clinical.prescription.discard')
  @ApiEndpoint({
    summary: 'Discard the unsigned draft',
    description:
      'An unsigned draft can be discarded. Discarding an amendment leaves the signed ' +
      'prescription as it was; signed versions are never deleted.',
    body: prescriptionVersionRequestSchema,
    success: PRESCRIPTION,
    errors: COMMAND_ERRORS,
    csrf: true,
  })
  discard(
    @Param('consultationId', consultationIdPipe()) consultationId: string,
    @Body(new ZodBodyPipe(prescriptionVersionRequestSchema)) request: PrescriptionVersionRequest,
  ): Promise<Prescription> {
    return this.prescriptions.discard(consultationId, request);
  }

  @Post('prints')
  @HttpCode(201)
  @Idempotent('clinical.prescription.print')
  @ApiEndpoint({
    summary: 'Print the prescription',
    description:
      'The latest signed version as a printable A4 page in the chosen language, with the ' +
      "doctor's header, allergies and advice from the signed note, and the next booked visit. " +
      'Printing is audited and changes nothing. Before the first signature: INVALID_TRANSITION.',
    body: printPrescriptionRequestSchema,
    success: { status: 201, description: 'The printable page', schema: prescriptionPrintSchema },
    errors: [
      ...ACCESS_ERRORS,
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'INVALID_TRANSITION',
      'IDEMPOTENCY_KEY_REUSED',
    ],
    csrf: true,
  })
  print(
    @Param('consultationId', consultationIdPipe()) consultationId: string,
    @Body(new ZodBodyPipe(printPrescriptionRequestSchema)) request: PrintPrescriptionRequest,
  ): Promise<PrescriptionPrint> {
    return this.prescriptions.print(consultationId, request);
  }
}
