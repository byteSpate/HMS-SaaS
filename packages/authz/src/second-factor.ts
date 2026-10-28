// Which memberships need a second factor (T-ACC-04; FR-ACC-006; C-032; CP-12). C-032 names the
// administrator and finance roles. A custom role copied without a template but holding an
// administration permission is privileged too, so renaming a role cannot switch MFA off.
// Per-hospital MFA role lists (CP-12) come with policy versions (T-PLT-05).
import type { PermissionCode } from '@hms/contracts';
import type { RoleTemplateCode } from './role-templates.js';

export const SECOND_FACTOR_TEMPLATES: ReadonlySet<RoleTemplateCode> = new Set(['ADM', 'FIN']);

const ADMINISTRATION_PREFIX = 'admin.';

export interface SecondFactorInput {
  /** Template codes of the membership's roles (roles copied from a template keep its code). */
  roleTemplates: ReadonlySet<string>;
  granted: ReadonlySet<PermissionCode>;
}

export function requiresSecondFactor(input: SecondFactorInput): boolean {
  for (const template of input.roleTemplates) {
    if (SECOND_FACTOR_TEMPLATES.has(template as RoleTemplateCode)) return true;
  }
  for (const code of input.granted) {
    if (code.startsWith(ADMINISTRATION_PREFIX)) return true;
  }
  return false;
}
