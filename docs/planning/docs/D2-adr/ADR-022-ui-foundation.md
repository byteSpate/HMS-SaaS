# ADR-022 - UI foundation: visual system, in-house components, reuse rules

- **Status:** ACCEPTED by the product owner on 2026-10-15. Decisions C-052..C-060 in [A2 section 2.5](../A2-decision-register.md). Amends ADR-017 (items 3 and 5), F section 7.4 and F section 12. Fixes the open "shadcn or React Aria" choice of task T-UI-01.
- **Date:** 2026-10-15
- **Approver:** Product owner
- **Implements:** NFR-UX-001, NFR-ACC-001, FR-I18N-001, C-025, C-036

## Context

The staff web app is an operate-mode tool: people complete tasks at busy desks while a patient waits (F section 1). It must be bilingual with Bangla first, keyboard-first, accessible to WCAG 2.2 AA, usable on phone, tablet and desktop, and it is meant to be shown to and sold to several hospitals. The apps and packages are still stubs (`apps/web` is a placeholder page; `packages/ui` and `packages/i18n` are empty), so this is the moment to fix the visual foundation and the reuse rules before any screen exists.

Facts checked on 2026-10-15 while deciding:

- Tailwind 4.3.3 ships the `mist` neutral (a teal-tinted grey). Contrast was computed from its values: white text on teal-700 is 5.39:1 (passes 4.5:1), on teal-600 it is 3.66:1 (fails).
- Tiro Bangla exists only in Regular and Italic (weights 500 and 700 return HTTP 400 from Google Fonts). Noto Sans Bengali, TikTok Sans and Geist are available in a full weight range.
- Hue angles (OKLCH) of the colors already in use are teal 185, green 149, blue 263, purple 302, amber 58, red 27. Of all remaining Tailwind families, cyan (222) is the only one at least 37 degrees from every used hue.
- The Bytespate logo is a raster image (720x168 lockup, plus a square mark and a dark variant) whose brand colors are pure red and pure green.

## Decision

### 1. Visual character

Calm clinical utility. Neutral surfaces, high contrast, almost no decoration; the data is the interface. Dense, Excel-like layouts only in worklists and the lab result-entry grid. Every screen is designed and reviewed in Bangla first, then in English. Motion follows the frequency rule: nothing animates on keyboard-initiated actions.

### 2. Color tokens (light theme)

One system: tinted neutrals for about 90 percent of the UI, one primary color, semantic status colors. All values are CSS custom properties defined once in `packages/ui` (rule 9). Apps never contain a color literal.

| Token | Value | Use | Contrast |
| --- | --- | --- | --- |
| `--color-bg` | mist-50 `#f9fbfb` | Page background | |
| `--color-surface` | white | Cards, inputs, tables (data surfaces only) | |
| `--color-border` | mist-200 `#e3e7e8` | Decorative dividers, card edges | |
| `--color-border-strong` | mist-500 range | Input and outlined-button borders (must reach 3:1; exact value checked when tokens are written) | >= 3:1 |
| `--color-text` | mist-900 `#161b1d` | Body text | 16.7:1 on bg |
| `--color-text-muted` | mist-600 `#4b585b` | Secondary text | 7.4:1 on white |
| `--color-heading` | teal-950 `#022f2e` | Headings | 14.5:1 on white |
| `--color-primary` | teal-700 `#00786f` | Filled primary button, links, active nav, selected state | 5.4:1 with white label |
| `--color-primary-strong` | teal-800 `#005f5a` | Hover and pressed | 7.5:1 |
| `--color-primary-soft` | teal-50 `#f0fdfa` | Selected row, soft fills | |
| `--color-focus` | teal-600 `#009689` | Focus ring | 3.5:1 on bg (needs 3:1) |
| `--color-danger` | red-700 `#c10007` | Destructive button fill | 6.4:1 with white label |
| `--color-accent` | cyan-700 `#007595` | See rule below | 5.3:1 on white |

**Secondary is a button style, not a color:** white surface, `--color-border-strong` border, `--color-text` label, grey fill on hover.

**Accent rule.** Cyan is used only for: the second series in dashboard charts, a "New" marker, and shortcut-key chips. It is never a button, a status or a link, and it never carries meaning by itself (it is only 37 degrees from teal and 41 from blue; a word or icon always accompanies it).

**Primary rule.** Teal means "you can act on this". It is never used for a status.

### 3. Status colors

Status tokens are named by meaning, not by hue, so a hue can be tuned without touching screens. Every badge has a word and an icon; the icon takes the badge's text color (amber-600 and green-600 icons were measured at 2.9:1 on their tints and fail the 3:1 rule).

| Token prefix | Hue | Meaning | Fill / text | Examples (F section 6) |
| --- | --- | --- | --- | --- |
| `--status-idle` | grey | Nothing has happened yet, or closed | `#f1f3f3` / `#22292b` | Expected, Issued, To collect, Awaiting, Cancelled |
| `--status-active` | blue | Under way | `#dbeafe` / `#193cb8` | Waiting, Collected, In transit, Entered, Occupied |
| `--status-review` | purple | Held at a checkpoint by a person | `#f3e8ff` / `#6e11b0` | In consultation, Verified, Discharge requested |
| `--status-attention` | amber | Blocked until someone acts (money, cleaning) | `#fef3c6` / `#973c00` | Waiting for payment, Partly paid, Payment required, Needs cleaning |
| `--status-done` | green | Done, ready, OK | `#dcfce7` / `#016630` | Paid, Ready, Received, Released, Available |
| `--status-problem` | red | A problem or money still owed | `#ffe2e2` / `#9f0712` | Rejected (recollect), Dues |

Text contrast on the fills is 6.4:1 or better (13.3:1 for idle). If staff testing shows the purple adds confusion it collapses into `--status-active` with a different icon; that is a token change.

Paper is monochrome (A4 laser, 80 mm thermal, label printer). On print, color never carries meaning; the status word is always printed, and print tokens are a separate set (F section 12).

### 4. Themes

Light and dark token files are both created: `tokens-light.css` and `tokens-dark.css`. Dark is not implemented or QA'd yet, so it applies only when `data-theme="dark"` is set explicitly and never from `prefers-color-scheme`. `color-scheme: light` is declared. A hospital sees no dark theme until it is reviewed.

### 5. Typography

Three font tokens. One font stack serves both languages, so switching language never swaps families and mixed lines (a Bangla name followed by an English name) render correctly: the browser takes Latin glyphs from the first font and Bengali glyphs from the next.

| Token | English | Bangla | Used for |
| --- | --- | --- | --- |
| `--font-heading` | TikTok Sans | Noto Sans Bengali | Page and panel headings |
| `--font-body` | Geist | Tiro Bangla | Paragraphs, notes, help and empty-state text |
| `--font-ui` | Geist | Noto Sans Bengali | Labels, buttons, table headers, badges, inputs, money, MRN |

- Tiro Bangla has a single weight, so it is used for reading text only. Anything that needs weight uses the Noto Sans family. `font-synthesis: none` prevents faux bold.
- Fonts are self-hosted, no CDN at runtime (ADR-017). Body size 16 px with line height 1.6 for Bangla.
- Because the families are tokens, a different Bangla body face is a one-line change.

### 6. Device tiers and breakpoints

All three device classes are supported. Breakpoints are Tailwind's defaults; no custom values.

| Tier | Width | Tailwind | Design targets | Behavior |
| --- | --- | --- | --- | --- |
| Phone | below 768 | base, `sm` | 360 minimum, 390 to 430 typical | One column, bottom tab bar, tables become stacked rows, 44 px targets |
| Tablet | 768 to 1279 | `md`, `lg` | 768 portrait, 1024 landscape | Icon-rail sidebar, list and detail one pane at 768 and split at 1024, 44 px targets |
| Desktop | 1280 and up | `xl`, `2xl` | 1366x768 minimum, 1920x1080 | Full sidebar, split panes, compact tables, keyboard-first; content width capped at `2xl` |

**Phone scope (C-054).** On phone, full support for: login, choose hospital, language, doctor worklist and patient record view, ward list view, released lab report view, management dashboard. Payment taking, cashier session, registration with duplicate review, result entry, verify and release, price-list publish and audit search are tablet and desktop only. On a phone those screens show a plain panel ("Use a tablet or computer for this task", Bangla and English) instead of a squeezed layout.

### 7. App shell

- Desktop: 240 px collapsible sidebar plus a top bar (hospital and facility, `/` search, language, user menu).
- Tablet: 72 px icon rail plus the same top bar.
- Phone: top bar with search plus a bottom tab bar of at most 5 role items and "More".
- The patient banner is sticky under the top bar in patient context (F section 3).
- Login and choose hospital: one calm card on a tinted background, hospitals as large selectable rows (Bangla and English names), language switch top right, no photograph.
- Pattern inspiration is taken from the patient-facing apollohospitals.com site (search-first, a row of quick actions, language pill top right, phone bottom tab bar, visible helpline, doctor cards). Not taken: photo hero and video, orange and yellow accents, pill buttons everywhere, all-caps navigation, floating chat bubble. Patterns only; no brand assets or copy.

### 8. Components are built in-house

Every interactive widget is our own code on semantic HTML (`button`, `input`, `label`, `table`, `ul`). Not used: the native `<dialog>`, the Popover API, a native `<select>` appearance or `<input type="date">` pickers (a native date picker follows the operating system locale and is unreliable for Bengali digits), and no styled component kit (shadcn/ui, Radix Themes, React Aria Components as a kit).

Packages are allowed only for hard geometry or data problems, each recorded here:

| Allowed | For |
| --- | --- |
| Floating UI (positioning only) | Popover, tooltip and menu placement at screen edges |
| TanStack Table, Virtual, Query | Tables, long lists, server state (F section 12) |
| React Hook Form with the Zod resolver | Forms and shared validation (ADR-005) |
| next-intl | Message catalogs (ADR-017) |
| One icon family, bundled locally | Icons (rule 10) |

Adding a package to this list needs a line here and an owner decision.

**Quality gate for every primitive:** (a) a written keyboard contract following the WAI-ARIA Authoring Practices pattern, (b) tests written first that cover the contract, (c) an axe check in Playwright, (d) no merge without all three. The combobox and search input must not filter while text is mid-composition (Bangla phonetic input methods send composition events), and the minimum query length counts grapheme clusters (F section 9).

### 9. Reuse rules (single source of truth)

Reusability is a design rule of the app, not a preference. The layers, from bottom to top, all live in `packages/ui` unless noted:

| Layer | Contains | Rule |
| --- | --- | --- |
| Tokens | Colors, type, spacing, radius, motion, print tokens (`src/styles/`) | The only place a color or size literal may be written |
| Behavior hooks | Focus trap, roving focus, typeahead, outside-click, scroll lock, live region, controllable state | No styling; no domain words |
| Primitives | Button, Input, Checkbox, Radio, Switch, Select, Combobox, DateField, Dialog, Popover, Tooltip, Menu, Tabs, Toast, Badge, Skeleton | Built from hooks and tokens |
| Layouts | AppShell, AuthLayout, PageLayout, SplitPane, WorklistLayout, FormLayout, PrintFrame | Own all breakpoint logic. Screens never write shell or navigation breakpoints |
| Patterns | PatientBanner, InvoiceCard, StatusBadge, OutcomePanel, StaleIndicator, MoneyText, BilingualNameFields, SearchCombobox | Take plain props (no fetching, no API types). The web app maps contract DTOs to props |
| Screens | `apps/web` only | Compose layouts and patterns, hold data hooks. Contain no widget, no color and no breakpoint shell logic |

Formatting is also single-sourced: money, dates, digits and lakh/crore grouping come only from `packages/i18n` formatters, used by the screen, the receipt and the report alike.

Enforcement (requirements for T-UI-01 and CI, not built yet):
1. A lint rule forbids raw interactive elements (`button`, `input`, `select`, `textarea`, `dialog`) in `apps/web`; they come from `@hms/ui`.
2. A lint rule forbids hex, `rgb()` and `hsl()` literals and arbitrary Tailwind color values outside `packages/ui/src/styles`.
3. A lint rule forbids `Intl.NumberFormat`, `toLocaleString` and manual money or date formatting outside `packages/i18n`.
4. dependency-cruiser: `packages/ui` imports only `packages/i18n` (D section 5), never `apps/*` or `mod-*`.
5. A unit test computes WCAG contrast for every token pair listed in section 2 and 3 and fails below 4.5:1 for text or 3:1 for non-text parts.
6. Icons are imported only through one `Icon` component in `packages/ui`.

### 10. Icons

One family, bundled locally, accessed only through the `Icon` component so a family change is a one-file edit. Default: Phosphor, regular weight. Tabler is an accepted alternative if the owner prefers it; the choice is recorded when T-UI-01 starts.

### 11. Numbers and dates

Lakh and crore digit grouping in both languages, on screen and on print: `10,00,000.00`. Digits follow the UI language (C-036). The tenant setting from ADR-017 stays so another hospital can differ.

### 12. Branding for a product sold to hospitals

Two logo slots, not one. The **tenant logo** (the hospital's) appears in the shell and in every print header (F section 10). The **product brand** is a discreet "Powered by Bytespate". Until a hospital exists, the Bytespate logo fills the tenant slot as a placeholder; it must not sit beside status badges because its brand colors (pure red and green) read as status colors.

Tenant color override is **not** in RP-A. Tokens are built so a tenant could later supply one hue and have the primary scale generated automatically, refused if white text on the fill falls below 4.5:1. Status colors, danger and neutrals are never overridden. This needs a configuration screen (SCR-23) and its own decision when scheduled.

### 13. Motion

No animation on keyboard-initiated actions (focus search, row navigation, shortcuts). Press feedback `scale(0.97)` at 160 ms. Dialogs and popovers 150 to 200 ms ease-out, scaling from their trigger. Reduced motion is honored. Outcome messages are never toast-only for critical information (F section 7.3).

### 14. Shape and spacing

One radius scale: inputs and buttons 6 px, cards and panels 8 px, pills only for status badges. 4 px spacing grid. Rows 32 px compact and 40 px comfortable; 44 px targets on phone and tablet.

## Alternatives considered

| Alternative | Why not now |
| --- | --- |
| shadcn/ui on Radix | Fast, but the owner wants everything in-house and white-label-ready, and its default look must always be overridden |
| React Aria Components | Strongest keyboard and locale behavior, but a heavy kit; preferable if in-house primitives repeatedly fail the keyboard contracts in T-UI-01 |
| Radix Themes | Fastest, most opinionated look |
| Inter plus Noto Sans (ADR-017 proposal) | Replaced by the owner's font choice in section 5 |
| Orange, yellow, indigo, sky, rose and other accents | Each is 21 degrees or less from a status hue (measured) |
| Light only, no dark tokens | Owner asked for both token files now |

## Consequences

- **Positive:** one token source and one component set, so a hospital rebrand, a dark theme and a Bangla font swap are token changes; screens stay thin; accessibility is tested at the primitive, not rediscovered per screen.
- **Negative:** building primitives costs time up front and is the highest accessibility-risk part of the client; five hard widgets (dialog, combobox, menu, tabs, toast) must be built and tested before screens can move.
- **Mitigation:** the quality gate in section 8, the five-first build order in T-UI-01, and the option to adopt React Aria behavior hooks if a contract proves too costly (recorded as an alternative, not a plan).

## Evidence required

- The contrast unit test (rule 5) passes in CI.
- Each primitive has its keyboard contract, tests and an axe-clean Playwright check.
- The three lint rules and the dependency rule run in CI.
- Visual regression snapshots in Bangla and English at phone, tablet and desktop widths (ADR-017).
- Spike checks in T-UI-01, on real 1366x768 monitors: Tiro Bangla rendering at body size; Bengali digit alignment in money columns; Geist tabular figures for English money; the exact `--color-border-strong` value against 3:1.
- A vector (SVG) master of the logo before print templates (raster is acceptable for the placeholder only).

## Links

- [F UI/UX design guidance](../F-ui-ux-design.md), [ADR-017](ADR-017-localization.md), [ADR-002](ADR-002-nextjs-usage.md), [D section 5](../D-system-design.md)
- Product and visual records: `PRODUCT.md` and `DESIGN.md` at the repository root
