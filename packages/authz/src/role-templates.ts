// Default role templates for the first release (C-045, C01 section 5, C00 section 8 "Default
// template" column). T-ACC-02, FR-ACC-008. A hospital's roles start as copies of these and each
// hospital signs off its production grants (Q-003). Only the nine templates of C-045 are here.
import type { PermissionCode } from '@hms/contracts';

export const roleTemplateCodes = [
  'RCP',
  'CSH',
  'BSV',
  'DOC',
  'LBT',
  'LBA',
  'FIN',
  'ADM',
  'MGT',
] as const;
export type RoleTemplateCode = (typeof roleTemplateCodes)[number];

export interface RoleTemplate {
  code: RoleTemplateCode;
  nameEn: string;
  permissions: readonly PermissionCode[];
}

const cashier: readonly PermissionCode[] = [
  'patient.record.search',
  // C-042: the cashier both issues invoices and records payments; the codes stay separate.
  'billing.invoice.issue',
  'billing.payment.record',
  'billing.cashier_session.manage',
  'billing.refund.request',
  'ipd.discharge.financial_clear',
];

const labTechnologist: readonly PermissionCode[] = [
  'patient.record.search',
  // C-100: the lab starts paid orders from the department worklist until T-LAB-02 collects them.
  'order.service.start',
  'lab.specimen.collect',
  'lab.specimen.receive',
  'lab.specimen.reject',
  'lab.result.enter',
  'lab.report.deliver',
];

export const roleTemplates: Readonly<Record<RoleTemplateCode, RoleTemplate>> = {
  RCP: {
    code: 'RCP',
    nameEn: 'Receptionist',
    permissions: [
      'patient.record.search',
      'patient.record.register',
      'patient.identity.edit',
      'patient.sensitive.view',
      'scheduling.schedule.manage',
      'scheduling.appointment.book',
      'visit.checkin',
      'visit.create',
      'order.direct_diagnostic.create',
      'order.service.cancel',
      'lab.report.deliver',
      'ipd.admission.create',
      'ipd.bed.allocate',
      'ipd.bed.transfer',
      'ipd.discharge.depart',
    ],
  },
  CSH: { code: 'CSH', nameEn: 'Cashier', permissions: cashier },
  BSV: {
    code: 'BSV',
    nameEn: 'Billing supervisor',
    permissions: [
      ...cashier,
      'billing.payment.method_correct',
      'billing.discount.apply',
      'billing.discount.approve',
      'billing.refund.approve',
      'billing.line.cancel',
    ],
  },
  DOC: {
    code: 'DOC',
    nameEn: 'Doctor',
    // No payment recording: the cashier collects the doctor fee (C-009).
    permissions: [
      'patient.record.search',
      'order.service.create',
      'order.service.cancel',
      'clinical.consultation.record',
      'clinical.document.sign',
      'clinical.document.amend',
      'clinical.prescription.create',
      'ipd.admission.create',
      'ipd.discharge.medical',
    ],
  },
  LBT: { code: 'LBT', nameEn: 'Lab technologist', permissions: labTechnologist },
  LBA: {
    code: 'LBA',
    nameEn: 'Lab authority',
    permissions: [
      ...labTechnologist,
      'lab.result.verify',
      'lab.result.release',
      'lab.result.amend',
      'lab.config.manage',
    ],
  },
  FIN: {
    code: 'FIN',
    nameEn: 'Finance',
    permissions: ['billing.cashier_session.review', 'report.export', 'admin.price.publish'],
  },
  ADM: {
    code: 'ADM',
    nameEn: 'Hospital administrator',
    // No clinical actions: an administrator does not sign or release by default (C01 section 5).
    permissions: [
      'patient.identity.edit',
      'patient.identity.reconcile',
      'patient.sensitive.view',
      'practitioner.manage',
      'scheduling.schedule.manage',
      'lab.config.manage',
      'report.export',
      'admin.user.manage',
      'admin.role.manage',
      'admin.config.publish',
      'admin.price.publish',
      'audit.view',
      'support.grant.approve',
    ],
  },
  // Read-only dashboards and reports; its report.view.<area> codes arrive with the reporting
  // module, and export is optional per hospital, so the template starts empty.
  MGT: { code: 'MGT', nameEn: 'Management viewer', permissions: [] },
};
