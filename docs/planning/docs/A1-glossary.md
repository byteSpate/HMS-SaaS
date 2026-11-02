# A1 — Glossary and terminology rules

| Control | Value |
| --- | --- |
| Document | A1 Glossary (authoritative vocabulary for documents, UI labels and code names) |
| Version | 0.4.0-draft |
| Status | Working vocabulary. Bangla labels are **PROPOSED** and need native-speaker and pilot review (Q-050). |
| Owner role | Product owner + domain lead; native-speaker reviewer for Bangla |
| Updated | 2026-10-12 |
| Supersedes | `baseline/.../docs/GLOSSARY.md` (meanings kept, terms added) |

## 1. Terminology rules

1. **One term, one meaning.** Use the term in the "Term" column in documents, the code identifier in code, and the label in the UI. Do not invent synonyms in specifications.
2. **Lifecycles are not collapsed.** Each of these pairs is a separate record with its own status, even when the UI shows them together:
   - appointment / visit
   - order / delivered service
   - prescription / dispensing
   - charge / invoice / payment / allocation
   - admission / bed occupancy
   - medical discharge / financial clearance / departure
3. **Statuses are nouns with defined transitions**, listed in the SRS module files. They are never free text.
4. **Legacy abbreviations** from the source documents (menu codes, permission codes) are not reused as identifiers unless their meaning has been confirmed (CX-006).
5. **Bangla labels** live in message catalogs, never in code identifiers (AS-012). A Bangla label in this table is a proposal until reviewed.

## 2. Certainty and planning terms

| Term | Meaning |
| --- | --- |
| CONFIRMED / SOURCE-DERIVED / PROPOSED / OPEN / DEFERRED | Status labels defined in [A2 §1](A2-decision-register.md#1-status-vocabulary). |
| Slice (vertical slice) | One complete staff outcome implemented through UI → API → database → permissions → audit → tests. Example: "cashier records doctor-fee payment". |
| Release boundary | The set of slices approved for a production release (Q-001). |
| Gate (RG-n) | A checkpoint with evidence criteria, defined in [N §5](N-traceability-readiness.md#5-release-gates). |
| Context packet | The bounded set of documents and facts given to a coding agent for one task ([G §5](G-implementation-plan.md#5-context-packet-for-each-agent-task)). |
| Integrator | The single role that owns shared files: Prisma schema, migrations, lockfile, `packages/contracts`, permission catalogue. |

## 3. SaaS and organization terms

| Term | Code name | Meaning | Proposed Bangla label |
| --- | --- | --- | --- |
| Tenant / customer organization | `tenant` | The hospital organization that subscribes to the product. All its data is isolated from other tenants. | প্রতিষ্ঠান |
| Facility | `facility` | A physical care location under a tenant. Initially exactly one per tenant (C-024). | হাসপাতাল শাখা / ফ্যাসিলিটি |
| Department | `department` | An operational unit, e.g. laboratory, emergency, cardiology OPD. | বিভাগ |
| Legal entity | `legal_entity` | An accounting entity. Not modeled until the finance scope is defined (Q-029). | — |
| User | `user` | A login identity for a person. A staff person has one user account (AS-016). | ব্যবহারকারী |
| Membership | `membership` | A user's validated link to a tenant, with facility scope and roles. A request runs within exactly one membership. | সদস্যপদ |
| Role | `role` | A named bundle of permissions, e.g. Cashier. Tenants may copy and adjust role templates. | ভূমিকা |
| Permission | `permission` | An atomic right named `module.resource.action`, e.g. `billing.payment.record`. | অনুমতি |
| Entitlement | `entitlement` | A module the tenant has purchased, e.g. LIS. It never grants a user anything (FR-SAA-004). | — (vendor-side term) |
| Policy version | `policy_version` | An effective-dated configuration value (price list, payment eligibility, lab range). Records keep the version they used. | — |
| Vendor operator | `vendor_operator` | A staff member of the SaaS vendor using the control plane. Has no routine patient-data access. | — |
| Support grant | `support_grant` | A time-limited, customer-approved, audited permission for a vendor operator to view specific tenant data. | সাপোর্ট অনুমতি |

## 4. Patient, scheduling and clinical terms

| Term | Code name | Meaning | Proposed Bangla label |
| --- | --- | --- | --- |
| Patient | `patient` | A person's identity within one tenant, retained across visits. | রোগী |
| MRN | `mrn` | Medical record number issued by the tenant. Unique within the tenant. Format OPEN (Q-034). | এমআরএন / রোগী নম্বর |
| NID | `nid` | National ID number. Optional, restricted view (FR-PAT-007). | জাতীয় পরিচয়পত্র নম্বর |
| Temporary identity | `patient.identity_status = TEMPORARY` | A placeholder identity for an unknown emergency patient, reconciled later. | অস্থায়ী পরিচয় |
| Practitioner | `practitioner` | A clinician's professional identity (degree, specialty). Not the same as an employee or payroll record. | চিকিৎসক |
| Schedule / session | `schedule`, `schedule_session` | A practitioner's bookable time block and its capacity. | সময়সূচি |
| Appointment | `appointment` | A booking for a future slot. Not attendance (C-007). | অ্যাপয়েন্টমেন্ট |
| Next visit | (UI label only) | Familiar term for a follow-up appointment (C-018). Stored as `appointment`. | পরবর্তী ভিজিট |
| Visit / encounter | `visit` | An actual attendance: OPD consultation, direct diagnostic, emergency. Created at check-in or arrival. | ভিজিট |
| Check-in | `CheckInAppointment` command | Converts a booking into an attended visit. | চেক-ইন / উপস্থিতি নিশ্চিত |
| Serial number (queue) | `visit.queue_number` | The patient's order number in the doctor's queue for a session. Rules OPEN (Q-037). | সিরিয়াল নম্বর |
| Service order | `service_order` | A request for consultation, test, imaging, procedure or other service. | সেবা অর্ডার |
| Direct diagnostic order | `order.source = RECEPTION_DIRECT` | A test ordered by reception without consultation, allowed only for tests configured as directly orderable (C-006, FR-ORD-001). | সরাসরি পরীক্ষা |
| Clinical document | `clinical_document` (+ versions) | Consultation note or other signed clinical record. Corrected by amendment. | ক্লিনিক্যাল নোট |
| Prescription | `prescription` | Clinician's medicine instructions. Does not move stock (C-012). | ব্যবস্থাপত্র / প্রেসক্রিপশন |
| Dispensing | `dispense` | The pharmacy physically issues medicine. Moves stock. | ওষুধ প্রদান |
| Outside fulfilment | `prescription.fulfilment = EXTERNAL` | Patient buys medicine elsewhere. No hospital stock effect. | বাইরের ফার্মেসি |
| Admission (IPD) | `admission` | An inpatient stay. May exist without a bed (C-014). | ভর্তি |
| Bed | `bed` | A physical bed. Has an operational status (available, occupied, needs cleaning, out of service). | শয্যা / বেড |
| Extra bed | `bed.kind = EXTRA` | A temporary bed added beyond the normal capacity, visibly tagged (SRC-I02). Rules OPEN (Q-007). | অতিরিক্ত বেড |
| Occupancy interval | `bed_occupancy` | The time interval during which an admission occupies a bed. | — |
| Transfer | `BedTransfer` command | Staff move an admission from one bed to another. Admission and MRN unchanged (C-015). | বেড স্থানান্তর |
| Cleaning | `bed_cleaning_task` | Required after a bed is vacated by discharge, before it becomes available (C-016). | পরিষ্কার-পরিচ্ছন্নতা |
| Medical discharge | `admission.medical_discharge_at` | Clinician decision that the stay ends. | মেডিকেল ছাড়পত্র |
| Financial clearance | `admission.financial_clearance` | Billing confirms the account is settled or otherwise cleared under policy (Q-006). | আর্থিক ক্লিয়ারেন্স |
| Departure | `admission.departed_at` | The patient physically leaves; the bed is vacated. | হাসপাতাল ত্যাগ |
| Daycare | `daycare_stay` | Same-day admission workflow from the sources. Definition OPEN (Q-026). | ডে-কেয়ার |
| Indent | `indent` | An internal request for medicines or items from a store or pharmacy. | ইনডেন্ট / চাহিদাপত্র |
| Medicine return | `medicine_return` | Return of issued medicine. Submission ≠ acceptance (Q-018). | ওষুধ ফেরত |

## 5. Laboratory and diagnostics terms

| Term | Code name | Meaning | Proposed Bangla label |
| --- | --- | --- | --- |
| LIS | — | Laboratory information system (this product's lab module). | — |
| Test definition (version) | `test_definition_version` | Configured test: specimen type, units, method, reference range, template. Versioned. | পরীক্ষার সংজ্ঞা |
| Specimen / sample | `specimen` | Collected material with a label/barcode, linked to one patient and one or more ordered tests. | নমুনা |
| Rejection | `SpecimenRejected` | A received specimen judged unusable. Reason kept; a linked recollection is created (C-019). | নমুনা বাতিল |
| Recollection | `specimen.recollection_of` | A new specimen replacing a rejected one, linked to it. | পুনঃসংগ্রহ |
| Result version | `result_version` | An immutable snapshot of entered values with the range/method/template versions used. | ফলাফল সংস্করণ |
| Verified | `result_status = VERIFIED` | Reviewed by an authorized person. Mapping to the source "prepared/verified/finalized" vocabulary is OPEN (CX-003, Q-009). | যাচাইকৃত |
| Released | `result_status = RELEASED` | Made available for delivery by an authorized person. Viewing or printing never changes this (FR-LAB-002). | প্রকাশিত / রিলিজড |
| Amendment | `result_version.amends` | A new released version correcting a previous release. The old version stays viewable as superseded. | সংশোধন |
| Report delivery | `report_delivery_event` | Handing a report to the patient, doctor, portal or B2B client. Separate from printing. | রিপোর্ট প্রদান |
| Reagent | `item.kind = REAGENT` | Lab consumable used when running tests. | রিএজেন্ট |
| RIS / PACS | — | Radiology information system / image archive. A full PACS is not implied (DEF-004). | — |

## 6. Billing and money terms

| Term | Code name | Meaning | Proposed Bangla label |
| --- | --- | --- | --- |
| Price list (version) | `price_list_version` | Effective-dated prices for services. Charges keep the version used. | মূল্য তালিকা |
| Charge | `charge` | An amount owed for one billable source event, with a unique source reference (FR-BIL-006). | চার্জ |
| Invoice / bill | `invoice` | A document grouping charges for payment. Types: `DOCTOR_FEE`, `SERVICE`, `IPD_RUNNING`, `PHARMACY` (types beyond C-008 are PROPOSED). | বিল / ইনভয়েস |
| Doctor fee invoice | `invoice.type = DOCTOR_FEE` | Separate invoice for the consultation fee (C-008). | ডাক্তারের ফি বিল |
| Service invoice | `invoice.type = SERVICE` | The single combined outpatient invoice for other visit services (C-008). | সেবা বিল |
| Invoice line | `invoice_line` | One charge on an invoice. Carries its own payment-eligibility status. | বিলের লাইন |
| Payment | `payment` | Money received, with actual method (C-010) and reference. | পেমেন্ট / পরিশোধ |
| Payment method | `payment.method` | `CASH`, `CARD`, `MOBILE`, `BANK_TRANSFER`, with an optional provider label such as bKash. | পরিশোধের মাধ্যম |
| Allocation | `payment_allocation` | The link that applies part of a payment to an invoice line or deposit account (P-020). | সমন্বয় |
| Receipt | `receipt` | Printable evidence of a payment and its allocations. | রসিদ / মানি রিসিট |
| Deposit | `deposit_account` | Money received in advance, held for an admission or visit and drawn down by allocation rules (Q-004, Q-040). | অগ্রিম / জামানত |
| Payment eligibility | computed | Whether a service line may start under the policy version: fully paid, or a permitted deposit rule satisfied (C-011). | পরিশোধ যোগ্যতা |
| Running account | `invoice.type = IPD_RUNNING` | The accumulating IPD invoice with interim payments (C-017). | চলমান হিসাব |
| Final bill | `IssueFinalBill` command | Closes the running account for settlement. | চূড়ান্ত বিল |
| Adjustment / reversal | `charge_adjustment` | A correction record. Posted amounts are never edited in place (P-013). | সংশোধনী |
| Discount | `discount` | An authorized reduction with reason and approver. Rules OPEN (Q-019). | ছাড় |
| Refund | `refund` | Money returned to the patient. Rules OPEN (Q-021). | ফেরত |
| Cashier session / day close | `cashier_session` | A cashier's shift from opening to closing count. Totals reconcile by method. | ক্যাশ সেশন / দিন শেষ |
| Source posting reference | `charge.source_ref` | Unique key `(tenant, source_module, source_type, source_id, source_event)` that prevents duplicate charges. | — |

## 7. Technical terms

| Term | Meaning |
| --- | --- |
| Modular monolith | One deployable API application composed of strictly bounded modules (ADR-001). |
| Worker | A separate process running background jobs from the same codebase. |
| RLS | PostgreSQL row-level security; a database-enforced second barrier for tenant isolation (ADR-003). |
| Tenant context | The `app.tenant_id` (and related) settings applied transaction-locally on the database connection. |
| Idempotency key | A client-generated unique key per user action, so retries return the original outcome instead of repeating it. |
| Outbox | A table written in the same transaction as a business change. A relay publishes its rows to queues afterwards (ADR-006). |
| Inbox | A table recording processed event IDs per consumer, used to discard duplicates. |
| Expand / contract migration | A two-step schema change: add the new structure, migrate, switch code, then remove the old one in a later release. Keeps old and new app versions compatible. |
| RPO / RTO | Recovery point objective (tolerable data loss) / recovery time objective (time to restore). Values OPEN (Q-043). |
| p95 | 95th percentile latency: 95% of requests are faster than this value. |
| VPS | Virtual private server rented from a hosting provider (C-026). |
| GHCR | GitHub Container Registry. |

## 8. Words to avoid

| Avoid | Use instead | Why |
| --- | --- | --- |
| "Paid" (for a visit) | "Doctor fee invoice paid" / "Service line eligible" | Visits have several invoices (C-008). |
| "Delete" (for results or bills) | "Cancel", "Reverse", "Amend" | Evidence is never deleted (C-029). |
| "Discharged" alone | "Medically discharged", "Financially cleared", "Departed" | These are three separate events (Q-006). |
| "Finalized" (lab) | "Released" | Until Q-009 confirms the mapping (CX-003). |
| "Customer" for a patient | "Patient" | "Customer" means the tenant. |
| "Admin" alone | "Hospital administrator" or "Vendor operator" | These have different powers. |
