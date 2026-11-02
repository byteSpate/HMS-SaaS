# C10 — Emergency and Daycare

| Control | Value |
| --- | --- |
| Module | `mod-emergency` (emergency visits, staff-assigned priority), `mod-daycare` (same-day stays). Both reuse patient, billing and bed modules through their interfaces. |
| Version | 0.4.0-draft |
| Status | Temporary identity, staff-assigned priority and admission from emergency are CONFIRMED. Payment exceptions, triage categories and the Daycare definition are OPEN. **Specification level: GAP for clinical depth.** |
| Domain reviewer | Emergency lead; hospital operations (Daycare) |
| Sources | C-011, C-013, C-027; identity agreements; SRC-E01, SRC-P02, SRC-I03, SRC-N03; v0.3 EMERGENCY_DAYCARE |

## 1. Purpose and scope

**Emergency:** register any arriving patient within seconds, even when their identity is unknown. Record staff-assigned priority. Order urgent services. Move the patient to admission or referral without losing context.

**Daycare:** a same-day stay with bed occupancy shared with IPD (FR-IPD-018).

This module's main risk is a generic payment rule blocking urgent care. Until Q-005 is answered, emergency workflows are **not part of a release**, and the paper downtime procedure covers emergency billing exceptions ([B §9](../B-business-requirements.md#9-proposed-release-boundaries)).

## 2. Requirements

| ID | Requirement | Status | Verify | Source |
| --- | --- | --- | --- | --- |
| FR-EMG-001 | Emergency staff shall create an `EMERGENCY` visit for a known patient (fast search, FR-PAT-003) or a temporary identity (FR-PAT-004) with at most these required fields: sex (may be unknown), approximate age (may be unknown), arrival time. | CONFIRMED | T | Identity agreements, SRC-E01 |
| FR-EMG-002 | Staff shall record a priority category from a tenant-configured list (CP-23). The system records who assigned it and when, and keeps the history of changes. The software never computes or suggests a priority (C-027). | CONFIRMED (who/when); categories OPEN (Q-025) | T | Identity agreements |
| FR-EMG-003 | Emergency orders and charges shall use the standard order and billing interfaces, with source `EMERGENCY`. | SOURCE-DERIVED | T | SRC-E01 |
| FR-EMG-004 | Emergency payment exceptions (start before payment, authorizer, later settlement). | **OPEN (Q-005).** `billing.eligibility.override` is disabled. | — | C-011 |
| FR-EMG-005 | Admission from emergency (C-013) and referral out shall preserve the emergency visit as the source. | CONFIRMED | T | C-013 |
| FR-EMG-006 | Emergency patient entry and search must not fail because of phone or name formatting (FR-PAT-003) and must not depend on slow reference lists (target in [M](../M-capacity-performance.md)). | SOURCE-DERIVED | T, A | SRC-P02, SRC-E01 |
| FR-DAY-001 | Daycare admission, services, billing and discharge. | SOURCE-DERIVED capability; **definition OPEN (Q-026)** | — | SRC-E01 |
| FR-DAY-002 | Daycare occupancy shall use the same bed and occupancy model as IPD. A bed occupied by any stay type is unavailable to every other stay type. | SOURCE-DERIVED → fixed rule (FR-IPD-018) | T | SRC-I03 |
| FR-DAY-003 | Daycare patients appear on nursing worklists with correct details (FR-NUR-001). | SOURCE-DERIVED | T | SRC-N03 |

## 3. Acceptance examples

```gherkin
Scenario: Unknown patient registered in seconds (FR-EMG-001)
  Given an unconscious adult male arrives without identification
  When emergency staff create an emergency visit with sex "male", approximate age 40
  Then a TEMPORARY patient with an MRN and an EMERGENCY visit exist
  And the banner shows "Temporary identity"

Scenario: Priority is recorded, not computed (FR-EMG-002)
  Given the facility's configured categories are "Red", "Yellow", "Green" (synthetic labels)
  When nurse N3 sets "Yellow" and later Dr. Rahman changes it to "Red"
  Then history shows both assignments with actor and time
  And no category was set by the system
```

## 4. Gaps

The clinical content of emergency care is not specified:
- triage, observations and treatment documentation
- escalation
- payment exceptions
- the Daycare definition, resources and discharge duties

Required before any emergency or Daycare task is ready: Q-005, Q-025, Q-026 and sample emergency records.
