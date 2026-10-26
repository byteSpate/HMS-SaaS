# Git workflow

Agreed by the product owner on 2026-10-14. Applies to people and AI agents. The short version is in [CLAUDE.md](../CLAUDE.md).

## 1. Branches

| Branch        | Purpose                                                                     | Changes only through                 |
| ------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| `main`        | Deployable code only. Every deploy comes from `main`.                       | Release PRs from `dev`, hotfix PRs   |
| `dev`         | Integration branch and GitHub default branch. All features land here first. | Squash-merged PRs from work branches |
| work branches | One per task, created from `dev`, deleted after merge                       | Commits by the author                |
| `hotfix/*`    | Urgent fix for production, created from `main`                              | Commits by the author                |

Never commit directly to `main` or `dev`.

```text
main  ---o----------------o------------   release PRs (merge commit) + tag vX.Y.Z
          \              ^
dev   -----o--o--o--o----o---o---------   squash-merged work branches
            \   ^
feat/T-ACC-01-login  o o o                one branch per task
```

## 2. Branch names

`<type>/<task-id>-<short-slug>`, lowercase slug with hyphens:

| Type       | Use for                             | Example                               |
| ---------- | ----------------------------------- | ------------------------------------- |
| `feat`     | A new feature or task from G        | `feat/T-ACC-01-login`                 |
| `fix`      | A bug fix                           | `fix/T-BIL-04-receipt-total`          |
| `refactor` | Code change with no behavior change | `refactor/T-PLT-01-idempotency-store` |
| `test`     | Tests only                          | `test/T-DB-03-fixtures`               |
| `docs`     | Documentation only                  | `docs/phase0-answers`                 |
| `chore`    | Tooling, CI, dependencies           | `chore/ci-dev-branch`                 |
| `hotfix`   | Urgent production fix from `main`   | `hotfix/login-500-on-expired-session` |

Use the task ID when there is one. Without one, the slug alone is fine (`docs/git-workflow`).

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

Small commits on a work branch are fine; they are squashed when the PR merges.

## 4. Pull requests into `dev`

1. Branch from an up-to-date `dev`: `git switch dev && git pull origin dev && git switch -c feat/T-XXX-NN-slug`.
2. Push the branch to **all three remotes** (section 7) and open the PR on `origin` (byteSpate/HMS-SaaS) with base `dev`.
3. **PR title** = the future squash commit: `feat(auth): login, sessions and CSRF (T-ACC-01)`.
4. Fill in the PR template (what, why, tests run, log entry, screenshots for UI).
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
