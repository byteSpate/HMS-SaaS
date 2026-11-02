# T-PLT-06: observability baseline

- **Date:** 2026-11-02
- **Commit:** this commit
- **Implements:** T-PLT-06; NFR-OBS-001; FR-AUD-006; AT-JOB-005 alert metric; D section 8.6 and 12; K sections 3 and 5

## What was built

Logs now redact NID, passwords, cookies and tokens at any common depth. The API and the worker serve `/metrics` and `/health` on a separate `METRICS_PORT`: request duration by route pattern, job failures, queue depth, relay progress and Node defaults. When `OTEL_EXPORTER_OTLP_ENDPOINT` is set, each request produces a trace span carrying its correlation ID. The worker now has a real heartbeat, so `/health` turns unhealthy when its relay stalls.

## Files

| File                                               | Purpose                                         |
| -------------------------------------------------- | ----------------------------------------------- |
| `packages/platform/src/redaction.ts`               | Log paths that are never written                |
| `packages/platform/src/metrics.ts`                 | Metrics and the private server                  |
| `packages/platform/src/telemetry.ts`               | Optional traces                                 |
| `packages/platform/src/request-pipeline.module.ts` | Redaction, request metrics and spans            |
| `apps/api/src/main.ts`, `apps/worker/src/main.ts`  | Start telemetry and the metrics server          |
| `apps/worker/src/job-runtime.ts`                   | Job failure, queue and relay metrics; heartbeat |
| `apps/api/src/http/observability.spec.ts`          | Tests                                           |

## Decisions applied

- **`/metrics` is never on the public API port** (K section 5), so it needs no login and exposes nothing outside the private network.
- **Route patterns, never paths:** a real path could hold a patient ID. Unknown paths become `unmatched`, so a scan cannot grow the metrics without limit.
- **Spans are made by our middleware, not auto-instrumentation,** which needs a loader hook this ES module app does not use. Prisma and BullMQ spans are therefore not included.
- **prom-client, not OpenTelemetry metrics** (D section 12 allows either): Prometheus reads it directly.
- **`@opentelemetry/*` pinned at the versions D1 assessed** (0.223.0, 1.9.1), and denied the `protobufjs` install script, which only prints a notice.

## Verification

| Command                                             | Result                         |
| --------------------------------------------------- | ------------------------------ |
| `vitest run src/http/observability.spec.ts`, before | Failed: code missing           |
| Same, after                                         | 8 of 8                         |
| `pnpm audit --prod --audit-level=high`              | No known vulnerabilities found |
| Full suite                                          | In the pull request's CI run   |

## Known limitations

- **Redaction matches field names up to four levels deep.** A secret inside free text, or under another name, is not caught, so log calls must still hold IDs and codes only (FR-AUD-006).
- **AT-AUD-006 is partly met:** the test proves redaction with direct log calls. Log capture during registration and payment waits for T-PAT-01 and T-BIL-04.
- **Dashboards and alert rules** belong to T-OPS-03.
- **No DB pool or login failure metrics yet** (D section 12 lists them).

Deploy impact: new optional variables `METRICS_PORT` (default 9464) and `OTEL_EXPORTER_OTLP_ENDPOINT`. Keep port 9464 private. On one machine, set `WORKER_HEALTH_PORT=9465`; a port that cannot be opened only warns. No migration.

## How to debug

Read `GET http://<container>:9464/metrics`. A worker `/health` answering 503 means the relay has not succeeded for over 60 seconds, so check its log. If a value shows `[Redacted]` where you need it, log an ID instead. No traces arriving: check `OTEL_EXPORTER_OTLP_ENDPOINT` is the base URL, since `/v1/traces` is added for you.
