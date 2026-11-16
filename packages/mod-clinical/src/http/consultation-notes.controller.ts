// /api/v1/consultations/{consultationId}/note (T-CLI-02; FR-CLI-003, FR-CLI-007; UC-CLI-01 steps 2
// and 5; UC-CLI-02; C00 section 8): the consultation's doctor reads the note, autosaves the draft
// and discards it (clinical.consultation.record), signs it (clinical.document.sign) and amends a
// signed note with a reason (clinical.document.amend). Every command carries the note's version
// (SP-03) and an Idempotency-Key (SP-01).
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
  amendNoteRequestSchema,
  consultationNoteSchema,
  noteVersionRequestSchema,
  saveNoteDraftRequestSchema,
  type AmendNoteRequest,
  type ConsultationNote,
  type NoteVersionRequest,
  type SaveNoteDraftRequest,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { ConsultationNoteService } from '../application/consultation-note.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;
const COMMAND_ERRORS = [
  ...ACCESS_ERRORS,
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'INVALID_TRANSITION',
  'STALE_RECORD',
  'IDEMPOTENCY_KEY_REUSED',
] as const;
const NOTE = { status: 200, description: 'The note', schema: consultationNoteSchema } as const;

/** A malformed ID is NOT_FOUND, like another doctor's consultation. */
const consultationIdPipe = () =>
  new ParseUUIDPipe({
    exceptionFactory: () => new DomainError('NOT_FOUND', 'Consultation not found'),
  });

@ApiTags('clinical')
@ApiCookieAuth(SESSION_SECURITY)
@ApiParam({ name: 'consultationId', format: 'uuid' })
@Controller('consultations/:consultationId/note')
export class ConsultationNotesController {
  constructor(@Inject(ConsultationNoteService) private readonly notes: ConsultationNoteService) {}

  @Get()
  @RequirePermission('clinical.consultation.record')
  @ApiEndpoint({
    summary: 'Read the consultation note',
    description:
      'The draft (seen only by the consultation doctor) and the signed versions, newest first. ' +
      'status is NONE before anything is written.',
    success: NOTE,
    errors: [...ACCESS_ERRORS, 'NOT_FOUND'],
  })
  read(
    @Param('consultationId', consultationIdPipe()) consultationId: string,
  ): Promise<ConsultationNote> {
    return this.notes.read(consultationId);
  }

  @Put('draft')
  @Idempotent('clinical.note.draft')
  @RequirePermission('clinical.consultation.record')
  @ApiEndpoint({
    summary: 'Save the draft (autosave)',
    description:
      'Replaces the draft with the sections and allergies sent, at the note version the screen ' +
      'holds (0 for a new note). A signed note is INVALID_TRANSITION: amend it first (AT-CLI-005).',
    body: saveNoteDraftRequestSchema,
    success: NOTE,
    errors: COMMAND_ERRORS,
    csrf: true,
  })
  saveDraft(
    @Param('consultationId', consultationIdPipe()) consultationId: string,
    @Body(new ZodBodyPipe(saveNoteDraftRequestSchema)) request: SaveNoteDraftRequest,
  ): Promise<ConsultationNote> {
    return this.notes.saveDraft(consultationId, request);
  }

  @Post('sign')
  @HttpCode(200)
  @Idempotent('clinical.note.sign')
  @RequirePermission('clinical.document.sign')
  @ApiEndpoint({
    summary: 'Sign the draft',
    description:
      'The draft becomes the next signed version (v1, or the amendment linked to the version it ' +
      'amends) and the consultation is CONSULTED. At least one section must be written.',
    body: noteVersionRequestSchema,
    success: NOTE,
    errors: COMMAND_ERRORS,
    csrf: true,
  })
  sign(
    @Param('consultationId', consultationIdPipe()) consultationId: string,
    @Body(new ZodBodyPipe(noteVersionRequestSchema)) request: NoteVersionRequest,
  ): Promise<ConsultationNote> {
    return this.notes.sign(consultationId, request);
  }

  @Post('amend')
  @HttpCode(200)
  @Idempotent('clinical.note.amend')
  @RequirePermission('clinical.document.amend')
  @ApiEndpoint({
    summary: 'Start an amendment of the signed note',
    description:
      'A new draft from the latest signed version, with the mandatory reason (UC-CLI-02). ' +
      'Signing it makes the next version; earlier versions stay readable.',
    body: amendNoteRequestSchema,
    success: NOTE,
    errors: COMMAND_ERRORS,
    csrf: true,
  })
  amend(
    @Param('consultationId', consultationIdPipe()) consultationId: string,
    @Body(new ZodBodyPipe(amendNoteRequestSchema)) request: AmendNoteRequest,
  ): Promise<ConsultationNote> {
    return this.notes.amend(consultationId, request);
  }

  @Post('discard')
  @HttpCode(200)
  @Idempotent('clinical.note.discard')
  @RequirePermission('clinical.consultation.record')
  @ApiEndpoint({
    summary: 'Discard the unsigned draft',
    description:
      'FR-CLI-003: unsigned drafts can be discarded. Discarding an amendment leaves the signed ' +
      'note as it was; signed versions are never deleted.',
    body: noteVersionRequestSchema,
    success: NOTE,
    errors: COMMAND_ERRORS,
    csrf: true,
  })
  discard(
    @Param('consultationId', consultationIdPipe()) consultationId: string,
    @Body(new ZodBodyPipe(noteVersionRequestSchema)) request: NoteVersionRequest,
  ): Promise<ConsultationNote> {
    return this.notes.discard(consultationId, request);
  }
}
