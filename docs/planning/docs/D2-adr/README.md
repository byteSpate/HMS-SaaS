# D2 — Architecture decision records (index)

| Control | Value |
| --- | --- |
| Status | All ADRs are **PROPOSED** unless marked otherwise. Approval is recorded here and in [A2](../A2-decision-register.md). |
| Owner role | Technical architect (proposes); tech lead / product owner (approves as named) |
| Updated | 2026-10-26 |

| ADR | Title | Decision ID | Status | Approver |
| --- | --- | --- | --- | --- |
| [ADR-001](ADR-001-modular-monolith.md) | Modular monolith with separate worker; package boundaries | P-001, P-004 | ACCEPTED 2026-10-14 | Tech lead |
| [ADR-002](ADR-002-nextjs-usage.md) | How Next.js is used (no business writes in Next.js) | P-007 | ACCEPTED 2026-10-14 | Tech lead |
| [ADR-003](ADR-003-tenancy-rls.md) | Shared-schema tenancy with RLS | P-002, P-003 | SUPERSEDED by ADR-023 | Tech lead + product owner |
| [ADR-004](ADR-004-authentication.md) | First-party session authentication in NestJS | P-008 | ACCEPTED 2026-10-14 | Product owner (MFA scope) + tech lead |
| [ADR-005](ADR-005-contracts.md) | Zod-first canonical contracts; generated OpenAPI | P-009 | ACCEPTED 2026-10-14 | Tech lead |
| [ADR-006](ADR-006-outbox-jobs.md) | Transactional outbox/inbox, idempotency, BullMQ delivery | P-010 | ACCEPTED 2026-10-14 | Tech lead; product owner for Redis/Valkey licence |
| [ADR-007](ADR-007-money.md) | Money representation and rounding | P-011 | PROPOSED | Finance reviewer + tech lead |
| [ADR-008](ADR-008-bed-occupancy.md) | Bed occupancy as intervals with exclusion constraints | P-012 | PROPOSED | Tech lead |
| [ADR-009](ADR-009-append-only-ledgers.md) | Append-only posted facts with correction records | P-013 | PROPOSED | Finance + clinical reviewers |
| [ADR-010](ADR-010-printing.md) | Browser print views plus server-side PDF | P-014 | PROPOSED | Product owner after printer UAT |
| [ADR-011](ADR-011-vps-topology.md) | Single-VPS Docker Compose start and expansion path | P-015 | PROPOSED | Product owner (risk acceptance) |
| [ADR-012](ADR-012-ci-quality-gates.md) | CI quality gates with SonarQube Community (main only) | P-016 | ACCEPTED 2026-10-14 | Tech lead |
| [ADR-013](ADR-013-test-runner.md) | Keep Jest on Node ≥ 24.9 with ESM | P-017 | SUPERSEDED by ADR-018 | Tech lead (Q-054) |
| [ADR-014](ADR-014-object-storage.md) | Object storage via S3 API; MinIO CE not adopted | P-018 | PROPOSED | DevOps lead |
| [ADR-015](ADR-015-worklist-refresh.md) | Polling with conditional requests for worklists | P-019 | PROPOSED | Tech lead |
| [ADR-016](ADR-016-payment-allocation.md) | Line-level payment allocation capability | P-020 | PROPOSED | Finance reviewer |
| [ADR-017](ADR-017-localization.md) | Bilingual UI and print implementation | P-022 | PROPOSED | Product owner + native reviewer |
| [ADR-018](ADR-018-vitest.md) | Vitest instead of Jest (supersedes ADR-013) | — | ACCEPTED 2026-10-13 | Product owner |
| [ADR-019](ADR-019-supabase-postgres.md) | Supabase as managed PostgreSQL 17 | — | ACCEPTED 2026-10-13 | Product owner |
| [ADR-020](ADR-020-valkey-nginx-droplet.md) | Valkey for queues; nginx on the existing droplet | — | ACCEPTED 2026-10-13 | Product owner |
| [ADR-021](ADR-021-separate-web-api-origins.md) | Separate web and API origins (amends D §4, ADR-002, ADR-004) | — | ACCEPTED 2026-10-14 | Product owner |
| [ADR-022](ADR-022-ui-foundation.md) | UI foundation: visual system, in-house components, reuse rules (amends ADR-017 items 3 and 5) | - | ACCEPTED 2026-10-15 | Product owner |
| [ADR-023](ADR-023-single-hospital-installation.md) | One installation per customer hospital (supersedes ADR-003) | C-089 | ACCEPTED 2026-10-26 | Product owner |

**ADR template:**
- Status
- Context (drivers, requirement IDs)
- Decision
- Alternatives considered (with when each is preferable)
- Consequences (positive/negative)
- Evidence required before acceptance
- Links

An accepted ADR is never edited in substance. A change creates a new ADR that supersedes it.
