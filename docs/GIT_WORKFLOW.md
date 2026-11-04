# Git workflow

Agreed by the product owner on 2026-10-14; one pull request per feature since 2026-11-04 (section 4). Applies to people and AI agents. The short version is in [CLAUDE.md](../CLAUDE.md).

## 1. Branches

| Branch        | Purpose                                                                     | Changes only through                 |
| ------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| `main`        | Deployable code only. Every deploy comes from `main`.                       | Release PRs from `dev`, hotfix PRs   |
| `dev`         | Integration branch and GitHub default branch. All features land here first. | Squash-merged PRs from work branches |
| work branches | One per feature, created from `dev`, deleted after merge                    | Commits by the author                |
| `hotfix/*`    | Urgent fix for production, created from `main`                              | Commits by the author                |

Never commit directly to `main` or `dev`.

```text
main  ---o----------------o------------   release PRs (merge commit) + tag vX.Y.Z
          \              ^
dev   -----o--------------o---o---------   one squash commit per feature
            \            ^
feat/PAT-patient-registry  o o o o        one branch per feature, commits per task
```

## 2. Branch names

A feature branch is `feat/<epic>-<short-slug>`, where the epic is the task prefix in G (`PAT`, `SCH`, `BIL`). Other branches are `<type>/<task-id>-<short-slug>`. Slugs are lowercase with hyphens:

| Type       | Use for                             | Example                               |
| ---------- | ----------------------------------- | ------------------------------------- |
| `feat`     | A full feature (section 4)          | `feat/PAT-patient-registry`           |
| `fix`      | A bug fix                           | `fix/T-BIL-04-receipt-total`          |
| `refactor` | Code change with no behavior change | `refactor/T-PLT-01-idempotency-store` |
| `test`     | Tests only                          | `test/T-DB-03-two-tenant-fixtures`    |
| `docs`     | Documentation only                  | `docs/phase0-answers`                 |
| `chore`    | Tooling, CI, dependencies           | `chore/ci-dev-branch`                 |
| `hotfix`   | Urgent production fix from `main`   | `hotfix/login-500-on-expired-session` |

Use the task ID when there is one. Without one, the slug alone is fine (`docs/git-workflow`). Branch types other than `feat` and `hotfix` are rare now: small work rides on a feature branch (section 4).

## 3. Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) format:

```text
<type>(<scope>): <subject>

<body: why the change was made, what it affects>

Refs: T-ACC-01
```

- **type:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`, `ci`.
- **scope:** the area, e.g. `auth`, `database`, `billing`, `lab`, `web`, `api`, `ci`, `docs`.
- **subject:** imperative ("add", not "added"), lowercase start, no full stop, at most 72 characters.
- **body:** optional for small changes; explain the why, not the what.
- **footer:** `Refs: <task IDs>` when the commit belongs to a task. `BREAKING CHANGE: <what>` if it breaks an API contract.
- **Plain ASCII punctuation only** (no em dashes, curly quotes or arrows), same rule as code.
- **No AI attribution:** no `Co-Authored-By: Claude`, no "Generated with Claude Code". `.claude/settings.json` turns it off.

On a feature branch, each task is one or more commits with that task's `Refs:` footer and its `docs/log/` entry. They are squashed when the PR merges.

## 4. Pull requests into `dev`

### One pull request per full feature (product owner, 2026-11-04)

A pull request is opened only when a **full feature** is implemented, never for a single small task.

- **A full feature** is one capability a user can try from start to finish, with its API, database, permissions, audit, screens and tests. It is usually a group of tasks from one epic in G, for example patient registry (T-PAT-01..04) or practitioners and scheduling (T-PRA-01, T-SCH-01..02). The feature list for a phase is agreed with the product owner before work starts.
- **Tasks are commits, not pull requests.** All tasks of the feature are built on one branch from `dev`.
- **Small work gets no pull request of its own:** docs, rule changes, chores, dependency bumps and small fixes ride on the current feature branch, or wait for the next one. If no feature branch is open, keep them on a local branch until one starts.
- **Checks before each task commit:** CI runs only on pull requests, so run the CI steps locally first: `pnpm format:check`, `pnpm turbo run build lint typecheck`, `pnpm boundaries:check` and `pnpm turbo run test`.
- **Push the branch to all three remotes** after each task, as a backup (section 7).
- **Exceptions:** hotfixes into `main` (section 6) and release pull requests (section 5) keep their own pull requests.

### Steps

1. Branch from an up-to-date `dev`: `git switch dev && git pull origin dev && git switch -c feat/<epic>-<slug>`.
2. Build the feature task by task (commits above), pushing to **all three remotes** (section 7). When the whole feature is done, open the PR on `origin` (byteSpate/HMS-SaaS) with base `dev`.
3. **PR title** = the future squash commit: `feat(patient): registration, search and identity edit (T-PAT-01..04)`. The squash commit's footer lists every task: `Refs: T-PAT-01, T-PAT-02, T-PAT-03, T-PAT-04`.
4. Fill in the PR template (what, why, the tasks included, tests run, log entries, screenshots for UI).
5. **CI must be green** before merging.
6. **Review:** the other team member reviews. When an AI agent wrote the code, a human reviews it before merge.
7. **Squash merge**, then delete the branch on all three remotes.

A PR must contain, in the same change: tests for the behavior, the `docs/log/` entry, updated docs if a rule or decision changed, and both language catalogs for UI text.

## 5. Releases into `main`

1. When a set of features on `dev` is tested, open a PR `dev` -> `main` titled `release: vX.Y.Z`.
2. CI green, then **merge commit** (not squash), so `main` keeps the feature history.
3. Tag the merge commit and push the tag to all three remotes:
   `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z && git push reza vX.Y.Z && git push noman vX.Y.Z`
4. Versions follow [SemVer](https://semver.org/). Before the pilot go-live, versions stay at `0.x.y`: `0.(minor+1).0` for a release with features, `0.x.(patch+1)` for fixes only.
5. Only `main` (or a tag on it) is deployed.
6. **Merging to `main` does not deploy.** Staging runs from `main`, and the person who owns the server pulls it by hand and runs the redeploy script (see [DEPLOYMENT.md](DEPLOYMENT.md)). Developers and AI agents stop at the merge and the tag.
7. **Release PR description:** add a "Deploy impact" list that collects every change since the last release that needs something from the server: new environment variables, migrations (expand-only or contract), new services or apps, build steps, origin or CORS changes, tool version bumps. Use the table in DEPLOYMENT.md section 4. Write `Deploy impact: none` if there is nothing. The deployer reads this list before pulling `main`.
8. **Release content rule:** a release must not include a migration that is unsafe to apply while the previous version still runs (expand first, contract in a later release), because migrations run automatically on deploy and a code rollback does not undo them.

## 6. Hotfixes

1. `git switch main && git pull origin main && git switch -c hotfix/<slug>`.
2. Fix with a test, PR into `main`, CI green, merge commit, tag a patch version.
3. Merge `main` back into `dev` straight away (`git switch dev && git merge main`), so the fix is not lost.

## 7. Remotes

Every branch and tag is pushed to all three remotes:

```bash
git push origin <branch> && git push reza <branch> && git push noman <branch>
```

| Remote   | Repository         | Role                                                                           |
| -------- | ------------------ | ------------------------------------------------------------------------------ |
| `origin` | byteSpate/HMS-SaaS | Main repository; PRs and CI live here                                          |
| `reza`   | rezaulrht/HMS-ERP  | Backup 1 (full mirror)                                                         |
| `noman`  | NOMAN1802/HMS-SaaS | Backup 2 (full mirror; renamed from HMS-ERP, the repository the server clones) |

After a branch is merged, delete it everywhere: `git push origin --delete <branch> && git push reza --delete <branch> && git push noman --delete <branch>`.

Never force-push `main` or `dev`. On a work branch, force-push (`--force-with-lease`) only before review starts.

## 8. What GitHub enforces

On the GitHub Free plan, private repositories cannot enforce branch protection (C-047). These rules are a team agreement: CI reports failures, reviewers check the rest. If the plan is upgraded, add protection for `main` and `dev`: require a PR, require the `ci` checks, block force-push.

**One-time setup by the byteSpate account owner:** GitHub -> byteSpate/HMS-SaaS -> Settings -> General -> Default branch -> `dev`.
