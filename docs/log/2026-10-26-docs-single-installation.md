# Docs: one installation per hospital, SaaS planning removed

- **Date:** 2026-10-26
- **Commit:** this commit
- **Implements:** ADR-023 (new), C-089 (site pack A); supersedes ADR-003 and P-003

## What was built

The documentation no longer plans a shared SaaS product. Each customer hospital gets its own installation, database and domain (C-089), recorded as ADR-023. Tenancy (tenant keys, row-level security, `withTenant()`, tenant switching), tenant provisioning, module entitlements, the vendor control plane, support grants, subscription plans and multi-hospital capacity scenarios were deleted from the ERP planning pack, the site planning pack, the SQL draft and the config templates. The code is unchanged and still contains the tenancy implementation; ADR-023 lists it.

## Files

| File                                                                                                 | Purpose                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/planning/docs/D2-adr/ADR-023-single-hospital-installation.md`                                  | New decision; lists the tenancy code that still exists                                                                                                      |
| `docs/planning/docs/D2-adr/ADR-003-tenancy-rls.md`                                                   | Reduced to a superseded notice (old text in git history)                                                                                                    |
| `docs/planning/docs/D2-adr/README.md`, `ADR-001/002/004/006/008/011/015/017/019/022`                 | Index row; tenant wording removed                                                                                                                           |
| `docs/planning/docs/A1`, `A2`, `A3`, `A4`, `A0`, `B`                                                 | Glossary, decision register (C-001, C-024, P-002, P-003 reworded; DEF-005, DEF-006, Q-052 deleted), assumptions, business model                             |
| `docs/planning/docs/C-srs/C00`, `C01`, `C02`, `C04`, `C05`, `C06`, `C10`, `C12`, `C13`, `C14`, `C15` | FR-SAA-*, FR-SUP-001/002, FR-ACC-002, FR-FIN-006, NFR-ISO-001, FPR-01 deleted; GP list renumbered GP-1..GP-6; FR-SAA-003/005/006 renamed FR-CFG-005/004/006 |
| `docs/planning/docs/D`, `E`, `F`, `G`, `H`, `I`, `J`, `K`, `L`, `M`, `N`, `D1`                       | System design section 6 rewritten; database roles and indexes without tenant keys; tests AT-ISO/SAA/SUP removed; capacity planned per hospital              |
| `docs/planning/templates/sql/*`                                                                      | Draft schema without `tenant_id` or RLS, probes renumbered P01..P14, new validation log                                                                     |
| `docs/planning/templates/docker/*`, `github/workflows/*`, `k6/*`, `sonar/*`                          | Relay and control roles, isolation suite and tenant wording removed                                                                                         |
| `docs/planning/README.md`, `CHANGES_AND_OPEN_DECISIONS.md`                                           | Pack description; ADR-023 recorded                                                                                                                          |
| `docs/site-planning/*`                                                                               | Tenant and subscription wording replaced by per-installation wording                                                                                        |
| `CLAUDE.md`, `PRODUCT.md`, `README.md`, `docs/GIT_WORKFLOW.md`, `docs/DEPLOYMENT.md`                 | Product wording; `withTenant()` rule replaced by a note on the existing code                                                                                |

## Decisions applied

- C-089: one installation, database and domain per customer hospital.
- Accepted ADRs are not rewritten (D2 rule): ADR-023 supersedes ADR-003, which keeps its ID and file so code comments that cite it still resolve.
- Dated logs, the v0.3 baseline kit, the source PDFs and the T-ACC-01 plan are history and were left unchanged. Repository names (`HMS-SaaS`) were kept.

## Verification

| Command                                                                                                       | Result                                                                             |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Draft schema + probes on a scratch `postgres:17` container (PostgreSQL 17.11, test-only `uuidv7()` shim)      | Schema exit 0; 14/14 probes PASS; races C1 and C2 each left exactly one allocation |
| Local link and anchor check over `docs/` (excluding the baseline)                                             | 0 broken links or anchors                                                          |
| `python3 -c "yaml.safe_load(...)"` on the edited compose and workflow templates; `bash -n initdb-10-roles.sh` | OK                                                                                 |
| `pnpm format:check`                                                                                           | All matched files use Prettier code style                                          |

## Known limitations

- The code still implements tenancy: `withTenant()`, the RLS migration, `TenantGuard`, hospital selection at login, entitlements and the related error codes. Removing them is not planned yet (ADR-023).
- C-046 still says "100,000 users" means registered patient records "across hospitals"; it was left as recorded by the product owner.
- The site-pack decisions C-061..C-092 are still not merged into ERP A2.

## How to debug

If a doc and the code disagree about tenants, the code is the older ADR-003 design; read ADR-023 "Existing code". The earlier tenancy text of any document is in git history before this commit (`git log -p -- <file>`).
