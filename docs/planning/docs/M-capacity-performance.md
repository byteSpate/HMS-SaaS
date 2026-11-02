# M — Capacity and performance plan

| Control | Value |
| --- | --- |
| Document | M Capacity and performance plan (scenarios, load model, growth, scaling, load tests, triggers) |
| Version | 0.4.0-draft |
| Status | **PROPOSED.** Every number in this document is a **planning assumption or a proposed target**. None is a measurement or a guarantee. **This product is not claimed to support 100,000 users** (C-028). The meaning of that figure is OPEN (Q-041). |
| Owner role | Technical architect; product owner (targets and the Q-041 answer) |
| Updated | 2026-10-12 |
| Related | [C15 NFR](C-srs/C15-non-functional-requirements.md), [E §10](E-database-design.md#10-query-patterns-indexes-growth-and-reporting-strategy), [J §4](J-vps-deployment-operations.md#4-resource-sizing-assumptions-not-capacity-guarantees), [templates/k6](../templates/k6/front-desk-cashier.js) |

## 1. Why this plan is parameter-driven

"100,000 users" can mean 100k accounts, 100k people using the system each day, or 100k people active at the same moment. These differ in load by roughly two orders of magnitude.

Hospital load is also shaped by **staff work patterns**: morning OPD peaks, cashier queues, overnight wards. It is not shaped by anonymous web traffic. This plan therefore:
1. defines the parameters
2. computes worked examples for the three interpretations and for a realistic pilot
3. defines how to measure
4. defines when to expand

Replace the parameters with pilot measurements (Q-042) as soon as they exist.

## 2. Parameters (assumptions — change these, not the conclusions)

| Symbol | Meaning | Pilot assumption | Basis |
| --- | --- | --- | --- |
| `H` | Number of customer hospitals | 1 (pilot) | C-024 |
| `S` | Staff accounts per hospital | 300 (medium) | AS-011 synthetic |
| `d` | Daily-active share of staff accounts | 0.65 | Shift-based work |
| `c` | Peak concurrent share of daily-active staff | 0.35 | Morning OPD overlap with ward shifts |
| `r_i` | Interactive API requests per concurrently active staff user per minute | 3 (role-weighted average) | Search/open/act cycles; cashier and lab higher, doctors lower |
| `r_p` | Polling requests per active user per minute | 3 (one visible worklist at a 20 s interval) | ADR-015 |
| `f_304` | Share of polls answered `304 Not Modified` | 0.7 | ETag on unchanged worklists |
| `V` | OPD + diagnostic visits per hospital per day | 800 | E §10.2 synthetic |
| `w` | Write transactions per visit (registration share, check-in, invoices, payments, orders, specimen, results, verify, release, print events, audit) | 15 | Derived from the workflow (B §8) |
| `p_h` | Share of daily visits in the peak hour | 0.2 | Morning OPD |
| `P` | Portal patient accounts (later) | 0 now | Portal is a GAP (Q-033) |

**Requests per second at peak** for staff:

```text
peak_concurrent = H × S × d × c
peak_rps_staff  = peak_concurrent × (r_i + r_p) / 60
db_write_tps    = H × V × w × p_h / 3600
```

## 3. Planning scenarios

| Scenario | Interpretation | Inputs (assumed) | Peak concurrent staff | Peak API rps | Peak write tx/s | Indicative topology |
| --- | --- | --- | --- | --- | --- | --- |
| **P — Pilot** | One medium hospital | H=1, S=300 | 300×0.65×0.35 ≈ **68** | 68×6/60 ≈ **7** (bursts ×3 ≈ 20) | 800×15×0.2/3600 ≈ **0.7** | T0 single VPS (J §3) with large headroom |
| **G — Growth** | 20 hospitals of mixed size | H=20, S avg 250 | 20×250×0.65×0.35 ≈ **1,140** | ≈ **114** | 20×600×15×0.2/3600 ≈ **10** | T1/T2 (DB on its own VPS, replica for reports) |
| **A — "100k registered accounts"** | 20,000 staff accounts (≈ 70 hospitals × 285) + 80,000 portal accounts | staff d=0.65, c=0.35; portal DAU 2%, 10% concurrent at 1 req/min | staff ≈ **4,550**; portal ≈ 160 | staff ≈ 455 + portal ≈ 3 → **≈ 460** | 70×700×15×0.2/3600 ≈ **41** | T3: several app nodes, PostgreSQL primary + standby with tuned I/O; PgBouncer; possibly tenant placement for the largest hospitals |
| **B — "100k daily active users"** | 100,000 staff active per day (≈ 330 hospitals × 300 DAU) | c=0.35 | ≈ **35,000** | ≈ **3,500** | 330×800×15×0.2/3600 ≈ **220** | Multiple app clusters; **database partitioning by tenant across several PostgreSQL clusters** (DEF-005); push (SSE) instead of polling; dedicated reporting stores |
| **C — "100k concurrent users"** | 100,000 staff active at the same moment (≈ 285,000 DAU; ≈ 950 hospitals of 300 DAU) | — | **100,000** | ≈ **10,000** (polling alone ≈ 5,000) | ≈ **600+** | Far beyond VPS-scale planning. Requires a different architecture review: sharded tenants across many clusters, regional deployments, event-driven worklists. **Not a planning target until Q-041 says so.** |

**Interpretation of the table:**
- The architecture (modular monolith, shared PostgreSQL, tenant IDs everywhere) is suitable for **P** and **G** on VPS infrastructure, subject to load-test evidence.
- **A** is plausible with an expanded topology and careful tuning, **but must be proven by measurement**.
- **B** and **C** need tenant sharding across multiple database clusters. The `tenant_id` design makes that a data-placement exercise, not a rewrite (D §6.3). It is still major work.
- Polling cost matters. At scenario B it is about half the API load, which is the trigger for SSE (ADR-015).

## 4. Load model: peak actions, polling and jobs

**Role mix at peak** (pilot, 68 concurrent; assumption):

| Role | Concurrent | Interactive req/min each | Notes |
| --- | --- | --- | --- |
| Reception | 6 | 6 | Search-heavy (trigram queries) |
| Cashier | 4 | 8 | Payment transactions with row locks |
| Doctor | 15 | 2 | Worklist polling; note autosave every 10 s while typing (adds ~6/min while active) |
| Lab | 10 | 5 | Worklists, result entry, label prints |
| Nurse (RP-B) | 20 | 2 | Ward list polling |
| Pharmacy/other | 8 | 3 | — |
| Admin/management | 5 | 1 | Reports, possibly heavy |

**Peak business actions per hour** (pilot): about 160 check-ins, about 290 payments, about 320 specimens, and about 320 result releases.

**Polling budget** (ADR-015): 68 users × 3 polls/min = 204 polls/min ≈ 3.4 rps. 70% are `304`, which costs a lightweight "last change" query. Worklist intervals stay at 15–30 s unless measurements justify otherwise.

**Job volume per hospital per day** (pilot): about 1,600 PDF renders (if every release is archived, a decision in E §10.2), about 12,000 outbox events, a few report jobs, and nightly reconciliation. Constraint: the PDF render queue concurrency of 2 with ~1–3 s per render handles about 2,400–7,200 renders/hour, far above the ~320/hour peak.

## 5. Data-growth and storage assumptions

From [E §10.2](E-database-design.md#102-expected-growth-synthetic-planning-inputs-as-011), a medium hospital adds about **7–8 GB/year** of database data (audit is the largest single table), plus WAL and backups. Archived PDFs would add about 85 GB/year if every lab report is stored.

| Scenario | DB growth / year | Backup repository (≈ 4 fulls retained + WAL) | Object storage (if all reports archived) |
| --- | --- | --- | --- |
| P (1 hospital) | ~8 GB | ~40–60 GB | ~85 GB |
| G (20 hospitals, mixed) | ~120 GB | ~0.6–1 TB | ~1.3 TB |
| A (~70 hospitals) | ~450 GB | ~2–3 TB | ~4.5 TB |

**Controls:**
- monthly partitions for `audit_event` (archive old partitions to object storage after the retention decision, Q-053)
- outbox purge after 30 days (PROPOSED)
- idempotency purge after 7 days
- a PDF archival policy decision
- table bloat monitoring (autovacuum tuning on hot tables: `invoice_line`, `lab_result`, `bed`)

## 6. API, worker scaling and database connection budgeting

**API scaling:** stateless containers. Add replicas until CPU per replica is < 60% at peak. Then add app nodes (T3). Node.js runs one event loop per process, so prefer more processes over bigger ones. Measure per-replica throughput on the chosen VPS (§7). Do not assume a figure.

**Worker scaling:** separate concurrency per queue (D §10). Add worker processes only when the queue wait p95 exceeds its target. The outbox relay runs in one process at a time (lease), or safely in several with `SKIP LOCKED`.

**Connection budget** (rule: `Σ(process pool sizes) + reserves ≤ max_connections × 0.8`):

| Topology | Consumers | Example budget |
| --- | --- | --- |
| T0 | api 2 × pool 10 = 20; worker app pool 6 + relay 2 = 8; migrate (during deploy) 2; monitoring 3; pgBackRest 2; admin reserve (`superuser_reserved_connections`) 3 | ≈ 38 of `max_connections = 100` |
| T3 example | 6 api processes × 10 = 60; 3 workers × 8 = 24; reporting 4; others 10 | ≈ 98 → raise `max_connections` modestly **or** add PgBouncer (transaction mode) with server pool ≈ 40–60 |

**Why the interactive transaction size matters:**
- `withTenant` holds a connection for the whole command. Keep commands short (5 s timeout, no external I/O).
- Long-running reports use a **separate small pool** (or replica) with `statement_timeout`, so they cannot starve the desk transactions (NFR-PERF-003).

**Query optimization practices:**
- `pg_stat_statements` enabled. A weekly top-20 review by total time.
- `EXPLAIN (ANALYZE, BUFFERS)` for each new list or search query at **volume-seed scale** before merge (H §3 volume fixtures).
- Keyset pagination. Explicit `LIMIT`. Indexes per E §10.1. Avoid N+1 (batch loads; Prisma `include` used deliberately; TypedSQL/raw SQL for complex read models).
- Trigram search: tune the similarity threshold and limit results.
- **Caching only for configuration and permissions** (D §11). Never for balances or worklists.

**Heavy-report isolation:**
- Reports beyond the interactive budget run as jobs (FR-REP-005), with job concurrency 1–2, a separate DB pool, and `statement_timeout` (e.g., 120 s).
- At G and above, run them on the replica.
- Daily summaries are materialized for dashboards.

## 7. Load-test methodology and measurable targets

**Tool:** k6 (PROPOSED). Template: [`templates/k6/front-desk-cashier.js`](../templates/k6/front-desk-cashier.js).

**Environment:**
- staging VPS **sized like production** (or production before go-live)
- same images, same configuration
- volume seeds: at least 2 years of the scenario's data per tenant (e.g., pilot: 600k patients, 580k visits, 15M audit events)
- two or more tenants to exercise RLS paths
- monitoring on

**Scenarios:**

| Test | Shape | Duration | Purpose |
| --- | --- | --- | --- |
| Smoke | 5 VUs per journey | 5 min | Scripts valid |
| Peak (P) | Arrival-rate model of §4 at 1× and 2× the pilot peak | 30 min steady after 10 min ramp | Targets below |
| Stress | Increase arrival rate until a target breaks | Until failure | Find the first bottleneck and headroom factor |
| Spike | Morning surge: 0 → 3× peak in 2 min | 15 min | Queueing and recovery behavior |
| Soak | 1× peak | 8–12 h | Memory leaks, connection leaks, outbox lag, autovacuum, log volume |
| Report interference | Peak plus 2 concurrent month-long report jobs | 30 min | NFR-PERF-003 |
| Deploy under load | Peak plus a rolling deploy | 20 min | NFR-REL-002: no failed money operations, no duplicates |

**Journeys** (k6 scenarios with think time and data parameterization):
1. Reception: search (mix of phone/MRN/Bangla name) → open → check in.
2. Cashier: open the visit → pay D → pay S lines.
3. Doctor: poll the worklist → open → autosave → sign with orders.
4. Lab: poll worklists → collect → enter → verify → release.
5. Ward and pharmacy polling (RP-B).
6. Admin: report job request.

**Measurable targets** (PROPOSED for P at 1× and 2× peak; owner approval needed):

| Metric | Target |
| --- | --- |
| p95 server time, patient search and worklist reads | ≤ 500 ms |
| p95, check-in / payment / result entry commands | ≤ 800 ms |
| p99, same commands | ≤ 2 s |
| Print preview render | ≤ 2 s p95 |
| Error rate (5xx + unexpected 4xx) | < 0.5% |
| Duplicate postings (charges, payments, movements) | **0** (verified by post-test reconciliation queries) |
| DB CPU | < 70%; connections < 80% of budget |
| Outbox lag | p95 < 5 s; max < 60 s |
| PDF queue wait | p95 < 60 s |
| Soak | No upward trend in memory, connections or latency over 8 h |

**Pass/fail:**
- k6 thresholds fail the run automatically for latency and error targets.
- Reconciliation queries (D §9.5) run after each test.
- The report records environment, dataset, versions, results and bottleneck notes. It becomes gate evidence for RG-3.

## 8. Bottleneck detection and expansion triggers

| Signal (sustained over a week of peaks unless noted) | Likely bottleneck | Action |
| --- | --- | --- |
| API CPU > 60% per replica at peak; latency rising with rps | App compute | Add api replicas; then T3 app nodes |
| DB CPU > 70% or I/O wait > 20% at peak | Database | Query review (pg_stat_statements); index fixes; vertical scale; then T1 (own VPS) |
| DB connections > 80% of budget | Pool sizing / long transactions | Find long transactions; shorten commands; add PgBouncer |
| Report jobs push interactive p95 over target | Report interference | Move reports to the replica (T2); materialize summaries |
| Polling > 40% of API requests and worklists slow | Polling overhead | Lengthen intervals for passive screens; implement SSE for key worklists (ADR-015) |
| Outbox lag > 60 s at peak | Relay/worker throughput | Raise relay batch and concurrency; separate queues; add a worker process |
| Disk usage growth > 2% per week or < 30% free | Storage | Archive partitions; enlarge disk; review PDF archival |
| Restore time approaching the agreed RTO | Recovery | Standby replica (T2); faster storage; split the database |
| One tenant > 30% of DB load | Noisy neighbour | Per-tenant rate limits; consider dedicated placement (DEF-005) |
| Availability objective missed due to single-host events | Topology | T2/T3 per J §13 |

## 9. Next steps

1. Answer Q-041 (meaning of 100k) and Q-042 (pilot profile). Recompute §3.
2. Implement the k6 journeys with T-FND-03 scripts available. Run smoke on staging at RG-1.
3. Run the peak/stress/soak suite before RG-3 on production-equivalent sizing. Update J §4 sizing with measured numbers.
4. Revisit this plan when any §8 trigger appears, or before onboarding a customer that would move the platform from one scenario to the next.
