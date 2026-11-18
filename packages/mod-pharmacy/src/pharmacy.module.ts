// Nest module of the pharmacy (T-CLI-03: the medicine catalogue and prescribing lists; D section
// 5 and E section 2: mod-pharmacy owns medicine). Dispensing, returns and stock come with the
// pharmacy epic (Phase 4). Needs the database and request pipeline from the app, and the identity
// module's guards for its markers.
import { Module, type DynamicModule } from '@nestjs/common';
import { systemClock, type Clock } from '@hms/domain-kernel';
import { PHARMACY_CLOCK } from './application/context.js';
import { MedicineCatalogueService } from './application/medicine-catalogue.service.js';
import { PrescribingTermService } from './application/prescribing-term.service.js';
import { MedicineAdminController } from './http/medicine-admin.controller.js';
import { PrescribingChoicesController } from './http/prescribing-choices.controller.js';
import { PrescribingTermAdminController } from './http/prescribing-term-admin.controller.js';

export interface PharmacyModuleOptions {
  /** Tests pass a fixed clock. */
  clock?: Clock;
}

@Module({})
export class PharmacyModule {
  static forRoot(options: PharmacyModuleOptions = {}): DynamicModule {
    return {
      module: PharmacyModule,
      controllers: [
        MedicineAdminController,
        PrescribingTermAdminController,
        PrescribingChoicesController,
      ],
      providers: [
        MedicineCatalogueService,
        PrescribingTermService,
        { provide: PHARMACY_CLOCK, useValue: options.clock ?? systemClock },
      ],
    };
  }
}
