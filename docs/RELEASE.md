# Release process — Financial Dashboard

Branch flow, commit rules, deployment, and release tagging.

---

## Source of truth

**GitHub is the source of truth.** Every production deployment must come from committed Git state.

- If Apps Script differs from GitHub, fix GitHub (commit and push the actual code).
- No “live project has newer code than repo.”
- No empty frontend files in the repo while deployment contains real code.

---

## Required workflow

1. Change locally (Cursor / editor).
2. Commit (clear message; one concern per commit).
3. Push to GitHub.
4. `clasp push` (so Apps Script project matches repo).
5. Deploy (Apps Script: Deploy → Manage deployments → version or new deployment).
6. Tag release (see below).

**Order every time.** No deploying from uncommitted or unpushed code.

---

## Branch strategy

| Branch | Purpose |
|--------|---------|
| **main** | Production-ready only. No direct messy work. |
| **develop** | Integration branch. Feature branches merge here first. |
| **feature/*** | One concern per branch, e.g. `feature/backend-contract-lockdown`, `feature/frontend-shell-rebuild`. |
| **refactor/*** | Cleanup and architecture passes (e.g. `refactor/repo-truth-and-root-cleanup`, `refactor/backend-boundaries-and-contracts`, `refactor/frontend-shell-and-routing`, `refactor/docs-and-release-hygiene`). Merge to main after validation. |
| **release/*** | Release-prep branch (e.g. `release/professionalization-pass`). Used to integrate phase branches and tag. |

**Rules:**

- No mixed-purpose commits.
- Merge to develop after validation (e.g. backend tests, manual smoke).
- Merge develop → main only when release-ready; then tag.
- Refactor and release branches merge into main with `--no-ff` and a clear merge message.

---

## Commit rules

- One logical change per commit.
- Message: short summary; optional body with “Why” or “What”.
- No “WIP” or “fix stuff” as final commit on main.

---

## Deployment (clasp)

1. Install clasp: `npm install -g @google/clasp`.
2. Log in: `clasp login`.
3. From repo root: `clasp push` (respects `.claspignore`).
4. In Apps Script: **Deploy** → **Manage deployments** → New deployment or version.
5. Web app URL is shown there; use “Test deployments” or “Execute as” / “Who has access” as needed.

---

## Release tagging

- **Format:** `v1.0.0`, `v1.0.0-beta.1`, `v1.0.0-beta.2`.
- **When:** After merging to main and (optionally) after a successful deploy.
- **How:** `git tag v1.0.0 && git push origin v1.0.0`.
- **Release notes:** Use GitHub Releases to attach notes and known issues to the tag.

---

## Release checklist (ship checklist)

Before calling any release “ready to ship,” all of the following must pass.

### Backend

- [ ] No web-context ambiguity (no `getActiveSpreadsheet()` in web path).
- [ ] All API responses use the standard envelope (`ok`, `data`, `error`, `meta`).
- [ ] Cache invalidation verified (import, settings change, sync clear caches).
- [ ] Reconciliation verified (run backend tests: Labs → Run backend tests, or `runAllBackendTests_()`).

### Frontend

- [ ] No blank routes (every route shows content or explicit loading/empty/error).
- [ ] All pages have loading / empty / error states where applicable.
- [ ] All server calls go through the single wrapper (`serverCall` / `api`).
- [ ] Sacred mode works from the same data core (no fork).

### Repo

- [ ] Clean root (only app source + README, .gitignore, .claspignore, appsscript.json).
- [ ] Docs updated (ARCHITECTURE, SCHEMA, RELEASE, ROADMAP; audits/roadmaps/patch-notes in docs/ or archive).
- [ ] Release tagged (e.g. `v1.0.0`).
- [ ] Production state = GitHub state (deploy came from last push + clasp push).

If any item is missing, **it is not ship-ready.**

---

## Known issues (template)

Maintain a short “Known issues” list in release notes or in ROADMAP.md:

- Example: “Import of very large CSVs may hit execution time limit.”
- Example: “Sacred layout not yet responsive on small screens.”

Update when fixing or when new limitations are found.
