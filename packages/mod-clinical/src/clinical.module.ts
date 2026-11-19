// Nest module of the clinical record (T-VIS-01 check-in, T-CLI-01 doctor worklist, T-CLI-02
// consultation note, T-CLI-03 prescription, T-ORD-01 orders, T-VIS-02 diagnostic visits, T-ORD-03 order cancellation, T-ORD-02 department start and payment gate; D section 5: mod-clinical owns visit, consultation
// and clinical documents). Needs the database and request pipeline from the app, and the identity
// module's guards for its markers. Scheduling, billing, patients and the hospital's facility are
// reached through those modules' public entries only; the medicine catalogue through the
// pharmacy module's.
import { Module, type DynamicModule } from '@nestjs/common';
import { systemClock, type Clock } from '@hms/domain-kernel';
import { CLINICAL_CLOCK } from './application/context.js';
import { ConsultationNoteService } from './application/consultation-note.service.js';
import { DepartmentWorklistService } from './application/department-worklist.service.js';
import { DirectOrderService } from './application/direct-order.service.js';
import { OrderCancellationService } from './application/order-cancellation.service.js';
import { OrderStartService } from './application/order-start.service.js';
import { OrderService } from './application/order.service.js';
import { PrescriptionService } from './application/prescription.service.js';
import { VisitService } from './application/visit.service.js';
import { WorklistService } from './application/worklist.service.js';
import { ConsultationNotesController } from './http/consultation-notes.controller.js';
import { DepartmentOrdersController } from './http/department-orders.controller.js';
import { DirectOrdersController } from './http/direct-orders.controller.js';
import { OrdersController } from './http/orders.controller.js';
import { PrescriptionsController } from './http/prescriptions.controller.js';
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
      controllers: [
        VisitsController,
        WorklistController,
        ConsultationNotesController,
        PrescriptionsController,
        OrdersController,
        DirectOrdersController,
        DepartmentOrdersController,
      ],
      providers: [
        VisitService,
        ConsultationNoteService,
        PrescriptionService,
        OrderService,
        DirectOrderService,
        OrderCancellationService,
        OrderStartService,
        DepartmentWorklistService,
        WorklistService,
        { provide: CLINICAL_CLOCK, useValue: options.clock ?? systemClock },
      ],
    };
  }
}
