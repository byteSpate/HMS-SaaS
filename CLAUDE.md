# Project instructions

Hospital ERP sold as SaaS. Read [README.md](README.md) for layout and commands, and [docs/planning/README.md](docs/planning/README.md) for requirements and design. Coding agents follow [G §5](docs/planning/docs/G-implementation-plan.md#5-context-packet-for-each-agent-task).

## Git workflow

Full guide: [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md). In short:

- **`main`** = deployable only (release PRs from `dev`, hotfixes). **`dev`** = integration branch. Never commit directly to either.
- Work branch per task from `dev`: `<type>/<task-id>-<slug>`, e.g. `feat/T-ACC-01-login`. Types: `feat fix refactor test docs chore hotfix`.
- Commits: Conventional Commits `type(scope): subject`, imperative, at most 72 characters, footer `Refs: T-XXX-NN`.
- PR into `dev`, CI green, human review, **squash merge**, delete the branch on all remotes. Releases: PR `dev` -> `main`, merge commit, tag `vX.Y.Z`.

## Git: always push to all three remotes

| Remote   | URL                                       | Role     |
| -------- | ----------------------------------------- | -------- |
| `origin` | https://github.com/byteSpate/HMS-SaaS.git | Main     |
| `reza`   | https://github.com/rezaulrht/HMS-ERP.git  | Backup 1 |
| `noman`  | https://github.com/NOMAN1802/HMS-SaaS.git | Backup 2 |

Push **every branch and tag** to **all three** (work branches too):

```bash
git push origin <branch> && git push reza <branch> && git push noman <branch>
```

- Never force-push `main` or `dev`. If a remote rejects a push, fetch and investigate instead.
- **No AI attribution in commits or PRs.** Never add a `Co-Authored-By: Claude` trailer, a "Generated with Claude Code" line or a session link. `.claude/settings.json` sets `attribution` to empty for everyone; do not override it.
- Commit messages follow the same character rule as code (below): plain ASCII punctuation only.
- If the remotes are missing (fresh clone), add them:
  `git remote add reza https://github.com/rezaulrht/HMS-ERP.git && git remote add noman https://github.com/NOMAN1802/HMS-SaaS.git`

## Deployment boundary (development only)

Full guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Agents work on development only; deployment belongs to the project lead and a teammate.

- **Never deploy.** No `redeploy.sh`, no `docker compose` against a server, no `certbot` or `nginx`, no deploy workflow or deploy automation unless the project lead asks for it in that session.
- **Never ask for SSH**, server credentials, Supabase or Cloudflare access, or the real `.env` of any environment. Local dev uses `.env.example` values and `pnpm services:up` only.
- **`main` is what staging runs.** The server pulls `main` by hand after a release PR merges, so keep `main` releasable. Merging to `main` deploys nothing by itself.
- **State the deploy impact** in every PR and release PR (new env var, migration, new service, build step, origin or CORS change, tool version bump), using the table in docs/DEPLOYMENT.md section 4. Write `Deploy impact: none` when there is none.

## Code rules (strict)

### Characters

In code, comments, config files and commit messages use **plain ASCII punctuation only**. Never use:

| Do not use                             | Use instead                            |
| -------------------------------------- | -------------------------------------- |
| em dash `—`, en dash `–`               | `-`, a comma, a colon or two sentences |
| curly quotes `“ ” ‘ ’`                 | straight quotes `" '`                  |
| ellipsis character `…`                 | `...`                                  |
| arrows `→ ←` and symbols like `≥ ≤ ×`  | `->`, `>=`, `<=`, `x`                  |
| non-breaking or other invisible spaces | a normal space                         |

User-facing text that must contain Bangla script or the taka sign (`৳`) lives in the i18n message catalogs (`packages/i18n`), not in code.

### Clean, reusable code

- One responsibility per function and file. Prefer small pure functions; keep I/O at the edges (`infrastructure/`, controllers).
- Reuse before writing: check `packages/*` (contracts, domain-kernel, platform, authz, testkit) for an existing helper. Shared logic goes in a package, never copy-pasted between apps or modules.
- Follow the package boundaries in D §5 (`pnpm boundaries:check` must pass) and the module layout `domain/ application/ infrastructure/ http/ jobs/`.
- Descriptive names, no abbreviations except domain ones (MRN, OPD, IPD, LIS). No dead code, no commented-out code, no `any` without a comment explaining why.
- Every tenant-data query goes through `withTenant()` (ADR-003). Money uses the domain-kernel money type (ADR-007), never floating point.

### Comments

- Every feature file starts with a short comment: what the feature does and the IDs it implements (task `T-*`, requirements `FR-*`, decisions `C-*`/`ADR-*`).
- Comment the **why** of non-obvious logic: business rules, security checks, workarounds. Do not comment what the code already says.
- Keep comments true: update them in the same change as the code.

## Feature log (`docs/log/`)

After completing each feature or task, add a log entry in `docs/log/` **in the same commit**, using the template in [`docs/log/README.md`](docs/log/README.md): what was built, files changed, decisions applied, commands run with results, known limitations and how to debug it. The log is the first place to look when an error appears later. Never create a branch or open a pull request only for a log entry; it always rides in the feature's commit and pull request.

## Secrets

- Database URLs and passwords live only in `.env` (git-ignored). Never commit them or write them into docs.
- Supabase: the app connects as `hms_app` (RLS enforced), migrations as `hms_migrator`. Never point the app at the Supabase `postgres` or `service_role` users; they bypass RLS (ADR-019).
