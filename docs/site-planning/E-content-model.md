# E — Content model (public website)

| Control    | Value                           |
| ---------- | ------------------------------- |
| Document   | E Content model for `apps/site` |
| Version    | 0.1.0-draft                     |
| Status     | Proposal                        |
| Owner role | Tech lead                       |
| Updated    | 2026-10-21                      |

Mock content lives in `apps/site/content/*.json` (C-070) and uses the same shapes the CMS will store (P-040), so WEB-A pages render CMS data unchanged later. Schemas are Zod; the section and site schemas go in `@hms/contracts` because editor, API and renderer share them (P-036); WEB-A-only helpers stay in `apps/site/src/content`. All content is fictional (P-032).

## 1. Conventions

| Convention          | Rule                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `LocalizedText`     | `{ "bn": string, "en": string }`, both non-empty. Used for every visitor-facing text field.                                              |
| `LocalizedRichText` | `{ "bn": string[], "en": string[] }`: paragraphs, no HTML.                                                                               |
| Slug                | lowercase ASCII, `a-z0-9-`, unique per entity; the same slug in both languages.                                                          |
| Money               | exact decimal string in taka, for example `"40700.00"` (ADR-007). Formatted with `formatMoney(..., { symbol: 'sign' })`. Never a number. |
| Time                | `"HH:mm"` 24-hour strings in the facility time zone (Asia/Dhaka); displayed through `@hms/i18n`.                                         |
| Weekday             | `"sat"                                                                                                                                   | "sun" | "mon" | "tue" | "wed" | "thu" | "fri"`; the week starts on Saturday, as on Bangladeshi hospital schedules. |
| Image               | `ImageRef { slot: string, src?: string, alt: LocalizedText }`. Without `src` the page shows the placeholder for `slot` (F section 6).    |
| References          | by slug, checked at build: a doctor's `department` must exist.                                                                           |

## 2. Entities

### Site, theme and navigation (`site.json`, CMS-editable, P-040)

Everything a hospital owner can change outside page bodies (C-072). In WEB-B this is the CMS "site settings", "theme" and "navigation" records.

| Field                     | Type                                                            | Notes                                                            |
| ------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| settings.hospitalName     | LocalizedText                                                   | CareSpate in WEB-A (C-069)                                       |
| settings.shortName        | LocalizedText                                                   |                                                                  |
| settings.contacts         | `{ hotline, hotlineOutsideDhaka, emergency, ambulance, email }` | display strings plus `tel:` values (FR-WEB-GEN-010)              |
| settings.socialLinks      | `{ network, url }[]`                                            |                                                                  |
| settings.defaultBranch    | Slug                                                            |                                                                  |
| theme.logo, theme.favicon | ImageRef                                                        | Bytespate placeholder (C-060)                                    |
| theme.primaryOverride     | token name or null                                              | WEB-A: null; WEB-B: contrast-checked (P-038)                     |
| navigation.topBar         | `MenuItem[]`                                                    |                                                                  |
| navigation.header         | `MenuItem[]`                                                    | `MenuItem { label: LocalizedText, href, children?: MenuItem[] }` |
| navigation.headerCta      | MenuItem                                                        | "Book appointment"                                               |
| footer.columns            | `{ title: LocalizedText, links: MenuItem[] }[]`                 |                                                                  |
| footer.note               | LocalizedText                                                   | for example copyright line                                       |
| notice                    | `{ enabled, text: LocalizedText }`                              | the demo notice in WEB-A (P-032)                                 |

### Page (`pages/<page>.json`, CMS-editable)

`Page { path, title: LocalizedText, seo: { title, description: LocalizedText, image?: ImageRef }, sections: Section[] }`. WEB-A ships `home`, `about`, `patients-and-visitors`, `emergency`, `portal`. Collection pages (doctor profile, department detail, ...) use fixed templates whose surrounding sections are also editable.

`Section { id, type, hidden: boolean, props }`, where `props` is validated by the schema of its `type` (P-036). Initial section catalog:

| Type                 | Props (summary)                                                                                 | Used on                                              |
| -------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `hero`               | heading, text, image, optional slides `{ image, link }[]` (C-085), search on/off, popular links | home                                                 |
| `quickActions`       | items `{ icon, label, href }[]`                                                                 | home                                                 |
| `serviceStrip`       | label, items `{ icon, label }[]` (C-085)                                                        | home                                                 |
| `departmentGrid`     | heading, count, "view all" link                                                                 | home                                                 |
| `centreCards`        | heading, centre slugs                                                                           | home                                                 |
| `featuredDoctors`    | heading, doctor slugs or "featured"                                                             | home                                                 |
| `packageShowcase`    | heading, categories                                                                             | home                                                 |
| `branchCards`        | heading                                                                                         | home, contact                                        |
| `articleList`        | heading, count, category                                                                        | home                                                 |
| `emergencyBand`      | heading, text, image                                                                            | home, emergency                                      |
| `richText`           | heading, paragraphs                                                                             | any                                                  |
| `imageText`          | heading, paragraphs, image, image side                                                          | any                                                  |
| `callToAction`       | heading, text, button                                                                           | any                                                  |
| `faq`                | items `{ question, answer }[]`                                                                  | guide pages                                          |
| `stats`              | items `{ value, label }[]`                                                                      | about (only real figures; hidden in WEB-A per P-032) |
| `gallery`            | images                                                                                          | about                                                |
| `appointmentRequest` | heading, text, department preselect (optional)                                                  | articles, stories, departments (FR-WEB-GEN-009)      |

### Department (`departments.json`, about 12)

| Field      | Type                                                               | Notes                                                     |
| ---------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| slug       | Slug                                                               |                                                           |
| name       | LocalizedText                                                      |                                                           |
| icon       | IconName                                                           | from `@hms/ui` (for example `heartbeat`, `brain`, `bone`) |
| summary    | LocalizedText                                                      | one sentence for cards                                    |
| overview   | LocalizedRichText                                                  |                                                           |
| services   | LocalizedText[]                                                    | procedures and services                                   |
| facilities | LocalizedText[]                                                    |                                                           |
| centre     | Slug?                                                              | centre of excellence it belongs to                        |
| image      | ImageRef                                                           |                                                           |
| floor      | LocalizedText                                                      | for example "Level 3, OPD 2"                              |
| opdHours   | `{ day: Weekday, sessions: { start: "HH:mm", end: "HH:mm" }[] }[]` | OPD consultation hours (FR-WEB-DEP-004)                   |

### Centre of excellence (`centres.json`, about 6)

`slug`, `name`, `summary`, `overview`, `departments: Slug[]`, `highlights: LocalizedText[]`, `image`.

### Doctor (`doctors.json`, about 24)

| Field          | Type                                                                                  | Notes                                                             |
| -------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| slug           | Slug                                                                                  |                                                                   |
| name           | LocalizedText                                                                         | fictional names only                                              |
| title          | LocalizedText                                                                         | for example "Senior Consultant"                                   |
| department     | Slug                                                                                  | must exist                                                        |
| branches       | Slug[]                                                                                |                                                                   |
| qualifications | LocalizedText                                                                         | for example "MBBS, FCPS (Medicine)"                               |
| languages      | `("bn"                                                                                | "en"                                                              | "hi" | "ar")[]` | languages spoken |
| about          | LocalizedRichText                                                                     |                                                                   |
| education      | `{ degree, institution, year }[]`                                                     | `degree`, `institution` LocalizedText; `year` number              |
| experience     | `{ role, place, from, to? }[]`                                                        | years as numbers                                                  |
| interests      | LocalizedText[]                                                                       | special interests, used by search                                 |
| schedule       | `{ day: Weekday, start: "HH:mm", end: "HH:mm", branch: Slug, room: LocalizedText }[]` | weekly chamber hours                                              |
| slotMinutes    | number                                                                                | used by the booking mock to split schedule ranges into times      |
| fee            | Money?                                                                                | sample consultation fee, labelled sample                          |
| featured       | boolean                                                                               | shown on the home page                                            |
| leave          | `{ from: "YYYY-MM-DD", to: "YYYY-MM-DD", message?: LocalizedText }[]`                 | leave notice (FR-WEB-DOC-006); WEB-B from ERP schedule exceptions |
| image          | ImageRef                                                                              |                                                                   |

### Health package (`packages.json`, about 10)

`slug`, `name`, `category: "general" | "women" | "men" | "senior" | "child" | "vaccine" | "corporate"`, `audience: LocalizedText`, `summary`, `groups: { title: LocalizedText, tests: LocalizedText[] }[]`, `preparation: LocalizedText[]`, `price: Money`, `image`, plus `code` (ASCII, for example `HCP-01`), `separatePrice: Money` (total if the tests are bought one by one; the saving is computed, never stored) and `doctorFeeNote?: LocalizedText` (FR-WEB-PKG-004).

### Test price (`tests.json`, about 40)

`code` (ASCII, for example `LAB-CBC`), `name: LocalizedText`, `category: "pathology" | "biochemistry" | "imaging" | "cardiology" | "other"`, `price: Money`, `preparation?: LocalizedText`, `reportTime: LocalizedText`, `branches: Slug[]`.

### Branch (`branches.json`, about 3)

`slug`, `name`, `address: LocalizedText`, `area: LocalizedText`, `hours: LocalizedText`, `phone`, `services: LocalizedText[]`, `emergency: boolean`, `image`, plus `head: { name: LocalizedText, title: LocalizedText }` (fictional) and `units: { name: LocalizedText, location: LocalizedText }[]` (FR-WEB-INF-007).

### Article (`articles.json`, about 6) and notice (`notices.json`, about 4)

Article: `slug`, `title`, `category: LocalizedText`, `excerpt`, `body: LocalizedRichText`, `author` (doctor slug, optional), `publishedOn: "YYYY-MM-DD"`, `image`. Notice: `id`, `title`, `body`, `publishedOn`.

### Job opening (`jobs.json`, about 4)

`id`, `title`, `department`, `type: "full-time" | "part-time" | "contract"`, `location` (branch slug), `closingOn: "YYYY-MM-DD"`, `summary`.

### Guide content (`guide.json`)

Sections for admission, discharge, visiting hours, what to bring, ward and cabin types (no prices, X8), international patients; each `{ id, title: LocalizedText, body: LocalizedRichText }`.

## 3. Mapping to the ERP (WEB-B, indicative)

| Site entity                                               | Future ERP source                                | Notes                                |
| --------------------------------------------------------- | ------------------------------------------------ | ------------------------------------ |
| Department                                                | ERP department / service point master (C02, C03) | public fields only                   |
| Doctor, schedule                                          | ERP practitioner + scheduling (C02, FR-SCH-*)    | the booking slots rule is FR-SCH-003 |
| Test price, package                                       | ERP service catalogue and tariff (C04)           | publication rules Q-078              |
| Branch                                                    | ERP facility (the hospital's facilities)         |                                      |
| Article, notice, guide, job                               | HMS website CMS (`mod-website`, C-072)           |                                      |
| Site settings, theme, navigation, footer, pages, sections | HMS website CMS, published snapshot              | P-037, P-040                         |
| Doctor public profile fields (photo, bio, interests)      | HMS website CMS, keyed by ERP practitioner ID    | P-042                                |

## 4. CMS storage (WEB-B, indicative)

Tables in `mod-website` (one installation, ADR-023): `website_site` (settings, theme, navigation as JSONB validated by the shared schemas), `website_page` (path, sections JSONB), `website_collection_item` (type, slug, data JSONB, order, archived), `website_media` (object key, mime, size, alt), `website_version` (immutable published snapshot, publisher, time), `website_form_submission`. Exact design belongs in the ERP [E](../planning/docs/E-database-design.md) when EP-32 is scheduled.
