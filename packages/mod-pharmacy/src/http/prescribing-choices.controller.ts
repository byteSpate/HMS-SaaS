// /api/v1/prescribing (T-CLI-03; FR-CLI-004): what the doctor picks from while writing a
// prescription: active medicines found by brand or generic name, and the active routes,
// frequencies and durations. Needs clinical.prescription.create, so a doctor does not need the
// right to manage the catalogue.
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  medicineChoiceListSchema,
  medicineSearchQuerySchema,
  prescribingTermChoicesSchema,
  type MedicineChoiceList,
  type MedicineSearchQuery,
  type PrescribingTermChoices,
} from '@hms/contracts';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { MedicineCatalogueService } from '../application/medicine-catalogue.service.js';
import { PrescribingTermService } from '../application/prescribing-term.service.js';
import { READ_ERRORS } from './http-shared.js';

@ApiTags('clinical')
@ApiCookieAuth(SESSION_SECURITY)
@RequirePermission('clinical.prescription.create')
@Controller('prescribing')
export class PrescribingChoicesController {
  constructor(
    @Inject(MedicineCatalogueService) private readonly medicines: MedicineCatalogueService,
    @Inject(PrescribingTermService) private readonly terms: PrescribingTermService,
  ) {}

  @Get('medicines')
  @ApiEndpoint({
    summary: 'Find medicines to prescribe',
    description:
      'Active medicines whose brand or generic name contains `q` (any letter case), by brand; ' +
      'at most 20.',
    success: { status: 200, description: 'Matching medicines', schema: medicineChoiceListSchema },
    errors: [...READ_ERRORS, 'VALIDATION_FAILED'],
  })
  medicinesMatching(
    @Query(new ZodBodyPipe(medicineSearchQuerySchema)) query: MedicineSearchQuery,
  ): Promise<MedicineChoiceList> {
    return this.medicines.search(query.q);
  }

  @Get('terms')
  @ApiEndpoint({
    summary: 'The routes, frequencies and durations to prescribe with',
    success: {
      status: 200,
      description: 'Active terms of each kind',
      schema: prescribingTermChoicesSchema,
    },
    errors: READ_ERRORS,
  })
  termChoices(): Promise<PrescribingTermChoices> {
    return this.terms.choices();
  }
}
