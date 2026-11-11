// Public entry of the scheduling module (D section 5 rule 3): other packages and apps import only
// from here.
export { checkInAppointment, type CheckedInAppointment } from './application/check-in.js';
export { SchedulingModule, type SchedulingModuleOptions } from './scheduling.module.js';
