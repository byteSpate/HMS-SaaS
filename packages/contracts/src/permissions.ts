// Permission catalogue (C00 section 8) and the entitlement modules each code belongs to
// (FR-SAA-004, D section 7.2). T-ACC-02. Codes are PROPOSED; their separation is CONFIRMED (C-029).
// `report.view.<area>` codes are added with the reporting module, once the areas are known.
// `vendor.tenant.provision` belongs to the control plane, not the hospital API, so it is not here.
import { z } from 'zod';

/** Entitlement modules, one per mod-* package (D section 5). */
export const moduleCodes = [
  'core',
  'patients',
  'scheduling',
  'clinical',
  'billing',
  'lab',
  'ipd',
  'nursing',
  'pharmacy',
  'inventory',
  'reporting',
] as const;
export type ModuleCode = (typeof moduleCodes)[number];
export const moduleCodeSchema = z.enum(moduleCodes);

/**
 * Modules every hospital has: users, roles, configuration and audit cannot be switched off,
 * so they need no tenant_entitlement row.
 */
export const coreModules: ReadonlySet<ModuleCode> = new Set<ModuleCode>(['core']);

export const permissionCatalogue = {
  'patient.record.search': 'patients',
  'patient.record.register': 'patients',
  'patient.identity.edit': 'patients',
  'patient.identity.reconcile': 'patients',
  'patient.sensitive.view': 'patients',
  'practitioner.manage': 'patients',
  'scheduling.schedule.manage': 'scheduling',
  'scheduling.appointment.book': 'scheduling',
  'visit.checkin': 'clinical',
  'visit.create': 'clinical',
  'order.direct_diagnostic.create': 'clinical',
  'order.service.create': 'clinical',
  'order.service.cancel': 'clinical',
  // T-ORD-02 (FR-ORD-004, FR-BIL-003): a department starts a paid order. PROPOSED in C-100.
  'order.service.start': 'clinical',
  'clinical.consultation.record': 'clinical',
  'clinical.document.sign': 'clinical',
  'clinical.document.amend': 'clinical',
  'clinical.prescription.create': 'clinical',
  'billing.invoice.issue': 'billing',
  'billing.payment.record': 'billing',
  'billing.payment.method_correct': 'billing',
  'billing.discount.apply': 'billing',
  'billing.discount.approve': 'billing',
  'billing.refund.request': 'billing',
  'billing.refund.approve': 'billing',
  'billing.line.cancel': 'billing',
  'billing.eligibility.override': 'billing',
  'billing.cashier_session.manage': 'billing',
  'billing.cashier_session.review': 'billing',
  'lab.specimen.collect': 'lab',
  'lab.specimen.receive': 'lab',
  'lab.specimen.reject': 'lab',
  'lab.result.enter': 'lab',
  'lab.result.verify': 'lab',
  'lab.result.release': 'lab',
  'lab.result.amend': 'lab',
  'lab.config.manage': 'lab',
  'lab.report.deliver': 'lab',
  'ipd.admission.create': 'ipd',
  'ipd.bed.allocate': 'ipd',
  'ipd.bed.transfer': 'ipd',
  'ipd.bed.cleaning.complete': 'ipd',
  'ipd.discharge.medical': 'ipd',
  'ipd.discharge.financial_clear': 'ipd',
  'ipd.discharge.depart': 'ipd',
  'nursing.worklist.view': 'nursing',
  'nursing.indent.manage': 'nursing',
  'nursing.return.submit': 'nursing',
  'pharmacy.dispense': 'pharmacy',
  'pharmacy.return.accept': 'pharmacy',
  'inventory.stock.adjust.request': 'inventory',
  'inventory.stock.adjust.approve': 'inventory',
  'inventory.transfer.dispatch': 'inventory',
  'inventory.transfer.receive': 'inventory',
  'inventory.grn.receive': 'inventory',
  'report.export': 'reporting',
  'admin.user.manage': 'core',
  'admin.role.manage': 'core',
  'admin.config.publish': 'core',
  'admin.price.publish': 'core',
  'audit.view': 'core',
  'support.grant.approve': 'core',
} as const satisfies Record<string, ModuleCode>;

export type PermissionCode = keyof typeof permissionCatalogue;
export const permissionCodes = Object.keys(permissionCatalogue) as PermissionCode[];
export const permissionCodeSchema = z.enum(
  permissionCodes as [PermissionCode, ...PermissionCode[]],
);

export function moduleOf(code: PermissionCode): ModuleCode {
  return permissionCatalogue[code];
}

export function isPermissionCode(value: string): value is PermissionCode {
  return Object.hasOwn(permissionCatalogue, value);
}
