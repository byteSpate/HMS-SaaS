// Nest module of billing (T-BIL-01 price lists with doctor fees, T-BIL-02 charges and invoices,
// T-BIL-03 cashier sessions, T-BIL-04 payments and receipts; D section 5: mod-billing owns
// service_item, price_list_version, price_list_item, charge, invoice, invoice_line,
// cashier_session, cashier_session_count, payment, payment_allocation and receipt_print).
// Needs the database and request pipeline
// from the app, and the identity module's guards for its markers. Practitioners are read through
// @hms/mod-patients' public entry only.
import { Module, type DynamicModule } from '@nestjs/common';
import { systemClock, type Clock } from '@hms/domain-kernel';
import { CashierSessionService } from './application/cashier-session.service.js';
import { BILLING_CLOCK } from './application/context.js';
import { InvoiceService } from './application/invoice.service.js';
import { PaymentService } from './application/payment.service.js';
import { PriceListService } from './application/price-list.service.js';
import { CashierSessionsController } from './http/cashier-sessions.controller.js';
import { InvoicesController } from './http/invoices.controller.js';
import { PaymentsController } from './http/payments.controller.js';
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
      controllers: [
        PriceListsController,
        InvoicesController,
        CashierSessionsController,
        PaymentsController,
      ],
      providers: [
        PriceListService,
        InvoiceService,
        CashierSessionService,
        PaymentService,
        { provide: BILLING_CLOCK, useValue: options.clock ?? systemClock },
      ],
    };
  }
}
