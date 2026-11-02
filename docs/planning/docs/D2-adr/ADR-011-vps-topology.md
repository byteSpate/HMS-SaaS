# ADR-011 — Single-VPS Docker Compose start with an expansion path

- **Status:** PROPOSED (P-015). Requires product-owner acceptance of single-host risk.
- **Date:** 2026-10-12
- **Approver:** Product owner

## Context

- VPS hosting is confirmed. No provider, size or topology is chosen (C-026).
- Availability and recovery objectives are OPEN (Q-043).
- The pilot load is unknown (Q-042).

## Decision

**Production v1:** one VPS running Docker Compose with:
- Caddy
- web
- api (2 replicas, PROPOSED)
- worker
- pdf-renderer
- PostgreSQL 18
- Redis-protocol server

Off the VPS:
- object storage at a provider, in a different failure domain
- pgBackRest repository with continuous WAL archiving (separate credentials, ideally a different provider or region)
- monitoring/tools VPS: Prometheus, Grafana, Loki, Alloy targets, SonarQube

Staging mirrors production on a smaller VPS with synthetic data.

**Expansion path** ([J §13](../J-vps-deployment-operations.md#13-upgrade-paths-beyond-one-vps)), triggered by measurements ([M §8](../M-capacity-performance.md#8-bottleneck-detection-and-expansion-triggers)):
1. Move PostgreSQL to its own VPS.
2. Add a streaming replica (standby + read reports).
3. Run the app on two VPSs behind a load balancer.
4. Separate Redis.
5. Database-per-tenant or dedicated deployments for large customers (DEF-005).

## Alternatives

- **Managed Kubernetes.** Over-complex for the start.
- **Managed PostgreSQL.** Preferable when the provider offers it and data-location decisions allow (Q-044), because it reduces backup and failover burden.
- **Two VPSs from day one** (app + DB). Preferable if Q-043 requires higher availability than one host can offer.

## Consequences

- **Single point of failure:** a host outage means downtime until restore or failover. The paper downtime procedure (RB-03) and the restore drills (RB-07) are mandatory before go-live.
- **Planned maintenance windows** needed for OS updates.

## Evidence required

- Restore drill timings (NFR-REC-001).
- A load test on staging-equivalent sizing (M).
