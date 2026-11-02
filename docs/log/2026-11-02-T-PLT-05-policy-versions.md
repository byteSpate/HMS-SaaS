# T-PLT-05: policy versions

- **Date:** 2026-11-02
- **Commit:** this commit
- **Implements:** T-PLT-05; FR-CFG-002, FR-SAA-005; P-004; AT-CFG-001, -003; CP-09, CP-12

## What was built

A hospital's settings can now be published as versions with an effective time, immediate or future, through `/api/v1/config/policies/{key}`. A preview shows what would change without saving. `getEffectivePolicy(tx, key, at)` answers which version applied at a given time, and it answers null before anything is published, so the caller uses its default. Every publication is audited and emits a `config.policy.published` event.

## Files

| File                                                                | Purpose                          |
| ------------------------------------------------------------------- | -------------------------------- |
| `packages/database/prisma/migrations/20261102140000_policy_version` | Append-only table with RLS       |
| `packages/contracts/src/policies.ts`                                | Policy schemas and API contracts |
| `packages/platform/src/policy-version.ts`                           | Publish, preview, read, compare  |
| `apps/api/src/config/policies.controller.ts`                        | The routes                       |
| `apps/api/src/policies.api.spec.ts`                                 | Tests over HTTP                  |

## Decisions applied

- **Only confirmed settings have a schema:** `numbering` (C-033) and `security` (C-032). Agents do not invent policy, so each feature adds its own, and an unknown key answers `NOT_FOUND`.
- **Versions cannot be changed:** the app has no UPDATE on the table, and a past effective time is refused (FR-SAA-005).
- **Preview replaces drafts:** the draft schema's `DRAFT` and `RETIRED` states are left out until a screen needs saved drafts.
- **No cache, so nothing to invalidate:** T-PLT-05 names cache invalidation, but an indexed read is enough today. The published event lets one be added if load tests need it.

## Verification

| Command                                       | Result                       |
| --------------------------------------------- | ---------------------------- |
| `vitest run src/policies.api.spec.ts`, before | Failed: code missing         |
| Same, after                                   | 9 of 9 against PostgreSQL    |
| Full suite                                    | In the pull request's CI run |

## Known limitations

- **Nothing reads these settings yet:** the MRN prefix is first used by T-PAT-01. The `security` values do not yet replace the environment values for sessions and lockout: an account can belong to several hospitals, and login runs before a hospital is chosen, so per-hospital lockout needs its own decision.
- **No screen yet:** the routes are ready for a configuration screen in a later task.
- **AT-CFG-002 waits** for charges in T-BIL-02.

Deploy impact: migration `20261102140000_policy_version` (additive, safe while the previous version runs).

## How to debug

Unexpected value: list the versions with `GET /config/policies/{key}` and check `effectiveFrom`. A later `versionNo` with an earlier effective time does not win over one already in force at a later time: the latest effective time at or before the moment asked applies, then the highest version.
