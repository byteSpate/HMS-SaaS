# Docs: one pull request per full feature

- **Date:** 2026-11-04
- **Commit:** this commit
- **Implements:** product owner decision of 2026-11-04 (git workflow); no task ID

## What was built

The product owner decided that a pull request is opened only when a full feature is implemented, not for each small task. The git workflow, the short version in CLAUDE.md and the pull request template now say so. A feature is one capability a user can try end to end, usually a group of tasks from one epic in G. Each task is one or more commits on the feature branch, with its log entry. Docs, chores and small fixes ride on the current or next feature branch. Hotfixes and releases keep their own pull requests. No release is planned for now.

## Files

| File                               | Purpose                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| `docs/GIT_WORKFLOW.md`             | Section 4 rule, branch names `feat/<epic>-<slug>`, commits per task |
| `CLAUDE.md`                        | Short version of the rule and the local checks before a task commit |
| `.github/pull_request_template.md` | Feature scope, every task listed, a log entry per task              |

## Decisions applied

- **Squash merge stays:** one commit per feature on `dev`, whose footer lists every task. The per-task history stays in the log entries.
- **Local checks replace per-task CI:** CI runs only on pull requests into `dev` or `main`, so the CI steps run locally before each task commit.
- **This change rides on the first feature branch,** `feat/PAT-patient-registry`, as the rule itself requires.

## Verification

| Check                            | Result                      |
| -------------------------------- | --------------------------- |
| Prettier on the changed files    | All use Prettier code style |
| Search for "one branch per task" | No remaining rule says so   |

## Known limitations

- **Larger pull requests take longer to review.** A feature PR holds several tasks; reviewers can read it commit by commit.
- **A bug found late in a feature** is fixed on the same branch, so CI feedback arrives only when the PR opens. Local checks are the guard until then.
- **The feature list for Phase 2** is a proposal until the product owner agrees it.

Deploy impact: none.

## How to debug

If a rule elsewhere still says one branch or one pull request per task, `docs/GIT_WORKFLOW.md` section 4 wins; fix the other text on the current feature branch.
