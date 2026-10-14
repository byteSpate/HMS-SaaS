# Day summary: 2026-10-14

Everything decided and built on 2026-10-14, in the order it happened. For the day before (scaffold, RLS, Supabase) see the two entries dated 2026-10-13 in this folder.

## 1. Where the project stood at the start

- Planning pack v0.4 (documents A to N) in `docs/planning`.
- Monorepo scaffold done (Turborepo, Next.js, NestJS, Prisma 7, Vitest, Playwright, CI) and tenant isolation with RLS built and tested (2026-10-13).
- Three GitHub repositories receive every push: `origin` (byteSpate/HMS-SaaS, main), `reza` and `noman` (backups).

## 2. Hosting and domain decisions (documents only)

| Decision                                                                                                                                                                         | Recorded as          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Staff UI on `healthcare.bytespate.com` and API on `healthcareapi.bytespate.com` (two origins) instead of one domain with `/api` routing                                          | ADR-021              |
| Because `bytespate.com` also hosts an unrelated ecommerce site: CORS allow-list on the API, host-only session cookie, CSRF tokens mandatory                                      | ADR-021              |
| Cloudflare DNS records must be added inside the `bytespate.com` zone (subdomains cannot be added as their own site), grey cloud until the certificate exists, then Full (strict) | J section 5          |
| Reviewed the deployment guide PDF from the teammate. It matched the earlier plan except for the domain layout (now settled)                                                      | Review notes in chat |
| Deployment is handled by another team member; HMS work stays local for now                                                                                                       | C-050                |

Documents updated to match: D (system design), J (operations), K (Docker), the change log, plus the new ADR-021. A first attempt to also write deployment code was removed at the owner's request ("change the plan" means documents only).

## 3. Phase 0 answers (planning gate)

The product owner answered the first-slice questions. They are recorded as **C-031 to C-051** in A2 section 2.4, and A3 marks each question answered.

| Area               | Decision                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First release      | RP-A: outpatient plus diagnostics (C-031)                                                                                                                                                               |
| Login security     | MFA for admin and finance; 60 min idle, 12 h absolute; lock after 5 failures for 15 min (C-032)                                                                                                         |
| Patients           | MRN `{PREFIX}-{seq:6}` continuous; required: name, sex, age or DOB, mobile (C-033, C-034)                                                                                                               |
| Queue and language | Fixed capacity, serial at check-in (C-035); digits follow UI language (C-036)                                                                                                                           |
| Money              | Whole-taka rounding with a visible adjustment line, half rounds up (C-037, C-051); no overpayment (C-038); one payment can cover several invoices with one receipt (C-039); no deposits in RP-A (C-040) |
| Fees and staff     | New and follow-up fee per doctor (C-041); cashier both bills and collects (C-042); method corrections shown on the correction day (C-043); proposed role set (C-045)                                    |
| Devices and scale  | A4 laser, 80 mm thermal, label printer (C-044); "100k users" means registered patient records (C-046)                                                                                                   |
| Tooling            | GitHub Free with private repositories (C-047); SonarQube server later (C-048); Supabase free plan, Data API off (C-049)                                                                                 |
| Approvals          | ADR-001 to 006 and ADR-012 accepted; ADR-013 superseded by ADR-018; C-022 to C-025 ratified                                                                                                             |

Still open: owners for the integrator, QA, DevOps and domain-reviewer roles (RG-0), the pilot hospital profile (Q-042), recovery targets (Q-043), printer models. Making the three GitHub repositories private is still the owner's to do.

## 4. Working rules and tooling

- `CLAUDE.md` rules loaded in every session: no AI attribution in commits or PRs (also enforced by `.claude/settings.json`), ASCII-only punctuation, clean reusable code, header comments naming the task and decision IDs, and a feature log entry for every finished feature.
- `docs/log/` created with a template and an index.
- Git workflow (`docs/GIT_WORKFLOW.md`, PR #1): `main` deploy-only, `dev` integration branch, branches named `<type>/<task-id>-<slug>`, Conventional Commits, squash merge into `dev`, release PRs with tags, every branch pushed to all three remotes, PR template added. CI now runs for `dev`.
- Next.js DevTools MCP added for the project (`.mcp.json`). Community skills reviewed and skipped; the existing skill sets are the standard.
- Local tooling: global `turbo` installed; ports 3100 (web) and 4100 (API).

## 5. T-ACC-01: login, sessions and CSRF (PR #2, merged)

Full details: [2026-10-14-T-ACC-01-login.md](2026-10-14-T-ACC-01-login.md).

- API endpoints for login, session, hospital selection and logout; server-side sessions; host-only `__Host-hms_session` cookie; CSRF token and Origin check on every write; three global guards (session, CSRF, hospital).
- New tables: `user_account`, `membership`, `user_session`, `auth_event`, `audit_event` with RLS and append-only grants. Completes ADR-003 evidence item 5.
- New module `@hms/mod-identity-access` plus shared platform pieces (problem+json errors, Zod body pipe, audit writer, database module) and testkit seeds.
- Built test-first with a failing-test commit and a passing-code commit for every task.
- Design decisions confirmed by merge: separate `auth_event` table, CSRF token derived from the session, audit table not yet partitioned.

### Two security reviews, all findings fixed before merge

| Round                                     | Findings fixed                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent reviewer                      | Disabled or suspended users kept working sessions; hospital switch reset the 12-hour limit; login skipped the Origin check; cookie shadowing by sibling subdomains; lock state revealed before the password; password-like usernames stored in the permanent log; temporary lock without end time; error filter leaks; unvalidated request id; membership policy and tenant-name exposure |
| Product owner's report (reproduced first) | A hospital switch could finish after logout or twice at once; restored access revived old cookies. Fixed with an atomic session replacement and database triggers that revoke sessions the moment access is removed                                                                                                                                                                       |

Deferred and tracked in the log: column-level grants on identity tables, an Argon2 concurrency cap (T-ACC-03), two small extra queries per request, a staging check of the Supabase pooler.

## 6. Numbers at the end of the day

- 48 build, lint, typecheck and test tasks pass; boundary rules clean.
- Tests: contracts 7, kernel 2, database 14, platform 6, identity module 42, API 11.
- CI (checks and browser test) green on every PR; migrations applied on both local PostgreSQL 17 and Supabase.

## 7. Mistakes and lessons

- Wrote deployment code when only a document change was asked for; removed it and saved a rule to ask before coding after a plan change.
- Dev containers stopped between sessions, which looked like a code failure; `pnpm services:up` fixes it (noted in the log).
- Prisma 7 does not regenerate the client on `migrate dev`; `db:migrate` now does.
- PR #2 was merged with a merge commit instead of the agreed squash merge; harmless, but pick "Squash and merge" for feature PRs.

## 8. Next steps

1. Make the three GitHub repositories private and set `dev` as the default branch on `byteSpate/HMS-SaaS` (account owner).
2. T-ACC-02: roles and permissions, starting with a short design check of the role templates.
3. Then T-ACC-03 (lockout and rate limiting), T-ACC-04 (MFA), T-PLT-01 (idempotency), T-PLT-04 (number sequences) and T-UI-02 (app shell and login screen).
4. Upgrade Next.js to the patched release before any deploy.
