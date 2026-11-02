# T-PRN-01: print and PDF spike

- **Date:** 2026-11-02
- **Commit:** this commit
- **Implements:** T-PRN-01; ADR-010; FR-PRN-005, FR-PRN-006; C-025; F section 10

## What was built

A new package, `@hms/print-templates`, renders a money receipt (A5) and a lab report (A4) from one HTML and CSS source, in Bangla, English or both. Chromium turns the same HTML into a PDF with embedded fonts and no network access. Sample PDFs are in `docs/deliverables/print-samples/` for a native speaker to review.

## Files

| File                                                       | Purpose                                   |
| ---------------------------------------------------------- | ----------------------------------------- |
| `packages/print-templates/src/document.ts`, `fonts.ts`     | Shared page, labels, escaping and fonts   |
| `packages/print-templates/src/receipt.ts`, `lab-report.ts` | The two templates                         |
| `packages/print-templates/src/templates.test.ts`           | HTML tests                                |
| `packages/print-templates/e2e/render-pdf.spec.ts`          | Renders and checks the PDFs               |
| `packages/print-templates/fixtures/samples.json`           | Synthetic data, with marked sample ranges |
| `packages/i18n/src/messages/*`                             | Print labels in both languages            |
| `docs/deliverables/print-samples/*.pdf`                    | Samples for review                        |
| `.github/workflows/ci.yml`                                 | Runs the PDF checks in CI                 |

## Decisions applied

- **Fonts are embedded in the page,** so the isolated renderer needs no network (ADR-010). Noto Sans Bengali covers both scripts, so bilingual lines stay even.
- **Static font weights, not the variable font:** Chromium draws a variable font as shapes (Type 3), which garbled the PDF's text layer. Static weights embed as real fonts and made the files about 5 times smaller.
- **Abnormal results are marked in words,** because reports are often printed in black and white.
- **Bilingual documents use Latin digits for now.** CP-18 will settle this per template.
- **Reference ranges in the samples are marked `SAMPLE`:** the product has no default ranges (CP-14, Q-011), and these are not clinical values.

## Verification

| Command                                         | Result                                                      |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `vitest run` before the templates were exported | Failed                                                      |
| Same, after                                     | 8 of 8                                                      |
| `playwright test` in `packages/print-templates` | 6 of 6: one page, right size, embedded fonts, no network    |
| Visual check of the sample PDFs by an AI agent  | Conjuncts and vowel signs look correct; not a native review |

## Known limitations

- **ADR-010's evidence is not complete:** a native speaker must review the Bangla in the samples (Q-050), and the printers still need UAT (Q-046, UAT-PRN-*). Automated checks cannot judge shaping quality.
- **ADR-010 stays PROPOSED** until then.
- **Searching Bangla inside a PDF may be imperfect:** the text layer holds every letter, but some vowel signs extract with an extra space. Printing is not affected.
- **`fonts.ts` reads files with Node,** so a browser print view (T-PRN-02) will need the fonts served another way.
- **The API does not render PDFs yet:** the `pdf-renderer` container (K section 3) belongs to deployment, and the job comes with T-LAB-08. This spike uses the Chromium that Playwright installs.
- **No print view route, `print_event` table or template versions yet:** those are T-PRN-02. Labels and barcodes are not covered (T-LAB-02).

Deploy impact: none. The package is not used by a deployed app yet.

## How to debug

Boxes or broken Bangla in a PDF mean the font did not load: check that `fontFaceCss()` found the woff2 files and that the renderer waited for `document.fonts.ready`. A second page means the content outgrew the `@page` size. To refresh the samples, run `pnpm --filter @hms/print-templates test:e2e`.
