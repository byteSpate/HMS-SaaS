# ADR-002 — How Next.js is used

- **Status:** ACCEPTED by the product owner on 2026-10-14 (P-007). Next.js itself is CONFIRMED (C-003). Point 2 (server-side prefetch with the user's cookie) is amended by ADR-021.
- **Date:** 2026-10-12
- **Approver:** Tech lead

## Context

The staff application consists of authenticated, interactive workstation screens. Next.js offers server components, Server Actions, Route Handlers, Proxy and multiple caching layers. Each is another place where business data could be written or cached outside the API's authorization and transaction rules (v0.3 AGENTS). Next.js had critical React Server Components vulnerabilities in December 2025 and has a security release scheduled for 2026-10-14 (CX-019).

## Decision

1. All business reads and writes go through the NestJS API. **No Server Actions or Route Handlers write business data.** Route Handlers are allowed only for health and readiness.
2. Workstation screens are client components using TanStack Query against `/api/v1`. Server components render the shell and may prefetch with the user's cookie.
3. `proxy.ts` may redirect unauthenticated users to login. It is never relied on for authorization.
4. Authenticated routes are dynamic. Next.js caching is not used for tenant or patient data. Server-side fetches use `cache: 'no-store'`.
5. `output: 'standalone'` for Docker images. Keep Next.js patched within days of security releases.

## Alternatives

- **React + Vite SPA** for the staff app (static files, no Node runtime). Preferable if the server/client boundary causes repeated defects or the SSR runtime becomes an operational burden. It requires an owner decision, because Next.js is confirmed.
- **Full Next.js BFF** (Next.js server calls the API for every action). Rejected: it duplicates authorization concerns and adds a hop.

## Consequences

- **Positive:** one place for business rules; fewer cache-leak paths.
- **Negative:** some Next.js features stay unused; a client-heavy app ships more JavaScript.
- **Mitigation:** route-level code splitting.

## Evidence required

- A lint rule forbids `'use server'` in `apps/web` except in allow-listed files.
- A Playwright test proves logout clears client caches.
