// Nest module of the patient registry (T-PAT-01; D section 5: mod-patients). Needs the database and
// the request pipeline from the app, and the identity module's guards for its permission markers.
import { Module, type DynamicModule } from '@nestjs/common';
import { systemClock, type Clock } from '@hms/domain-kernel';
import {
  PATIENTS_CLOCK,
  PatientRegistrationService,
} from './application/patient-registration.service.js';
import { PatientsController } from './http/patients.controller.js';

export interface PatientsModuleOptions {
  /** Tests pass a fixed clock, so "today" for a reported age is known. */
  clock?: Clock;
}

@Module({})
export class PatientsModule {
  static forRoot(options: PatientsModuleOptions = {}): DynamicModule {
    return {
      module: PatientsModule,
      controllers: [PatientsController],
      providers: [
        PatientRegistrationService,
        { provide: PATIENTS_CLOCK, useValue: options.clock ?? systemClock },
      ],
    };
  }
}
