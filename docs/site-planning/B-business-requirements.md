# B — Business requirements (public website)

| Control    | Value                                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document   | B Business requirements for the public website                                                                                                                                                        |
| Version    | 0.1.0-draft                                                                                                                                                                                           |
| Status     | Draft-for-review                                                                                                                                                                                      |
| Owner role | Product owner                                                                                                                                                                                         |
| Updated    | 2026-10-21                                                                                                                                                                                            |
| Inputs     | [A](A-decisions-and-questions.md), [R1](research/R1-competitor-analysis.md), ERP [B](../planning/docs/B-business-requirements.md), [C13](../planning/docs/C-srs/C13-reporting-printing-portal-b2b.md) |

## 1. Problem

Patients in Bangladesh look up a hospital online before they visit: which doctor, which day, what it costs, how to reach it. Hospitals buying the HMS ERP also need a public website, and today they run separate sites (often on old stacks) whose doctor lists, schedules and prices drift away from what the front desk actually uses. The HMS ERP already holds that data, so a public site built on the same platform can show the truth the desk works from.

## 2. Objectives

| ID     | Objective                                                                                                                                          | Status                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| BO-W01 | Show what a modern, bilingual hospital website built on HMS looks like, to win and onboard hospital customers.                                     | CONFIRMED (C-063, C-064)   |
| BO-W06 | Give every hospital tenant its own public website as part of the HMS subscription.                                                                 | CONFIRMED (C-067)          |
| BO-W07 | Let hospital staff change everything on their website (text, images, sections, menus, footer) without a developer, safely: preview, publish, undo. | CONFIRMED (C-072)          |
| BO-W02 | Let a visitor find the right doctor or department and see when that doctor sits, in two to three steps on a phone.                                 | PROPOSED                   |
| BO-W03 | Publish services, packages and prices from one source, so the website and the cashier agree (WEB-B).                                               | PROPOSED, depends on Q-078 |
| BO-W04 | Prepare the entry points for online booking and report download (FR-POR-002, FR-POR-003) without building them before their rules are decided.     | PROPOSED                   |
| BO-W05 | Rank in search in both languages (indexable pages, structured data).                                                                               | PROPOSED                   |

## 3. Stakeholders and users

| Role                                | Needs                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Patient / relative (primary)        | Find a doctor, schedule, location, price, emergency number; read in Bangla |
| Referring doctor / corporate client | Department capabilities, packages, contacts                                |
| Job seeker                          | Careers                                                                    |
| Hospital marketing / admin (WEB-B)  | Update doctors, packages, articles without a developer                     |
| Bytespate sales                     | A credible demo of the product                                             |

## 4. Scope by release

### WEB-A — frontend with mock data (this release)

PROPOSED scope (Q-072). Parity with continental.health plus the strongest extras from R1.

| Area                                  | Pages / features                                                                                                                                                                                                                                                                                                                                                                         | From                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Shell                                 | Top bar (hotline, emergency, language), header with mega menu, mobile menu, footer, demo notice                                                                                                                                                                                                                                                                                          | Continental, all                               |
| Home                                  | Hero with doctor/department search, quick actions, departments, centres, featured doctors, packages, branches, patient guide teaser, articles, emergency strip                                                                                                                                                                                                                           | Continental, all                               |
| Doctors                               | Directory with search and department/branch filters; profile with bio, education, experience, weekly schedule, location, book button                                                                                                                                                                                                                                                     | Continental, Ibn Sina (X3 filters)             |
| Departments and centres               | Lists and detail pages with services and doctors                                                                                                                                                                                                                                                                                                                                         | Continental, Square                            |
| Health packages                       | List with category filter; detail with test list and sample price; vaccine and corporate packages                                                                                                                                                                                                                                                                                        | Continental, Labaid (X17), Ibn Sina (X18)      |
| Test price list                       | Search a mock catalogue of tests and services with sample prices                                                                                                                                                                                                                                                                                                                         | Popular, Ibn Sina (X2)                         |
| Book appointment                      | Four-step mock wizard ending in a local demo confirmation                                                                                                                                                                                                                                                                                                                                | Continental                                    |
| Online report                         | Lookup form that explains the future process and shows a demo result (no real data)                                                                                                                                                                                                                                                                                                      | Evercare, Labaid, Popular (X1)                 |
| Patient and visitor guide             | Admission, visiting hours, what to bring, ward and cabin types (no prices), international patients                                                                                                                                                                                                                                                                                       | Square, Evercare, Ibn Sina (X8, X9, X11)       |
| Emergency                             | 24-hour emergency and ambulance page                                                                                                                                                                                                                                                                                                                                                     | All                                            |
| Branches and contact                  | Branch list with address, hours, hotline, map placeholder; contact form (mock)                                                                                                                                                                                                                                                                                                           | Evercare, Popular (X3)                         |
| Home sample collection                | Request form (mock)                                                                                                                                                                                                                                                                                                                                                                      | Popular (X4)                                   |
| Feedback                              | Feedback form (mock)                                                                                                                                                                                                                                                                                                                                                                     | Square, Labaid (X10)                           |
| Articles and notices                  | Health articles list and detail; notices                                                                                                                                                                                                                                                                                                                                                 | Evercare, Labaid, Ibn Sina (X13, X14)          |
| About and careers                     | About the (fictional) hospital; open positions list                                                                                                                                                                                                                                                                                                                                      | All                                            |
| Added from the full-site pass (C-074) | Doctor leave notice and related doctors on profiles; branch pages with branch head, units, map placeholder and branch-scoped doctor search; appointment request section for articles and stories; patient rights, admission and payment, discharge checklist; package table with original vs package rate; site-wide search; hotlines inside and outside Dhaka; OPD hours per department | R1 X19, X20, X21, X23, X25, X26, X28, X30, X33 |

Not in WEB-A: patient login and portal (EP-27), real booking, payment (X6), telemedicine (X5), live queue (X7), chat widgets (X15), testimonials (X12), body map (X16, stretch, Q-074).

### WEB-B — website CMS and ERP data (later)

Hospital owners edit every part of their site in HMS: hero to footer, text, images, menus, pages (C-072, EP-32, [C2](C2-cms-requirements.md)). Each hospital tenant gets its own site (C-067). Doctors, departments, schedules, branches, packages and service prices come from that tenant's ERP data through read APIs; content editing per Q-077; domains per Q-075. Depends on Q-075, Q-077, Q-078 and the ERP scheduling and billing catalogues.

### WEB-C — transactional (later)

Online booking (FR-POR-002), report download (FR-POR-003), portal login (FR-POR-001), payments (EP-29). Blocked by Q-033, Q-013, Q-045.

## 5. Business workflows (WEB-A, mock)

| ID     | Workflow                                                                                                                                                                                                              |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BW-W01 | Visitor searches a symptom area or department from the home hero -> department page -> picks a doctor -> profile shows weekly schedule -> "Book appointment".                                                         |
| BW-W02 | Visitor opens "Book appointment" -> chooses department and doctor -> date and time from the doctor's mock schedule -> patient name and phone -> review -> demo confirmation with a sample reference. Nothing is sent. |
| BW-W03 | Visitor checks a package or test price -> sees the sample price in taka with lakh grouping and the "sample price" label.                                                                                              |
| BW-W04 | Visitor in an emergency taps the always-visible emergency number.                                                                                                                                                     |
| BW-W05 | Visitor switches language on any page and lands on the same page in the other language.                                                                                                                               |

## 6. Success measures

| ID     | Measure                                                                 | Target (PROPOSED)                                |
| ------ | ----------------------------------------------------------------------- | ------------------------------------------------ |
| SM-W01 | Every WEB-A page exists in Bangla and English with no missing keys      | 100 percent (automated)                          |
| SM-W02 | Accessibility: no axe violations on any page in either language         | 0 violations                                     |
| SM-W03 | Mobile performance (Lighthouse, mobile preset)                          | Performance >= 90, LCP <= 2.5 s on the home page |
| SM-W04 | Find a doctor and reach their schedule from the home page               | <= 3 taps                                        |
| SM-W05 | Product owner review against continental.health layout, in Bangla first | Signed off in UAT-WEB-001                        |
