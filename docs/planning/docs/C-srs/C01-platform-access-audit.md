# C01 — Platform: access, audit, configuration, localization

| Control | Value |
| --- | --- |
| Module | Platform and access (`mod-identity-access`, `platform-audit`, `platform-config`) |
| Version | 0.4.0-draft |
| Status | Capabilities CONFIRMED (C-001, C-024, C-025, C-029). Mechanisms PROPOSED (P-008). Policy values OPEN (Q-051). |
| Domain reviewer | Product owner + hospital IT lead |
| Sources | C-001, C-024, C-025, C-029; SRC-A01, SRC-A02, SRC-N02, SRC-N10, SRC-Q02; v0.3 SAAS_PLATFORM, ACCESS_CONTROL |

## 1. Purpose and scope

This module covers:
- hospital and facility setup
- users, memberships, roles and permissions
- authentication and sessions
- audit evidence
- versioned hospital configuration
- bilingual UI behavior

It is a prerequisite for every other module.

**Out of scope here:** multi-facility groups (DEF-002), and single sign-on with external identity providers (a possible later ADR).

## 2. Actors

Hospital administrator, all staff users, system worker.

## 3. Requirements

| ID | Requirement | Status | Verify | Source |
| --- | --- | --- | --- | --- |
| FR-ACC-001 | Staff shall authenticate with a personal account (AS-016). Sessions are server-side and revocable. Credentials are never stored in browser storage. | CONFIRMED (C-029); mechanism PROPOSED (P-008) | T | SRC-A01 |
| FR-ACC-003 | Idle and absolute session timeouts shall be hospital-configurable (CP-12). The user shall receive a warning before idle expiry. | CONFIRMED capability; values OPEN (Q-051) | T | SRC-N02 |
| FR-ACC-004 | After a configurable number of failed logins, the account shall lock for a configurable period (CP-12). The lock reason, time and source shall be visible to the hospital administrator and to support diagnostics. | SOURCE-DERIVED | T | SRC-N10, SRC-A01 |
| FR-ACC-005 | After session expiry, a user with valid credentials shall be able to log in again immediately, with no administrator action, unless locked. A hung or expired session shall not prevent a valid re-login. | SOURCE-DERIVED | T | SRC-N02 |
| FR-ACC-006 | Roles configured as privileged (CP-12) shall require a second factor (TOTP). | PROPOSED (P-008; Q-051) | T | — |
| FR-ACC-007 | Administrators shall be able to reset a user's password, forcing a change at next login. Password rules (length, breached-password check) are product-fixed minimums plus hospital options. | PROPOSED | T | SRC-A01 |
| FR-ACC-008 | Administrators shall manage users, memberships and roles:<br>• roles start as copies of product templates (§5)<br>• permissions can be added or removed<br>• each membership has facility/department scope<br>All changes are audited. | CONFIRMED capability (SRC-A01); templates PROPOSED | T, U | SRC-A01, SRC-A02 |
| FR-ACC-009 | Every command and query shall enforce GP-1..GP-6 ([C00 §4](C00-srs-overview.md#4-global-preconditions-for-every-command-and-query)) on the server. Hidden buttons are not a control. | CONFIRMED (C-029) | T | v0.3 ACCESS_CONTROL |
| FR-ACC-010 | Revoking a membership, locking a user or removing a permission shall take effect on the user's next request. Sessions bound to a revoked membership are invalidated. | CONFIRMED (C-029) | T | v0.3 ACCESS_CONTROL |
| FR-ACC-011 | The system shall support segregation-of-duty constraints between named permission pairs (CP-13, CP-24) and return `SEGREGATION_OF_DUTY` when violated. | PROPOSED capability; pairs OPEN | T | — |
| FR-AUD-001 | Each sensitive action shall create an audit event with:<br>• actor user, membership and role set<br>• facility<br>• action code<br>• target record type, ID and version<br>• time (UTC instant)<br>• request correlation ID<br>• outcome<br>• reason (where required)<br>• before/after references (not full payloads)<br>"Sensitive" means every permission in [C00 §8](C00-srs-overview.md#8-permission-catalogue-and-approval-responsibilities) that changes state, plus FR-AUD-003 reads. | CONFIRMED (C-029) | T | SRC-A01, v0.3 ACCESS_CONTROL |
| FR-AUD-002 | Denied attempts at sensitive actions shall be audited with the denial code. | CONFIRMED (C-029) | T | v0.3 |
| FR-AUD-003 | These reads shall be audited:<br>• viewing an unmasked NID<br>• exporting any report<br>• downloading a stored document<br>The list is extendable by configuration. | PROPOSED list | T | v0.3 ACCESS_CONTROL |
| FR-AUD-004 | Audit events shall be append-only for the application database role (no update/delete). Retention is OPEN (Q-053). | CONFIRMED principle; mechanism PROPOSED | T | v0.3 |
| FR-AUD-005 | A hospital administrator shall be able to search the hospital's audit events by actor, action, record and time range. Results are paginated. | PROPOSED | U | — |
| FR-AUD-006 | Ordinary application logs shall not contain:<br>• clinical content<br>• full names with clinical context<br>• NID<br>• credentials, session tokens<br>• payment card data<br>Logs use record IDs and correlation IDs. | CONFIRMED (C-029) | I, T | v0.3 OPERATIONS |
| FR-CFG-001 | Administrators shall maintain masters:<br>• departments<br>• service catalogue (bn/en names)<br>• test catalogue<br>• practitioners<br>• price lists<br>• print templates<br>• numbering patterns<br>Newly saved master records shall be available in selection lists immediately (SRC-P03). | SOURCE-DERIVED | T, U | SRC-A02, SRC-P03 |
| FR-CFG-002 | Policy and price changes shall be published as versions with an effective time (immediate or future). Each publication is audited, with a preview and a human-readable change summary. Records created after the effective time use the new version. | CONFIRMED direction (P-004) | T | v0.3 SAAS_PLATFORM |
| FR-CFG-003 | Business numbers (MRN, invoice, receipt, specimen) shall be unique within the installation and generated by the server under concurrency, following CP-09 patterns. Gap-free numbering is **not** promised (OPEN: Q-034, DEF-001). | CONFIRMED uniqueness; format OPEN | T | v0.3 DATA |
| FR-CFG-004 | Hospital configuration (prices, policies, templates, numbering, lab ranges) shall be versioned with an effective time. Records shall keep the version they used. Publishing a new version shall not change existing records. | CONFIRMED direction (P-004) | T | v0.3 SAAS_PLATFORM |
| FR-CFG-005 | The hospital shall have one facility at installation (C-024). The data model shall support more facilities later without migrating existing records' identity. | CONFIRMED | I, T | C-024 |
| FR-CFG-006 | Before go-live, the system shall show a setup checklist. Go-live is blocked until required masters exist: facility timezone, at least one price list, numbering patterns, print header, one administrator with MFA enrolled (if CP-12 requires it). | PROPOSED | U | — |
| FR-I18N-001 | Each user shall be able to switch the staff interface between Bangla and English at any time. The choice persists per user, and the switch does not lose unsaved form input. | CONFIRMED (C-025) | T, U | C-025 |
| FR-I18N-002 | All staff-facing text shall come from message catalogs (`bn-BD`, `en`). The build shall fail on missing keys in either language. | PROPOSED mechanism for C-025 | T | C-025 |
| FR-I18N-003 | Names, addresses and free text shall accept Bangla and Latin script. Search shall normalize Unicode (NFC) so visually identical Bangla text matches. Transliteration between scripts is **not** promised. | CONFIRMED (C-025); search detail PROPOSED | T | C-025 |
| FR-I18N-004 | Print templates shall exist in Bangla and English. Bilingual layouts (both languages on one document) shall be supported for documents the hospital configures as bilingual. | CONFIRMED (C-025); per-document choice OPEN (Q-050) | U | C-025 |
| FR-I18N-005 | Digit style (Western or Bangla) and date format shall follow hospital configuration (CP-18) on screen and print. Stored values are locale-independent. | CONFIRMED capability; values OPEN (Q-050) | T | C-025 |
| FR-I18N-006 | Configuration data shown to staff or patients (service, test, department, ward names) shall have Bangla and English names. A missing translation falls back to the other language with a visible marker in administration screens. | PROPOSED | T | C-025 |
| FR-SUP-003 | Support diagnostics shall show account-lock causes, session failures and stuck jobs using IDs and reason codes, without clinical data (SRC-N10). | SOURCE-DERIVED | U | SRC-N10 |

## 4. Use cases

### UC-ACC-01 Log in

- **Actors / permission:** any staff user; no permission needed to authenticate.
- **Preconditions:** the user account exists and at least one membership is active.
- **Inputs:** username, password, TOTP code (if required).
- **Normal path:**
  1. The user submits credentials.
  2. The server verifies the password hash (argon2id, P-008).
  3. If the user's role set requires MFA, the server asks for TOTP and verifies it.
  4. The server creates a session bound to the membership, sets an httpOnly, Secure, SameSite cookie and returns the user's language preference and permission list (for UI rendering only).
  5. An audit event `auth.login.succeeded` is written.
- **Outputs:** session record; audit event.
- **Alternative paths:**
  - A1: the password must be changed (reset by admin) → the user sets a new password first.
- **Denied paths:**
  - D1: wrong password → generic "invalid credentials"; failure counter incremented; audit `auth.login.failed`.
  - D2: account locked → `ACCOUNT_LOCKED` with unlock time if time-based; the reason is visible to admins only.
  - D3: membership suspended → "Your access is not active".
- **Recovery:** R1: an expired session on any later request returns `UNAUTHENTICATED`. The UI keeps form data in memory and shows the login dialog in place (SP-11). After login the original request is retried with its idempotency key.
- **Requirements:** FR-ACC-001..006, FR-AUD-001.

### UC-ACC-02 Lock and unlock an account

- **Trigger:** failed-login threshold reached, or an administrator locks the account manually.
- **State machine:** `ACTIVE → LOCKED_TEMPORARY (auto-unlock at time) | LOCKED_ADMIN → ACTIVE (admin unlock, reason)`.
- **Denied:** an admin cannot unlock their own account (SP-04).
- **Requirements:** FR-ACC-004, FR-ACC-005, FR-SUP-003.

### UC-CFG-01 Publish a price list or policy version

- **Actor:** hospital administrator (`admin.price.publish` / `admin.config.publish`).
- **Normal path:**
  1. Copy the current version into a draft.
  2. Edit it.
  3. Validate it (no negative prices; every service has a price, or is flagged "not billable").
  4. Preview the differences.
  5. Publish with an effective time.
  6. Audit the publication.
  7. Invalidate caches through an outbox event.
- **Alternative:** A1: a future effective time → the version is scheduled; the current version stays in force until then.
- **Denied:** D1: publishing an effective time in the past → rejected (`VALIDATION_FAILED`). History is not rewritten.
- **Requirements:** FR-CFG-001, FR-CFG-002, FR-CFG-004.

## 5. Default role templates (PROPOSED)

Templates are starting points only. Each hospital confirms the grants (Q-003). Abbreviations match [C00 §8](C00-srs-overview.md#8-permission-catalogue-and-approval-responsibilities).

| Template | Typical permissions (summary) | Not included by default |
| --- | --- | --- |
| Receptionist (RCP) | patient search/register; appointments; check-in; visit create; direct diagnostic orders; invoice issue (if Q-039 allows) | payment record, discounts, refunds, identity reconcile |
| Cashier (CSH) | patient search; invoice view; payment record; cashier session; receipt reprint | discounts, refunds approval, method correction |
| Billing supervisor (BSV) | CSH + method correction, discount/refund approval (when enabled), line cancel | clinical permissions |
| Doctor (DOC) | worklist; consultation; orders; prescriptions; admission request; medical discharge; view released results | payment record (C-009), lab release |
| Nurse (NUR) | ward worklist; indents; returns; bed transfer (ward in-charge variant); cleaning complete (variant) | lab release, payment, stock adjustment |
| Lab technologist (LBT) | specimen collect/receive/reject; result enter; worklists | verify, release, amend |
| Lab authority (LBA) | LBT + verify, release, amend, lab configuration | billing |
| Pharmacy (PHA) | dispense; accept returns; pharmacy worklists | stock adjustment approval |
| Store keeper (STK) | transfers, receipt, adjustment request | adjustment approval, PO approval |
| Finance (FIN) | reports, exports, cashier session review | clinical data beyond billing context |
| Hospital administrator (ADM) | users, roles, configuration, price lists, audit view | **clinical actions** (an administrator does not sign or release by default) |
| Management viewer (MGT) | dashboards, reports (read-only), export (optional) | all writes |

## 6. Fixed rules versus configurable policy (this module)

**Fixed:**
- server-side enforcement
- audit append-only

**Configurable:**
- CP-12 (timeouts, lockout, MFA roles)
- CP-18 (language and format)
- CP-24 (segregation pairs)
- role grants
- numbering patterns (CP-09)

## 7. Acceptance examples

```gherkin
Scenario: Revoked membership stops access at the next request (FR-ACC-010)
  Given cashier "c1" has an open session in Alpha Hospital
  When an administrator revokes c1's membership
  Then c1's next request returns UNAUTHENTICATED
  And no payment can be recorded with the old session

Scenario: Valid re-login after a hung session (FR-ACC-005)
  Given nurse "n1" left a browser tab idle past the idle timeout
  When n1 enters correct credentials in the re-login dialog
  Then a new session is created without administrator action
  And the unsaved indent form content is still on screen

Scenario: Language switch keeps unsaved input (FR-I18N-001)
  Given receptionist "r1" has typed a patient name in the registration form in English UI
  When r1 switches the interface to Bangla
  Then all labels are shown in Bangla and the typed name is unchanged

```

## 8. Traceability

| Requirement | Decision / source | Command / query | Data | Permission | Tests |
| --- | --- | --- | --- | --- | --- |
| FR-CFG-002 / FR-CFG-004 | P-004 | `PublishPolicyVersion` | `policy_version`, `price_list_version` | `admin.config.publish` | AT-CFG-001..003 |
| FR-ACC-001..006 | P-008, SRC-N02/N10 | `Login`, `VerifyTotp` | `user_account`, `session`, `login_attempt` | — | AT-ACC-001..010 |
| FR-ACC-010 | C-029 | `RevokeMembership` | `membership` | `admin.user.manage` | AT-ACC-011 |
| FR-AUD-001..004 | C-029 | interceptor | `audit_event` | — | AT-AUD-001..006 |
| FR-I18N-001..006 | C-025 | — | `user_preference`, catalogs | — | AT-I18N-001..005, UAT-I18N-001..006 |

## 9. Gaps and open questions

- Q-051 (MFA scope, timeouts)
- Q-053 (audit retention)
- Q-055 (GitHub plan; affects nothing here)
- Q-050 (language details)
- Single sign-on with an external identity provider is not requested. If it is needed later, ADR-004 is revisited.
