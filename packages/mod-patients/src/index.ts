// Public entry of the patients module (D section 5 rule 3): other packages and apps import only
// from here.
export {
  isSchedulablePractitioner,
  listPractitionerChoices,
} from './infrastructure/practitioner.repository.js';
export { PatientsModule, type PatientsModuleOptions } from './patients.module.js';
