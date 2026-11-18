// /api/v1/admin/prescribing-terms (T-CLI-03; Q-067 interim; FR-I18N-006; SP-03): the hospital
// administrator keeps its bilingual routes, frequencies and durations. Hospital configuration,
// so admin.config.publish, like the medicine catalogue.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  createPrescribingTermRequestSchema,
  prescribingTermListSchema,
  prescribingTermRecordSchema,
  updatePrescribingTermRequestSchema,
  type CreatePrescribingTermRequest,
  type PrescribingTermList,
  type PrescribingTermRecord,
  type UpdatePrescribingTermRequest,
} from '@hms/contracts';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { PrescribingTermService } from '../application/prescribing-term.service.js';
import { idPipe, READ_ERRORS, WRITE_ERRORS } from './http-shared.js';

@ApiTags('admin: medicines')
@ApiCookieAuth(SESSION_SECURITY)
@RequirePermission('admin.config.publish')
@Controller('admin/prescribing-terms')
export class PrescribingTermAdminController {
  constructor(@Inject(PrescribingTermService) private readonly terms: PrescribingTermService) {}

  @Get()
  @ApiEndpoint({
    summary: 'List the prescribing terms of this hospital',
    description: 'Routes, frequencies and durations, by kind and picker order; inactive included.',
    success: { status: 200, description: 'The terms', schema: prescribingTermListSchema },
    errors: READ_ERRORS,
  })
  list(): Promise<PrescribingTermList> {
    return this.terms.list();
  }

  @Post()
  @HttpCode(201)
  @ApiEndpoint({
    summary: 'Add a prescribing term',
    description: 'A kind (ROUTE, FREQUENCY or DURATION) and a label in Bangla or English.',
    body: createPrescribingTermRequestSchema,
    success: { status: 201, description: 'The new term', schema: prescribingTermRecordSchema },
    errors: WRITE_ERRORS,
    csrf: true,
  })
  create(
    @Body(new ZodBodyPipe(createPrescribingTermRequestSchema)) body: CreatePrescribingTermRequest,
  ): Promise<PrescribingTermRecord> {
    return this.terms.create(body);
  }

  @Put(':termId')
  @ApiParam({ name: 'termId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Edit or deactivate a prescribing term',
    description:
      'The whole record with the version the screen showed (SP-03); the kind never changes. ' +
      'Prescriptions already written keep the labels they were written with.',
    body: updatePrescribingTermRequestSchema,
    success: { status: 200, description: 'The new version', schema: prescribingTermRecordSchema },
    errors: [...WRITE_ERRORS, 'NOT_FOUND', 'STALE_RECORD'],
    csrf: true,
  })
  update(
    @Param('termId', idPipe('Prescribing term')) termId: string,
    @Body(new ZodBodyPipe(updatePrescribingTermRequestSchema)) body: UpdatePrescribingTermRequest,
  ): Promise<PrescribingTermRecord> {
    return this.terms.update(termId, body);
  }
}
