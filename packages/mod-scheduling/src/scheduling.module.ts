// Nest module of scheduling (T-SCH-01 schedule sessions; D section 5: mod-scheduling owns
// schedule_session and, from T-SCH-02, appointment). Needs the database and request pipeline from
// the app, and the identity module's guards for its markers. Practitioners are read through
// @hms/mod-patients' public entry only.
import { Module, type DynamicModule } from '@nestjs/common';
import { systemClock, type Clock } from '@hms/domain-kernel';
import { SCHEDULING_CLOCK } from './application/context.js';
import { ScheduleSessionService } from './application/schedule-session.service.js';
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
      controllers: [ScheduleSessionsController],
      providers: [
        ScheduleSessionService,
        { provide: SCHEDULING_CLOCK, useValue: options.clock ?? systemClock },
      ],
    };
  }
}
