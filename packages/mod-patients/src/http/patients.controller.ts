// /api/v1/patients: register a patient and list the possible existing patients first (T-PAT-01;
// UC-PAT-01; FR-PAT-001, -002, -011). The candidate lookup is a POST, not a GET, so names and phone
// numbers stay out of URLs and request logs (FR-AUD-004, D section 10).
import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  duplicateCandidatesRequestSchema,
  duplicateCandidatesResponseSchema,
  registeredPatientSchema,
  registerPatientRequestSchema,
  type DuplicateCandidatesRequest,
  type DuplicateCandidatesResponse,
  type RegisteredPatient,
  type RegisterPatientRequest,
} from '@hms/contracts';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { PatientRegistrationService } from '../application/patient-registration.service.js';

const ACCESS_ERRORS = [
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'ENTITLEMENT_MISSING',
  'VALIDATION_FAILED',
] as const;

@ApiTags('patients')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('patients')
export class PatientsController {
  constructor(
    @Inject(PatientRegistrationService) private readonly registration: PatientRegistrationService,
  ) {}

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
