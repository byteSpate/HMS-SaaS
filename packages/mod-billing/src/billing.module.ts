// Nest module of billing (T-BIL-01 price lists with doctor fees; D section 5: mod-billing owns
// service_item, price_list_version and price_list_item). Needs the database and request pipeline
// from the app, and the identity module's guards for its markers. Practitioners are read through
// @hms/mod-patients' public entry only.
import { Module, type DynamicModule } from '@nestjs/common';
import { systemClock, type Clock } from '@hms/domain-kernel';
import { BILLING_CLOCK } from './application/context.js';
import { PriceListService } from './application/price-list.service.js';
import { PriceListsController } from './http/price-lists.controller.js';

export interface BillingModuleOptions {
  /** Tests pass a fixed clock, so effective times are known. */
  clock?: Clock;
}

@Module({})
export class BillingModule {
  static forRoot(options: BillingModuleOptions = {}): DynamicModule {
    return {
      module: BillingModule,
      controllers: [PriceListsController],
      providers: [
        PriceListService,
        { provide: BILLING_CLOCK, useValue: options.clock ?? systemClock },
      ],
    };
  }
}
