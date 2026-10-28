import { describe, expect, it } from 'vitest';
import { requiresSecondFactor } from './second-factor.js';

describe('requiresSecondFactor (C-032, FR-ACC-006)', () => {
  it('requires TOTP for the administrator and finance templates', () => {
    expect(requiresSecondFactor({ roleTemplates: new Set(['ADM']), granted: new Set() })).toBe(
      true,
    );
    expect(requiresSecondFactor({ roleTemplates: new Set(['FIN']), granted: new Set() })).toBe(
      true,
    );
  });

  it('requires TOTP for any role that grants an administration permission', () => {
    expect(
      requiresSecondFactor({ roleTemplates: new Set(), granted: new Set(['admin.user.manage']) }),
    ).toBe(true);
  });

  it('does not require TOTP for other staff', () => {
    expect(
      requiresSecondFactor({
        roleTemplates: new Set(['CSH', 'DOC']),
        granted: new Set(['billing.payment.record']),
      }),
    ).toBe(false);
  });
});
