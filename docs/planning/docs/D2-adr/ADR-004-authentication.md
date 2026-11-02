# ADR-004 — First-party session authentication in NestJS

- **Status:** ACCEPTED by the product owner on 2026-10-14 (P-008). MFA scope and timeouts: C-032 (Q-051). Cookie scope amended by ADR-021.
- **Date:** 2026-10-12
- **Approver:** Product owner (policy) + tech lead

## Context

- Staff need reliable login and re-login during long shifts (SRC-N02).
- Lock reasons must be visible (SRC-N10).
- Revocation must take effect immediately (FR-ACC-010).
- Each request runs within one selected tenant membership (FR-ACC-002).
- No customer has asked for single sign-on.

## Decision

- NestJS (`mod-identity-access`) owns authentication:
  - argon2id password hashes
  - opaque random session IDs in `httpOnly; Secure; SameSite=Lax` cookies
  - session rows in PostgreSQL (optional Redis lookup cache)
  - CSRF token header on state-changing requests, with an `Origin` check
- Session ID rotation on login and tenant switch.
- TOTP second factor for roles marked privileged (CP-12).
- Tenant-configurable lockout and timeouts.
- The vendor control plane uses a separate audience and credentials.

## Alternatives

| Alternative | When preferable |
| --- | --- |
| Keycloak (self-hosted IdP) | Customers require SSO/SAML/OIDC federation, or central identity across products |
| Hosted IdP | Data-location decisions allow it, and SSO is needed |
| Auth.js in Next.js | Rejected: authentication must live with the API that authorizes |
| Stateless JWT | Rejected for staff: revocation and session listing are harder |

## Consequences

- **Positive:**
  - one service
  - immediate revocation
  - simple audit
  - no extra JVM service on the VPS
- **Negative:** the team owns password, reset and MFA flows. These need security tests (H §11) and periodic review.

## Evidence required

Tests:
- AT-ACC-001..011
- a CSRF negative test
- a session-fixation test
- a lockout and diagnostics test
- a re-login-after-expiry test
