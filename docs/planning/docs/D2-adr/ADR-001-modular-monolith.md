# ADR-001 — Modular monolith with a separate worker process

- **Status:** ACCEPTED by the product owner on 2026-10-14 (P-001, P-004).
- **Date:** 2026-10-12
- **Approver:** Tech lead

## Context

Core hospital actions span several domains in one atomic step:
- A cashier payment updates allocation, line eligibility, receipt numbering, audit and outbox (AD-1).
- Lab collection checks billing eligibility (AD-2).
- Dispensing moves stock and posts charges.

The product is hosted on VPS infrastructure (C-026) and built largely by AI coding agents (C-004). Agents need clear module ownership to work in parallel without entangling code (v0.3 MODULES).

## Decision

- Build **one NestJS API application** and **one NestJS worker application**. Both compose the same domain packages (`packages/mod-*`) from a Turborepo monorepo, over **one PostgreSQL database**.
- Each module owns its tables and exposes a public application interface (`index.ts`). Cross-module calls are in-process and share the caller's transaction.
- Boundaries are enforced by dependency-cruiser and ESLint rules in CI (NFR-MAINT-001).
- Hospital-specific behavior is expressed as **versioned configuration** (policy versions), never as customer-specific code branches (P-004).

## Alternatives

| Alternative | Why not now | When preferable |
| --- | --- | --- |
| Microservices per domain | Turns payment gates and charge posting into distributed transactions; many deployables on a VPS | Independent teams with divergent scaling needs and proven module stability |
| Unstructured monolith | Agents would cross-write tables; ownership erodes | Never |
| Single-tenant install per hospital | N upgrades and N databases; contradicts C-001 | Premium dedicated customers (DEF-005) |

## Consequences

- **Positive:**
  - atomic cross-module commands
  - simple deployment and local development
  - extraction possible later because tables and interfaces are owned
- **Negative:**
  - one deployable means one release cadence
  - a bad module can affect the process (mitigated by tests, timeouts and separate worker processes for heavy jobs)
- Shared files (Prisma schema, migrations, lockfile) need an integrator role (G §6).

## Evidence required

The scaffold (T-FND-02) shows two modules with lint-enforced boundaries. A deliberate violation (billing importing lab internals) fails CI.
