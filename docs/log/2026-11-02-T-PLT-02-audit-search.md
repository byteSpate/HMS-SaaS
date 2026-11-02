# T-PLT-02: audit search

- **Date:** 2026-11-02
- **Commit:** this commit
- **Implements:** T-PLT-02; FR-AUD-005; AT-AUD-005; SCR-24; D section 8.2 keyset paging

## What was built

Someone with `audit.view` can search their hospital's audit trail by person, action, record and time, on a new screen and through `GET /api/v1/audit/events`. Results are newest first, paged with a cursor and limited to the hospital by RLS. Same-transaction audit writes and denied-attempt audit already existed from T-ACC-01 and T-ACC-02, so this task adds the search and the screen. The web client gains `apiPage()` to read `meta.nextCursor`.

## Files

| File                                                                         | Purpose                   |
| ---------------------------------------------------------------------------- | ------------------------- |
| `packages/contracts/src/audit.ts`                                            | Query and event contracts |
| `packages/mod-identity-access/src/infrastructure/audit-search.repository.ts` | Search under RLS          |
| `packages/mod-identity-access/src/http/audit.controller.ts`                  | The route                 |
| `packages/database/prisma/migrations/20261102120000_audit_search_indexes`    | Search indexes            |
| `apps/web/app/(app)/admin/audit/page.tsx`, `apps/web/src/api/audit.ts`       | SCR-24                    |
| `apps/web/src/api/client.ts`, `apps/web/src/navigation.ts`                   | `apiPage()`; navigation   |
| `packages/i18n/src/messages/*`                                               | Text in both languages    |
| `apps/api/src/audit-search.api.spec.ts`, `apps/web/e2e/audit.spec.ts`        | Tests                     |

## Decisions applied

- **Pages by the UUIDv7 ID, not by time:** `occurred_at` has microseconds that a JavaScript `Date` rounds, so a time cursor could skip or repeat rows. The ID is time-ordered and exact.
- **A person is found by exact username among this hospital's members,** so a username from another hospital simply finds nothing.
- **Dates are picked in hospital time,** using the fixed Bangladesh offset.

## Verification

| Command                                                     | Result                                    |
| ----------------------------------------------------------- | ----------------------------------------- |
| `vitest run src/audit-search.api.spec.ts`, before the route | Failed: 404                               |
| Same, after                                                 | Passed, including another hospital hidden |
| Web e2e and the full suite                                  | In the pull request's CI run              |

## Known limitations

- **`audit_event` is still not partitioned by month,** although E section 9 plans it. It needs a maintenance job to create partitions, so it stays with T-PLT-03's job work.
- **Q-053 is still open:** nothing is purged, as its interim rule says.
- **The screen shows the main columns only:** record ID and details are returned by the API but not shown yet.
- **AT-AUD-003 (NID reveal and export) waits for T-PAT-03 and T-REP-02,** and **AT-AUD-006 (log capture) for T-PLT-06.**
- New Bangla text needs native review (Q-050).

Deploy impact: migration `20261102120000_audit_search_indexes`. It builds two indexes without `CONCURRENTLY`, which briefly blocks audit writes on a large table. Staging data is small.

## How to debug

An event that should appear but does not: check it belongs to this hospital and that the person is a member, since `actor` matches members only. A `403` means the user lacks `audit.view`; the refusal itself is searchable as `authz.access.denied`.
