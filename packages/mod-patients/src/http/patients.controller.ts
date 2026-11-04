// /api/v1/patients (UC-PAT-01, UC-PAT-02): search (T-PAT-02), register after listing the possible
// existing patients (T-PAT-01; FR-PAT-001..003, -011), reveal a full NID (T-PAT-03; FR-PAT-007,
// FR-AUD-003), and read or correct the identity of a patient (T-PAT-04; FR-PAT-008). Search and the
// candidate lookup are POSTs, not GETs, so names and phone numbers stay out of URLs and request logs
// (FR-AUD-004, D section 10).
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  duplicateCandidatesRequestSchema,
  duplicateCandidatesResponseSchema,
  patientDetailSchema,
  patientSearchRequestSchema,
  patientVersionSchema,
  patientSearchResponseSchema,
  registeredPatientSchema,
  registerPatientRequestSchema,
  revealedNidSchema,
  updatePatientIdentityRequestSchema,
  type DuplicateCandidatesRequest,
  type DuplicateCandidatesResponse,
  type PatientDetail,
  type PatientSearchRequest,
  type PatientSearchResponse,
  type RegisteredPatient,
  type RegisterPatientRequest,
  type PatientVersion,
  type RevealedNid,
  type UpdatePatientIdentityRequest,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { NidRevealService } from '../application/nid-reveal.service.js';
import { PatientIdentityService } from '../application/patient-identity.service.js';
import { PatientRegistrationService } from '../application/patient-registration.service.js';
import { PatientSearchService } from '../application/patient-search.service.js';

const ACCESS_ERRORS = [
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'ENTITLEMENT_MISSING',
  'VALIDATION_FAILED',
] as const;

/** A malformed ID is NOT_FOUND, like a patient of another hospital. */
const patientIdPipe = () =>
  new ParseUUIDPipe({
    exceptionFactory: () => new DomainError('NOT_FOUND', 'Patient not found'),
  });

@ApiTags('patients')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('patients')
export class PatientsController {
  constructor(
    @Inject(PatientRegistrationService) private readonly registration: PatientRegistrationService,
    @Inject(PatientSearchService) private readonly finder: PatientSearchService,
    @Inject(NidRevealService) private readonly nids: NidRevealService,
    @Inject(PatientIdentityService) private readonly identity: PatientIdentityService,
  ) {}

  @Get(':patientId')
  @RequirePermission('patient.record.search')
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Get a patient with the current version',
    description:
      'The banner fields with the full birth facts and address, and the version to send with a ' +
      'correction (SP-03). The NID stays masked.',
    success: { status: 200, description: 'The patient', schema: patientDetailSchema },
    errors: ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING', 'NOT_FOUND'],
  })
  detail(@Param('patientId', patientIdPipe()) patientId: string): Promise<PatientDetail> {
    return this.identity.detail(patientId);
  }

  @Post(':patientId/identity')
  @HttpCode(200)
  @Idempotent('patient.identity.correct')
  @RequirePermission('patient.identity.edit')
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Correct the identity details of a patient',
    description:
      'Only the fields in `changes` change; the MRN and patient ID never do. Needs a reason and ' +
      'the version the screen showed: another version is STALE_RECORD (SP-03). The previous ' +
      'values go to the identity history. Needs an Idempotency-Key.',
    body: updatePatientIdentityRequestSchema,
    success: { status: 200, description: 'The new version', schema: patientVersionSchema },
    errors: [...ACCESS_ERRORS, 'NOT_FOUND', 'STALE_RECORD', 'IDEMPOTENCY_KEY_REUSED'],
    csrf: true,
  })
  correct(
    @Param('patientId', patientIdPipe()) patientId: string,
    @Body(new ZodBodyPipe(updatePatientIdentityRequestSchema))
    request: UpdatePatientIdentityRequest,
  ): Promise<PatientVersion> {
    return this.identity.correct(patientId, request);
  }

  @Post(':patientId/nid/reveal')
  @HttpCode(200)
  @RequirePermission('patient.sensitive.view')
  // The full number must not stay in a browser or proxy cache.
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Show the full NID of a patient',
    description:
      'Lists show only the last four digits (FR-PAT-007). This returns the full number and ' +
      'writes the audit event patient.nid.revealed (FR-AUD-003). NOT_FOUND when no NID is ' +
      'recorded, or the patient is not in this hospital.',
    success: { status: 200, description: 'The NID', schema: revealedNidSchema },
    errors: ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING', 'NOT_FOUND'],
    csrf: true,
  })
  revealNid(@Param('patientId', patientIdPipe()) patientId: string): Promise<RevealedNid> {
    return this.nids.reveal(patientId);
  }

  @Post('search')
  @HttpCode(200)
  @RequirePermission('patient.record.search')
  @ApiEndpoint({
    summary: 'Search patients by MRN, phone number or name',
    description:
      'One term: an MRN (any case), a mobile number in any spelling (FR-PAT-003), the number ' +
      'part of an MRN, or a name in Bangla or English (similar spellings match). Up to 20 rows ' +
      'with the banner fields, closest first. Saves nothing.',
    body: patientSearchRequestSchema,
    success: { status: 200, description: 'The matches', schema: patientSearchResponseSchema },
    errors: ACCESS_ERRORS,
    csrf: true,
  })
  search(
    @Body(new ZodBodyPipe(patientSearchRequestSchema)) request: PatientSearchRequest,
  ): Promise<PatientSearchResponse> {
    return this.finder.search(request);
  }

  @Post('duplicate-candidates')
  @HttpCode(200)
  @RequirePermission('patient.record.register')
  @ApiEndpoint({
    summary: 'Find possible existing patients before registering',
    description:
      'Same normalized phone, or a similar name with the same sex and a birth year within 2 ' +
      'years (FR-PAT-011). Up to 20 rows, each with the reasons it matched. Saves nothing.',
    body: duplicateCandidatesRequestSchema,
    success: {
      status: 200,
      description: 'The candidates',
      schema: duplicateCandidatesResponseSchema,
    },
    errors: ACCESS_ERRORS,
    csrf: true,
  })
  async candidates(
    @Body(new ZodBodyPipe(duplicateCandidatesRequestSchema)) request: DuplicateCandidatesRequest,
  ): Promise<DuplicateCandidatesResponse> {
    return { candidates: await this.registration.findCandidates(request) };
  }

  @Post()
  @HttpCode(201)
  @Idempotent('patient.register')
  @RequirePermission('patient.record.register')
  @ApiEndpoint({
    summary: 'Register a new patient',
    description:
      'The server assigns the MRN. If possible existing patients match, the request must set ' +
      '`confirmNewDespiteCandidates` and list every one in `shownCandidateIds`; otherwise it ' +
      'answers VALIDATION_FAILED with reason DUPLICATE_CANDIDATES_PRESENT and `candidateIds`. ' +
      'Needs an Idempotency-Key: a retry returns the same patient.',
    body: registerPatientRequestSchema,
    success: { status: 201, description: 'The new patient', schema: registeredPatientSchema },
    errors: [...ACCESS_ERRORS, 'IDEMPOTENCY_KEY_REUSED'],
    csrf: true,
  })
  register(
    @Body(new ZodBodyPipe(registerPatientRequestSchema)) request: RegisterPatientRequest,
  ): Promise<RegisteredPatient> {
    return this.registration.register(request);
  }
}
