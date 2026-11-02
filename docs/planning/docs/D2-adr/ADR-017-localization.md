# ADR-017 — Bilingual UI and print implementation

- **Status:** PROPOSED (P-022). The bilingual requirement is CONFIRMED (C-025). Details OPEN (Q-050). Items 3 (digit grouping) and 5 (fonts) are amended by ADR-022.
- **Date:** 2026-10-12
- **Approver:** Product owner + native-speaker reviewer

## Context

Staff switch between Bangla and English per user, and printouts are bilingual (C-025). Bangla script needs fonts with correct shaping, Unicode normalization for search, and attention to text length in layouts.

## Decision

1. **UI text:** `next-intl` with ICU message catalogs `bn-BD` and `en` in `packages/i18n`.
   - Keys are English identifiers.
   - CI fails on missing keys or unused keys (FR-I18N-002).
   - Server error messages are localized by `code`. The API returns the code plus English detail, and the UI renders the localized message.
2. **Language choice:** per-user preference stored server-side. The `lang` attribute is set on `<html>`. Switching does not reload form state (FR-I18N-001).
3. **Formatting:**
   - `Intl` APIs with a tenant setting for digit style (`latn` or `beng` numbering system) and date pattern (CP-18)
   - money always shows 2 decimals with the BDT symbol or code per template
   - stored values are locale-neutral
4. **Data in two scripts:**
   - person names: `name_bn`, `name_en` (at least one)
   - configuration names: `name_bn`, `name_en`, with fallback marking
   - search normalizes to NFC and uses trigram indexes on both fields
5. **Fonts:** self-hosted Noto Sans Bengali (or the hospital's approved font) and Noto Sans/Inter for Latin, in UI and PDF. No external font CDN at runtime.
6. **Print templates:** per document type and language variant (`bn`, `en`, `bilingual`). The template version records the variant.
7. **Glossary-driven terminology:** labels come from [A1](../A1-glossary.md). The native reviewer approves before RG-3.

## Alternatives

- **i18next/react-i18next.** Equally capable. Preferable if the team already standardizes on it.
- **Machine translation at runtime.** Rejected: clinical and financial terminology needs reviewed text.

## Consequences

- Every UI task includes both catalogs, so the context packet carries the glossary.
- Layouts must tolerate longer Bangla strings and different line heights.

## Evidence required

- Catalog completeness check.
- Visual regression snapshots in both languages.
- UAT-I18N-*.
