// Nest module of the clinical record (T-VIS-01 check-in; D section 5: mod-clinical owns visit).
// Needs the database and request pipeline from the app, and the identity module's guards for its
// markers. Scheduling, billing, patients and the hospital's facility are reached through those
// modules' public entries only.
import { Module, type DynamicModule } from '@nestjs/common';
import { systemClock, type Clock } from '@hms/domain-kernel';
import { CLINICAL_CLOCK } from './application/context.js';
import { VisitService } from './application/visit.service.js';
import { VisitsController } from './http/visits.controller.js';

export interface ClinicalModuleOptions {
  /** Tests pass a fixed clock, so "the session date" is known. */
  clock?: Clock;
}

@Module({})
export class ClinicalModule {
  static forRoot(options: ClinicalModuleOptions = {}): DynamicModule {
    return {
      module: ClinicalModule,
      controllers: [VisitsController],
      providers: [
        VisitService,
        { provide: CLINICAL_CLOCK, useValue: options.clock ?? systemClock },
      ],
    };
  }
}
