// /api/v1/admin/medicines (T-CLI-03; FR-CLI-004, FR-PHA-011 subset; SP-03): the hospital
// administrator lists, adds and edits the medicine catalogue. The catalogue is hospital
// configuration, so the routes need admin.config.publish (ADM template), like departments; the
// doctor's picker has its own read route (medicine-choices.controller.ts).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  createMedicineRequestSchema,
  medicineListSchema,
  medicineRecordSchema,
  updateMedicineRequestSchema,
  type CreateMedicineRequest,
  type MedicineList,
  type MedicineRecord,
  type UpdateMedicineRequest,
} from '@hms/contracts';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { MedicineCatalogueService } from '../application/medicine-catalogue.service.js';
import { idPipe, READ_ERRORS, WRITE_ERRORS } from './http-shared.js';

@ApiTags('admin: medicines')
@ApiCookieAuth(SESSION_SECURITY)
@RequirePermission('admin.config.publish')
@Controller('admin/medicines')
export class MedicineAdminController {
  constructor(
    @Inject(MedicineCatalogueService) private readonly medicines: MedicineCatalogueService,
  ) {}

  @Get()
  @ApiEndpoint({
    summary: 'List the medicine catalogue of this hospital',
    description: 'Active ones first, then by brand. Inactive medicines are included.',
    success: { status: 200, description: 'The medicines', schema: medicineListSchema },
    errors: READ_ERRORS,
  })
  list(): Promise<MedicineList> {
    return this.medicines.list();
  }

  @Get(':medicineId')
  @ApiParam({ name: 'medicineId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Get a medicine with the current version',
    success: { status: 200, description: 'The medicine', schema: medicineRecordSchema },
    errors: [...READ_ERRORS, 'NOT_FOUND'],
  })
  detail(@Param('medicineId', idPipe('Medicine')) medicineId: string): Promise<MedicineRecord> {
    return this.medicines.detail(medicineId);
  }

  @Post()
  @HttpCode(201)
  @ApiEndpoint({
    summary: 'Add a medicine',
    description:
      'Brand, generic name, form and an optional strength. The same brand, strength and form ' +
      'twice in a hospital (any letter case) is VALIDATION_FAILED on `brandName`.',
    body: createMedicineRequestSchema,
    success: { status: 201, description: 'The new medicine', schema: medicineRecordSchema },
    errors: WRITE_ERRORS,
    csrf: true,
  })
  create(
    @Body(new ZodBodyPipe(createMedicineRequestSchema)) body: CreateMedicineRequest,
  ): Promise<MedicineRecord> {
    return this.medicines.create(body);
  }

  @Put(':medicineId')
  @ApiParam({ name: 'medicineId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Edit or deactivate a medicine',
    description:
      'Send the whole record with the version the screen showed; an optional text left out is ' +
      'cleared. Another version is STALE_RECORD (SP-03). `active: false` hides the medicine ' +
      "from the doctor's picker; signed prescriptions keep it as written.",
    body: updateMedicineRequestSchema,
    success: { status: 200, description: 'The new version', schema: medicineRecordSchema },
    errors: [...WRITE_ERRORS, 'NOT_FOUND', 'STALE_RECORD'],
    csrf: true,
  })
  update(
    @Param('medicineId', idPipe('Medicine')) medicineId: string,
    @Body(new ZodBodyPipe(updateMedicineRequestSchema)) body: UpdateMedicineRequest,
  ): Promise<MedicineRecord> {
    return this.medicines.update(medicineId, body);
  }
}
