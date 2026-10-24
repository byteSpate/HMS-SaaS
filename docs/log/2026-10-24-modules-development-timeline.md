# Core modules and development timeline

- **Date:** 2026-10-24
- **Commit:** this commit
- **Implements:** stakeholder documentation request; preserves C-030 and C-031; summarizes ERP plan G and public website EP-31/EP-32

## What was built

Created an editable Word document and matching Markdown text covering 14 ERP module groups plus the public website/CMS workstream, their sub-modules, dependencies and a proposed 20-week AI-assisted development schedule. The estimate assumes three developers using AI coding agents and one QA engineer, targets RP-A pilot readiness at Week 8, feature completion at Week 18, acceptance at Week 19 and contingency/handoff at Week 20. Open decisions, conditional expansion scope and deployment ownership remain explicit.

## Files

| File                                                               | Purpose                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------- |
| `docs/deliverables/HMS-Core-Modules-and-Development-Timeline.docx` | Formatted stakeholder document                             |
| `docs/deliverables/HMS-Core-Modules-and-Development-Timeline.md`   | Reviewable content matching the Word document              |
| `docs/deliverables/README.md`                                      | Document index, estimate assumptions and maintenance notes |

## Decisions applied

- C-031 confirms RP-A as outpatient plus diagnostics, superseding older plan wording that called the release choice open.
- The owner explicitly set a maximum of 20 weeks for AI-assisted development. Weekly allocations and staffing remain proposed; no AI productivity multiplier is assumed and historical estimates remain non-binding under C-030.
- First-release billing reflects C-037 through C-043 and C-051; deposits, refunds, discounts and gateway settlement are not silently added.
- The newer website/CMS planning pack is included without treating mock forms as live services.
- Development and deployment remain separate under `docs/DEPLOYMENT.md`.

## Verification

- Generated the Word file using the bundled Python document runtime.
- Rendered the document with the documents skill renderer and visually inspected all seven pages; corrected the title style border and rechecked the final render.
- Checked that all 15 module groups and Weeks 1-20 appear, with one final contingency week.
- Cross-checked release scope, dependencies and exclusions against the decision registers and module specifications.
- Checked Markdown formatting and whitespace before committing. Application tests are not applicable to this documentation-only change.

## Known limitations

Staffing and durations are estimates. Existing implementation must be verified at kickoff; the document is not a completion audit. Finance, payroll, integrations and other open modules require early specification. Scope or staffing adjustments need owner agreement if required to preserve the 20-week cap. Calendar dates are intentionally unset until kickoff is agreed.

Deploy impact: none.

## How to debug

Compare the Markdown with the Word content and trace scope to the source references on the final page. After editing the Word file, rerun `render_docx.py` from the documents skill and inspect every generated page for overflow, split tables or title borders. Keep render intermediates outside the repository.
