# C14 — Integrations and devices

| Control | Value |
| --- | --- |
| Module | `integration-*` adapters (run in the worker), `platform-inbox`, `platform-outbox` |
| Version | 0.4.0-draft |
| Status | Adapter principles PROPOSED (v0.3 direction). Every partner-specific detail is OPEN. **No compatibility is promised** before partner details are obtained and tested (v0.3 INTEGRATIONS). |
| Domain reviewer | Pilot IT + lab manager + finance |
| Sources | SRC-L07, SRC-L08, SRC-B04; v0.3 INTEGRATIONS |

## 1. Principles (PROPOSED, ADR-006)

1. Adapters translate external messages into internal commands. Domain modules do not parse device protocols.
2. Every inbound message is stored first (inbox), with source ID, tenant routing, raw payload (encrypted at rest when it contains patient data) and processing state.
3. Processing is idempotent by `(tenant, source_system, external_message_id)`.
4. Unmatched or invalid messages go to a **quarantine** queue for an authorized user to resolve. The system never attaches data to a guessed patient or sample.
5. Outbound effects (gateway requests, SMS) are sent from the outbox by the worker, never inside a database transaction.
6. Standards (HL7 v2, ASTM, FHIR, DICOM) are chosen per partner. None is assumed.

## 2. Requirements

| ID | Requirement | Status | Verify | Source |
| --- | --- | --- | --- | --- |
| FR-INT-001 | Integrations shall be implemented as versioned adapters with configuration per tenant (endpoint, credentials in the secret store, mapping version), recorded provenance, and replay tools for authorized operators. | PROPOSED | I, T | v0.3 INTEGRATIONS |
| FR-INT-002 | Analyzer result import (EXL-200 Blood Urea first, then others), creating `ENTERED` result versions (never auto-released, FR-LAB-024). | SOURCE-DERIVED; protocol OPEN (Q-047) | T (simulator) | SRC-L07 |
| FR-INT-003 | A duplicate analyzer message shall produce one result, and the duplicate shall be visible in the inbox log. | PROPOSED | T | v0.3 INTEGRATIONS |
| FR-INT-004 | A message whose sample ID or test code does not match shall be quarantined with the reason. An authorized user can map it to the correct specimen or discard it with a reason. | PROPOSED | T | v0.3 INTEGRATIONS |
| FR-INT-005 | Test-code, unit and attribute mappings per analyzer are versioned configuration (FR-LAB-016). | SOURCE-DERIVED | T | SRC-L08 |
| FR-INT-006 | Payment gateway adapter (e.g., bKash, card acquirer): signed callback verification, deduplication by provider reference, status inquiry for `UNKNOWN`, no trust in browser redirects (FR-BIL-021..023). | OPEN (Q-045) | — | SRC-B04 |
| FR-INT-007 | Barcode scanners operate as keyboard-wedge devices into focused inputs. Label and document printers are driven through the browser print dialog or a configured direct method (OPEN, Q-046). No local agent is installed unless approved. | PROPOSED | U | SRC-Q01 |
| FR-INT-008 | SMS / notification provider (appointment reminders, report ready). | OPEN (Q-049) | — | — |
| FR-INT-009 | Legacy data migration tooling: staged import into validation tables, reconciliation reports (counts, totals, samples), dry runs, then cutover import. | PROPOSED; scope OPEN (Q-048) | A | v0.3 OPERATIONS |
| FR-INT-010 | Accounting export. | OPEN (Q-029) | — | — |
| FR-INT-011 | Attendance device import. | OPEN (Q-030) | — | — |

## 3. Integration inventory template (to be completed per partner)

| Field | Content |
| --- | --- |
| Partner / device / version | e.g., analyzer make, model, firmware |
| Protocol and transport | e.g., ASTM over serial-to-TCP, HL7 v2 over MLLP, vendor REST |
| Connection route | Hospital LAN → secure tunnel → worker (design in [D §13](../D-system-design.md#13-integration-boundaries)) |
| Message identifiers | Sample ID field, test code field, message control ID |
| Delivery guarantee | At-least-once? Acknowledgment format? |
| Test environment | Simulator or sandbox availability |
| Mapping | Test codes ↔ catalogue; units; flags |
| Failure and recovery | Resend procedure; manual fallback |
| Acceptance contact | Name/role at the hospital and the vendor |

## 4. Acceptance examples

```gherkin
Scenario: Duplicate analyzer message (FR-INT-003)
  Given specimen S-2001 has Blood Urea ordered
  When the adapter receives message ID "EXL-0007" with Blood Urea = 32 mg/dL twice
  Then one ENTERED result exists for S-2001 Blood Urea
  And the inbox shows the second message as DUPLICATE

Scenario: Unknown sample is quarantined (FR-INT-004)
  When a message arrives for sample ID "S-9999" that does not exist in the tenant
  Then no result is created
  And the message appears in the quarantine list with reason "Unknown specimen"
```

## 5. Gaps

Q-045, Q-046, Q-047, Q-048, Q-049, Q-029, Q-030. National and government interfaces are DEFERRED (DEF-001).
