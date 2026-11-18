// Public entry of the pharmacy module (D section 5 rule 3): other packages and apps import only
// from here. The clinical module reads the catalogue through the two lookups when it keeps a
// prescription line (T-CLI-03).
export { findActiveMedicineChoices } from './infrastructure/medicine.repository.js';
export { findActiveTermChoices } from './infrastructure/prescribing-term.repository.js';
export { PharmacyModule, type PharmacyModuleOptions } from './pharmacy.module.js';
