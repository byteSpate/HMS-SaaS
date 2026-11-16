// Nest module of the clinical record (T-VIS-01 check-in, T-CLI-01 doctor worklist, T-CLI-02
// consultation note; D section 5: mod-clinical owns visit, consultation and clinical documents).
// Needs the database and request pipeline from the app, and the identity module's guards for its
// markers. Scheduling, billing, patients and the hospital's facility are reached through those
// modules' public entries only.
import { Module, type DynamicModule } from '@nestjs/common';
import { systemClock, type Clock } from '@hms/domain-kernel';
import { CLINICAL_CLOCK } from './application/context.js';
import { ConsultationNoteService } from './application/consultation-note.service.js';
import { VisitService } from './application/visit.service.js';
import { WorklistService } from './application/worklist.service.js';
import { ConsultationNotesController } from './http/consultation-notes.controller.js';
import { VisitsController } from './http/visits.controller.js';
import { WorklistController } from './http/worklist.controller.js';

export interface ClinicalModuleOptions {
  /** Tests pass a fixed clock, so "the session date" is known. */
  clock?: Clock;
}

@Module({})
export class ClinicalModule {
  static forRoot(options: ClinicalModuleOptions = {}): DynamicModule {
    return {
      module: ClinicalModule,
      controllers: [VisitsController, WorklistController, ConsultationNotesController],
      providers: [
        VisitService,
        ConsultationNoteService,
        WorklistService,
        { provide: CLINICAL_CLOCK, useValue: options.clock ?? systemClock },
      ],
    };
  }
}
