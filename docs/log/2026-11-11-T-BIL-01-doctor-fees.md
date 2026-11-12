# T-BIL-01 (doctor fees part): price lists with doctor fees

- **Date:** 2026-11-11
- **Commit:** this commit
- **Implements:** T-BIL-01 (doctor-fee items only, owner decision 2026-11-11); FR-CFG-001, FR-CFG-002, FR-BIL-007; C-041 (answers Q-038); AT-CFG-002; SP-03, SP-08; FR-AUD-001; ADR-003, ADR-007

## What was built

Staff with `admin.price.publish` (ADM, FIN) see **Doctor fees** in the menu. The screen shows the fees in force, a draft being edited, and versions scheduled for a later date. **Change fees** opens a draft, a copy of the newest published version. In the draft an administrator adds, edits or removes a doctor's fee: the new-patient fee, the follow-up fee and the follow-up window in days (C-041). **Publish** shows what changes against the fees in force, doctor by doctor, and takes effect now or from the start of a later date. Amounts can be typed with Bangla or Western digits.

The price in force at a moment is the published version with the latest effective time not after it (FR-BIL-007). Check-in (T-VIS-01) will read it through the charge interface (T-BIL-02).

New shared pieces: `Money` in `@hms/domain-kernel` (bigint minor units, ADR-007), `fieldError` in `@hms/domain-kernel`, `requestScope` and `recordChange` (audit plus outbox) in `@hms/platform`, `findPractitionerChoices` in `@hms/mod-patients`, `toWesternDigits` in `@hms/i18n`, `wasRefused` moved to `apps/web/src/api/errors.ts`.

## Files

| File                                                                                                                           | Purpose                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/database/prisma/migrations/20261111090000_price_list/migration.sql`                                                  | `service_item`, `price_list_version`, `price_list_item`; one draft, one version per effective time, draft-only trigger, RLS, column grants |
| `packages/database/prisma/schema.prisma`                                                                                       | `ServiceItem`, `PriceListVersion`, `PriceListItem` and back-relations                                                                      |
| `packages/domain-kernel/src/money.ts` (+ test), `domain-error.ts`, `index.ts`                                                  | `Money`, `fieldError`                                                                                                                      |
| `packages/platform/src/command-scope.ts`, `index.ts`                                                                           | `requestScope`, `recordChange`                                                                                                             |
| `packages/contracts/src/price-lists.ts`, `errors.ts`, `index.ts`                                                               | Price list schemas, `moneyAmountSchema`; `POLICY_NOT_CONFIGURED` (409)                                                                     |
| `packages/mod-billing/` (new)                                                                                                  | Domain rules (+ spec), repository, service, controller, module                                                                             |
| `packages/mod-patients/src/infrastructure/practitioner.repository.ts`, `index.ts`                                              | `findPractitionerChoices` (active or not), shared `toChoice`                                                                               |
| `packages/i18n/src/digits.ts`, `index.ts`, `format.test.ts`, `messages/en.ts`, `messages/bn-BD.ts`                             | `toWesternDigits`; `doctorFees.*`, `nav.doctorFees`, `errors.api.POLICY_NOT_CONFIGURED`                                                    |
| `apps/api/src/app.module.ts`, `package.json`, `price-lists.api.spec.ts`                                                        | Billing module wired in; 5 API tests                                                                                                       |
| `apps/web/app/(app)/admin/doctor-fees/page.tsx`, `src/components/doctor-fees/*`, `src/api/price-lists.ts`, `src/navigation.ts` | The screen, dialogs, form rules (+ test)                                                                                                   |
| `apps/web/src/api/errors.ts` (+ test), `components/appointments/*`                                                             | `wasRefused` moved out of the appointment rules                                                                                            |
| `apps/web/e2e/doctor-fees.spec.ts`, `e2e/support/mock-price-lists.ts`, `mock-api.ts`                                           | 2 browser tests and the contract-valid mock                                                                                                |
| `docs/DEPLOYMENT.md`                                                                                                           | Supabase row: the two scheduling migrations applied 2026-11-11                                                                             |

## Decisions applied

- **Doctor fees only** (owner, 2026-11-11): the service catalogue and its prices come with orders (T-ORD-01), where they are first used. The tables are the general ones of E section 5.4, so services fit later without a new design.
- **A doctor fee is two price rows** of two system items, `DOCTOR_FEE_NEW` and `DOCTOR_FEE_FOLLOW_UP`; the follow-up row carries the window. The items are created on first use (no tenant provisioning yet, T-SAA-01). Their names are in the i18n catalogs by code, since Bangla text may not be in code.
- **Both fees are more than 0.00:** C-041 allows no reductions. A free follow-up is not supported.
- **Published prices never change:** the app only edits drafts, and a trigger refuses any write to a published version's items, even by `hms_app` (AT-CFG-002). Records will keep the version they used.
- **One draft at a time** (partial unique index), created under an advisory lock so two "new draft" clicks do not race to a 500.
- **Effective time:** now, or a time that has not passed (5 minutes of margin for "now"). The screen offers the start of a later hospital date. Two versions may not take effect at the same instant.
- **Change summary** (FR-CFG-002): the publish dialog lists added, changed and removed doctors; the audit event `billing.price_list.published` stores the counts.
- **Permission `admin.price.publish`** (C00 section 8, ADM and FIN), with its own practitioner choices route, so finance need not manage schedules.
- **Shared helpers instead of copies:** the new module uses `requestScope`, `recordChange` and `fieldError` from the packages (review finding on PR #54). Older modules still have local copies.

## Verification

| Command                                                                               | Result                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:deploy` (local Docker only)                                                  | `20261111090000_price_list` applied                                                                                                                                                       |
| `vitest run` (domain-kernel money, mod-billing, i18n, web doctor-fees and api/errors) | 6, 4, 31, 4 and 1 of each passed                                                                                                                                                          |
| `vitest run src/price-lists.api.spec.ts` (api, real PostgreSQL)                       | 5 of 5                                                                                                                                                                                    |
| `playwright test e2e/doctor-fees.spec.ts`                                             | 2 of 2, axe clean                                                                                                                                                                         |
| Local CI (format, build, lint, typecheck, boundaries, all tests)                      | Build, lint, typecheck 52 of 52 (after fixing a mock type and formatting found by the first run); no dependency violations (772 modules); `turbo run test --concurrency=1` 30 of 30 tasks |

## Known limitations

- **No service catalogue** yet (lab, imaging, procedures): T-ORD-01.
- **No free follow-up** and no reductions (C-041).
- **The time zone is Asia/Dhaka** for "start of a date", as everywhere (C-024).
- **Older modules keep their own copies** of the scope and audit helpers; moving them is a clean-up for a later branch.
- **Bangla texts** need the native-speaker review of terms (A1).
- **Supabase:** migration applied 2026-11-12 (`pnpm db:deploy` as `hms_migrator`), see docs/DEPLOYMENT.md section 4.

Deploy impact: migration `20261111090000_price_list` (three new tables, a trigger function, RLS policies, column grants; expand-only). New module `mod-billing` in the API build; no new variable, service or build step.

## How to debug

- **`INVALID_TRANSITION` on "new draft":** a draft exists; `SELECT id, version_no FROM hms.price_list_version WHERE status = 'DRAFT'`.
- **`INVALID_TRANSITION` on a fee:** the version is published; open the draft instead.
- **"Prices of a published price list version cannot change":** the trigger `price_list_item_draft_only` refused a write to a published version; nothing should do that.
- **Which fee applies now:** `SELECT version_no, effective_from FROM hms.price_list_version WHERE status = 'PUBLISHED' AND effective_from <= now() ORDER BY effective_from DESC LIMIT 1`.
- **A doctor missing from the fee picker:** the practitioner is inactive, or already has a fee in the draft (edit it in the table).
