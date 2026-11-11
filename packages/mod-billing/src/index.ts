// Public entry of the billing module (D section 5 rule 3): other packages and apps import only
// from here.
export { BillingModule, type BillingModuleOptions } from './billing.module.js';
export { invoiceSummaryOf } from './application/invoice.service.js';
export {
  postCharge,
  type PostChargeRequest,
  type PostedCharge,
  type SourceReference,
} from './application/post-charge.js';
export { issueDoctorFee, type DoctorFeeRequest } from './application/doctor-fee.js';
