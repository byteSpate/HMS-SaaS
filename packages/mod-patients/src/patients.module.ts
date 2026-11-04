// Nest module of the patient registry (T-PAT-01..04; D section 5: mod-patients). Needs the
// database and request pipeline from the app, and the identity module's guards for its markers.
import { Module, type DynamicModule } from '@nestjs/common';
import { systemClock, type Clock } from '@hms/domain-kernel';
import { PATIENTS_CLOCK } from './application/context.js';
import { NidRevealService } from './application/nid-reveal.service.js';
import { PatientIdentityService } from './application/patient-identity.service.js';
import { PatientRegistrationService } from './application/patient-registration.service.js';
import { PatientSearchService } from './application/patient-search.service.js';
import { PatientsController } from './http/patients.controller.js';
import { NID_MASTER_KEY, NidVault } from './infrastructure/nid-vault.js';

export interface PatientsModuleOptions {
  /** 32 bytes from NID_ENCRYPTION_KEY (T-PAT-03). Required: NIDs are never stored in the clear. */
  nidKey: Buffer;
  /** Tests pass a fixed clock, so "today" for a reported age is known. */
  clock?: Clock;
}

@Module({})
export class PatientsModule {
  static forRoot(options: PatientsModuleOptions): DynamicModule {
    return {
      module: PatientsModule,
      controllers: [PatientsController],
      providers: [
        PatientRegistrationService,
        PatientSearchService,
        NidRevealService,
        PatientIdentityService,
        NidVault,
        { provide: NID_MASTER_KEY, useValue: options.nidKey },
        { provide: PATIENTS_CLOCK, useValue: options.clock ?? systemClock },
      ],
    };
  }
}
