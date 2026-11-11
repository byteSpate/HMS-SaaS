// Nest module of scheduling (T-SCH-01 schedule sessions, T-SCH-02 appointments; D section 5:
// mod-scheduling owns schedule_session and appointment). Needs the database and request pipeline
// from the app, and the identity module's guards for its markers. Practitioners and patients are
// read through @hms/mod-patients' public entry only.
import { Module, type DynamicModule } from '@nestjs/common';
import { systemClock, type Clock } from '@hms/domain-kernel';
import { AppointmentService } from './application/appointment.service.js';
import { SCHEDULING_CLOCK } from './application/context.js';
import { ScheduleSessionService } from './application/schedule-session.service.js';
import { AppointmentsController } from './http/appointments.controller.js';
import { ScheduleSessionsController } from './http/schedule-sessions.controller.js';

export interface SchedulingModuleOptions {
  /** Tests pass a fixed clock, so "has this session ended" is known. */
  clock?: Clock;
}

@Module({})
export class SchedulingModule {
  static forRoot(options: SchedulingModuleOptions = {}): DynamicModule {
    return {
      module: SchedulingModule,
      controllers: [ScheduleSessionsController, AppointmentsController],
      providers: [
        ScheduleSessionService,
        AppointmentService,
        { provide: SCHEDULING_CLOCK, useValue: options.clock ?? systemClock },
      ],
    };
  }
}
