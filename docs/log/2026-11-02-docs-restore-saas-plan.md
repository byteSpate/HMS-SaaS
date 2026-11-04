# Docs: SaaS plan with tenants restored

- **Date:** 2026-11-02
- **Commit:** this commit
- **Implements:** C-094, C-095 and C-096 (new); reinstates ADR-003; supersedes ADR-023, C-089 and C-090; reverses commit 8416158

## What was built

The product owner confirmed that HMS is sold as shared SaaS with tenants. The planning documents return to the version before the 2026-10-26 removal: tenancy, row-level security, provisioning requirements, entitlements, the vendor control plane, subscription plans and multi-hospital capacity scenarios. Tenant code removal is cancelled. The tenancy code itself was never removed, so it needed no restoring.

## Files

| File                                                                                  | Purpose                                                                                         |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `docs/planning/**`, `CLAUDE.md`, `PRODUCT.md`, `README.md`                            | Revert of 8416158, keeping later additions                                                      |
| `docs/GIT_WORKFLOW.md`, `docs/DEPLOYMENT.md`, `.github/pull_request_template.md`      | Product wording from the same revert                                                            |
| `docs/planning/docs/A2-decision-register.md`                                          | New decision C-094; C-093 kept                                                                  |
| `docs/planning/docs/D2-adr/*`                                                         | ADR-003 reinstated in full; ADR-023 kept as a superseded record                                 |
| `docs/planning/docs/C-srs/C01-platform-access-audit.md`                               | FR-SAA-\* back; FR-ACC-012 kept                                                                 |
| `docs/planning/docs/K-docker-design.md`                                               | Lockout and MFA settings kept, with tenant wording                                              |
| `docs/site-planning/*`                                                                | C-089 and C-090 marked superseded; tenant website design back; C-086, C-087 and C-088 unchanged |
| `docs/deliverables/HMS-Core-Modules-and-Development-*`                                | Word and Markdown timeline back to the SaaS wording from PR #30 commit a8845af                  |
| `apps/api/src/http/swagger.ts`                                                        | API description now cites ADR-003                                                               |
| `packages/platform/src/rate-limiter.ts`, `login-throttle.ts` in `mod-identity-access` | Comments no longer rely on one process per hospital                                             |

## Decisions applied

- C-094: shared SaaS with tenants. ADR-003 applies, and new tenant-owned tables use `tenant_id`, RLS and `withTenant()`.
- Dated logs stay as history, including `2026-10-26-docs-single-installation.md`. ADR-023 keeps its file so older references still resolve.
- CMS decisions C-086, C-087 and C-088 have nothing to do with hosting, so they stay. C-096 answers Q-082 with the website plan limits: Standard 5 GB, 20 custom pages and 1 custom domain; larger plan 20 GB, 50 custom pages and 3 custom domains.
- C-095 answers Q-086: keep the two hosts for now, and add host names as data when several hospitals exist.

## Verification

| Check                                                                       | Result                                                   |
| --------------------------------------------------------------------------- | -------------------------------------------------------- |
| `git revert --no-commit 8416158`                                            | 73 files; 4 conflicts resolved by keeping later rows     |
| `git diff 8416158^ -- docs/planning`, before adding C-094 and the ADR notes | Only A2, C01, D and K differ: 13 insertions, 2 deletions |
| Search for single-installation wording outside history and superseded rows  | None                                                     |
| `turbo run typecheck lint` for api, platform and mod-identity-access        | 13 of 13 tasks passed                                    |
| Full build and tests                                                        | In the pull request's CI run                             |

## Known limitations

- **Forgotten passwords (C-093, FR-ACC-012)** and administrator password resets were built while one hospital per installation was the plan. The check found a real gap, closed in `2026-11-02-T-ACC-05-shared-account-guard.md`.
- **Provisioning has no code or task:** FR-SAA-002, the activation checklist (FR-SAA-006), tenant export (FR-SAA-008) and the control plane are requirements only, and plan G lists no provisioning task.
- **`hms_app` can write `tenant_entitlement`:** the 2026-11-01 grants log expected this to go away with tenant removal. It now needs restricting with provisioning (T-ACC-02 log).
- **Timeline:** the 20-week estimate is restored as written. It was not re-estimated.
- **ADR number:** site pack D section 13 proposes a different "ADR-023" for the shared host. That name clash predates this change.

Deploy impact: none.

## How to debug

If a document disagrees with the tenant design, check C-094 in A2 first; text citing ADR-023 or C-089 as current is out of date. To compare with the original, run `git diff 8416158^ -- <file>`. The reasoning for the old direction is in `2026-10-26-docs-single-installation.md`.
