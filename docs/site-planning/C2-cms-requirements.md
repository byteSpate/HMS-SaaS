# C2 — Website CMS requirements (EP-32)

| Control    | Value                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Document   | C2 Requirements for the website content management system                                       |
| Version    | 0.1.0-draft                                                                                     |
| Status     | Draft-for-review                                                                                |
| Owner role | Product owner + tech lead                                                                       |
| Updated    | 2026-10-21                                                                                      |
| Decision   | C-072: hospital owners can change every part of their website (hero to footer, text and images) |

The CMS (content management system) lets each customer hospital (C-067) edit its own public website without a developer. It is part of HMS: the editing screens live in `apps/site` (C-091). The current delivery is a fictional, browser-only demo (C-092). Future production persistence belongs in the ERP API and database, and the public site renders published data.

Production release: **WEB-B** (needs the API and database). The initial **T-CMS-DEMO-01** implementation needs neither. WEB-A prepares for it by using the same page and section format for its mock data (P-040).

## Confirmed scope update (2026-10-25)

C-086..C-090 in [A](A-decisions-and-questions.md) supersede conflicting proposals below. Each customer receives its own installation and domain. The same website editor saves drafts, previews and publishes without second-person approval. Pages use ready-made sections. Branding includes hospital name, logo, favicon and brand color, plus selectable themes and curated fonts supporting Bangla. The hospital selects public prices; ERP supplies amounts and finance controls changes. Subscription plan restrictions do not apply; technical upload safeguards do.

## Current demo boundary (C-091, C-092)

The CMS is under `apps/site/app/cms` and `apps/site/src/cms`, at `/cms/bn` and `/cms/en`. It uses only fictional CareSpate data, requires no account, and sends no API requests. Browser-local storage supports draft saving, demo publication, the latest 20 published snapshots, restoration to a draft and reset. The public website remains unchanged. Real data must never be entered into this demonstration.

Implemented demo areas: settings and branding (including existing image selection), menus and footer, page/SEO editing, custom demo pages, ready-made sections, saved draft and published previews, and version history. Collections, real uploads, form inbox, production authentication/permissions/auditing and ERP integration are future work. Preview uses its actual browser viewport; device emulation controls and drag ordering are not implemented. Both translations are required before saving, using the existing shared schemas.

The production requirements below remain the target, not claims that the demo implements secure publishing or persistent hospital data. NFR-CMS-001 now applies the shared staff design system to the editor inside `apps/site`.

## 1. Concepts

| Term              | Meaning                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site settings     | Hospital identity: names, logo, favicon, hotlines, emergency and ambulance numbers, email, social links, default language                                                                                             |
| Theme             | Allowed visual choices: logo, favicon, primary color override (contrast-checked), hero style. Selectable themes and curated fonts supporting Bangla; spacing and components remain controlled by the chosen theme     |
| Navigation        | Header menu, top-bar links and footer columns, all editable, in both languages                                                                                                                                        |
| Page              | A URL (`/about`, `/` home, custom pages) made of an ordered list of sections, plus title and search-engine fields                                                                                                     |
| Section           | One block of a known type (hero, quick actions, department grid, featured doctors, rich text, image and text, call to action, FAQ, gallery, ...) with typed fields. Sections can be added, removed, reordered, hidden |
| Collection        | Repeating content with its own pages: departments, centres, packages, tests and prices, branches, articles, notices, jobs, guide topics, doctor public profiles                                                       |
| Media library     | Uploaded images and files with alt text in both languages                                                                                                                                                             |
| Draft / published | Edits are drafts until published; the public site shows only the published version                                                                                                                                    |

## 2. Requirements

| ID         | Requirement                                                                                                                                                                                                                                                        | Status                                            | Verify |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------ |
| FR-CMS-001 | An authorized user edits site settings, theme, navigation and footer of their installation's website.                                                                                                                                                              | CONFIRMED (C-072), design PROPOSED                | T      |
| FR-CMS-002 | Pages are composed of sections from a fixed catalog of section types; each type has a schema shared by the editor and the site renderer. No free-form HTML, CSS or script.                                                                                         | PROPOSED (P-036)                                  | T      |
| FR-CMS-003 | Every text field holds Bangla and English; publishing warns when a language is missing and the site falls back per FR-CMS-014.                                                                                                                                     | PROPOSED                                          | T      |
| FR-CMS-004 | Sections can be added, removed, reordered (keyboard and drag) and hidden without deleting.                                                                                                                                                                         | PROPOSED                                          | T, U   |
| FR-CMS-005 | Collections (departments, centres, packages, tests and prices, branches, articles, notices, jobs, guide topics) have list, create, edit, archive and order screens.                                                                                                | PROPOSED                                          | T      |
| FR-CMS-006 | Doctor public profiles (photo, bio, interests, languages, featured flag) are edited in the CMS but attached to the ERP practitioner record; name, department and schedule come from ERP master data and scheduling, never duplicated.                              | PROPOSED (P-042)                                  | T      |
| FR-CMS-007 | Prices shown on the site come from the ERP service catalogue and tariffs; the hospital chooses which items are published, and finance controls price changes in ERP (C-088).                                                                                       | PROPOSED                                          | T      |
| FR-CMS-008 | Media library: upload images (JPEG, PNG, WebP) and PDFs to object storage (ADR-014) with size limits; images are resized and converted for the web; alt text in both languages is required.                                                                        | PROPOSED (P-039)                                  | T      |
| FR-CMS-009 | Live preview of a draft page in both languages at phone, tablet and desktop widths before publishing.                                                                                                                                                              | PROPOSED                                          | U      |
| FR-CMS-010 | Publish creates an immutable version of the site content; earlier versions can be viewed and restored. Optional scheduled publishing.                                                                                                                              | PROPOSED (P-037)                                  | T      |
| FR-CMS-011 | Every change and publication is audited (who, what, when), as for ERP records (FR-AUD-*).                                                                                                                                                                          | PROPOSED                                          | T      |
| FR-CMS-012 | Permissions: `website.content.edit`, `website.content.publish`, `website.theme.edit`, `website.settings.edit`, `website.media.manage`; edit and publish permissions are assigned together to the same website editor, with no second-person approval (C-086).      | PROPOSED                                          | T      |
| FR-CMS-013 | Theme color override is accepted only if every token pair passes the existing contrast test (C-060, `tokens.contrast.test.ts`); fonts come from a curated list supporting Bangla; component shapes follow the selected theme.                                      | PROPOSED (P-038)                                  | T      |
| FR-CMS-014 | The public site renders the last published version; a missing translation falls back to the other language with a `lang` attribute on that block.                                                                                                                  | PROPOSED                                          | T      |
| FR-CMS-015 | Publishing refreshes the affected public pages within one minute (on-demand revalidation).                                                                                                                                                                         | PROPOSED (P-041)                                  | T      |
| FR-CMS-016 | Custom pages: create a page at a new path from sections; reserved paths (`/doctors`, `/book-appointment`, ...) cannot be overwritten.                                                                                                                              | PROPOSED                                          | T      |
| FR-CMS-017 | Search-engine fields per page and per collection item (title, description, share image) in both languages.                                                                                                                                                         | PROPOSED                                          | T      |
| FR-CMS-018 | Forms on the site (contact, feedback, sample collection, query) deliver submissions to an inbox in the staff app, with spam protection; personal data retention follows the hospital's policy.                                                                     | PROPOSED, needs privacy review (AS-019 ends here) | T      |
| FR-CMS-019 | A new installation starts from a ready-made template site (the CareSpate demo content) that they then edit.                                                                                                                                                        | PROPOSED                                          | U      |
| FR-CMS-020 | Announcement popups: title, text, image, button and link, target pages, delay, display frequency (once per visit, once per day, always), start and end dates, order, on/off. Popups must be dismissible, keyboard-accessible and never block the emergency number. | PROPOSED (R1 X27)                                 | T      |
| FR-CMS-021 | Doctor availability notices: a planned leave or absence (from the ERP schedule exceptions) shows on the doctor's card and profile with an optional message until the return date.                                                                                  | PROPOSED (R1 X19), data source ERP                | T      |

## 3. Non-functional

| ID          | Requirement                                                                                                                     | Status   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- |
| NFR-CMS-001 | Editor screens follow DESIGN.md (the editor is in `apps/site`, C-091), keyboard-first, Bangla first.                            | PROPOSED |
| NFR-CMS-002 | A published site version is a single snapshot read by `apps/site`; rendering never runs editor code.                            | PROPOSED |
| NFR-CMS-003 | Uploaded files are scanned for type by content, not extension; SVG uploads are not accepted (script risk).                      | PROPOSED |
| NFR-CMS-004 | Accessibility cannot be broken by editing: required alt text, heading order enforced by section types, contrast-checked colors. | PROPOSED |
