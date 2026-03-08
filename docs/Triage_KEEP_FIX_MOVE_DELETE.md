# Financial Dashboard — Ruthless Repo Triage

## 1. Executive Verdict

The repo has been partially professionalized: root is clean, docs are under `/docs` and `/archive`, backend has a single transaction pipeline and a defined envelope contract, and Config/Tests exist. That does not make it respectable yet.

**Structurally wrong:**  
- **Api.gs** is a 1,100+ line monolith with two parallel contracts: a handful of `api*` functions return `{ ok, data, error, meta }`, while the majority of public functions (getDashboardData, getBudgetsData, getCalendarData, syncFromSourceSheet, saveUserSettings, getSystemLogEntries, etc.) return ad-hoc shapes (`{ success, data }`, `{ status, message }`, naked arrays, or custom objects). The client (JavaScript.html) calls this legacy surface everywhere except bootstrap and transactions page. So the “standard envelope” is a promise on the side, not the rule. That is architecture drift and a direct credibility failure.  
- **Code.gs** contains a **bug**: `showHelp()` uses `ui.showModalDialog(html, …)` but never defines `ui` (it was removed in a prior edit). Bound-spreadsheet Help will throw.  
- **Data.gs** correctly owns the single pipeline and source resolution, but **Config.gs** load order is implicit: if Apps Script loads Api.gs before Config.gs, `CONFIG` is undefined and fallbacks scatter in Data.gs. There is no guaranteed file order in the manifest, so this is a latent production risk.  
- **Sacred.html** is a 2,400+ line second frontend. Same backend is correct, but two giant HTML entrypoints with no shared component story means future changes will double-touch. Not deleted, but it is a structural liability.  
- **Tests.gs** calls internal Data.gs symbols (`_testDataSourceConnection_`, `_parseTransactions`, `_buildDashboardContext_`, etc.). That’s acceptable for regression but locks Tests to current module boundaries; any rename of privates breaks tests.  
- **docs/audits/AUDIT_REPORT.md** describes “CODE.txt”, “API.txt”, “DATA.txt”, and bugs that are partly fixed. A new reader cannot tell what is still true. Stale audit in a prominent place is misleading.

**Salvageable:**  
- Backend layering (Code = entrypoints, Api = surface, Data = engine, Config = constants, AI = AI, Tests = harnesses) is correct in intent.  
- Root is clean; no DUMP/scratch in root.  
- Single transaction pipeline and cache invalidation are documented and implemented.  
- Frontend (Index/JavaScript/Styles) is one coherent app; JavaScript.html is 1,300+ lines and populated, not empty.

**Deceptive or risky:**  
- Claiming “every API returns the same envelope” while most endpoints do not.  
- Help text saying “if not set, the app uses the current (bound) sheet” underplays that web app no longer has a bound sheet; only script properties / user settings apply.  
- Archive and docs are organized, but AUDIT_REPORT reads as current truth and will confuse contributors.

**Must change before release:**  
1. Normalize every public Api.gs endpoint to the single envelope (or clearly deprecate and route client to envelope-wrapped api* only).  
2. Fix showHelp() bug (define `ui` or use SpreadsheetApp.getUi() before use).  
3. Resolve Config load order (e.g. ensure Config.gs is first in appsscript.json or remove CONFIG dependency from Data.gs cold path).  
4. Mark AUDIT_REPORT as historical and optionally move to archive or add a prominent “superseded” notice.

---

## 2. Repo-Level Diagnosis

| Area | Assessment |
|------|------------|
| **Backend architecture** | Intent is correct (entrypoints, API, data engine, config, AI, tests). Execution is not: Api.gs mixes envelope and non-envelope returns; Data.gs depends on CONFIG without guaranteed load order; Code.gs has a clear bug in showHelp. |
| **Frontend architecture** | Single Classic app (Index + JavaScript + Styles) with section comments and one serverCall path. Sacred is a separate 2.4k-line HTML with same backend. No shared components; over-scoped for the discipline level. |
| **Web vs modal runtime** | Documented and separated in Code.gs (doGet vs menu/dialogs). Data.gs does not use getActiveSpreadsheet() in web path. Good. |
| **Naming and file responsibility** | Files have single stated roles. Api.gs is the exception: it is “public API only” but also contains _defaultKPIs_, _buildHealthReportData_, _validateSheetAccess_, and 70+ public functions with inconsistent contracts. |
| **Release hygiene** | RELEASE.md, ROADMAP.md, branch strategy, and ship checklist exist. No tagged release yet; “production = GitHub” is stated but not yet proven by a tagged deploy. |
| **Documentation quality** | ARCHITECTURE, SCHEMA, RELEASE, CACHE_MATRIX, FRONTEND_ARCHITECTURE are useful. AUDIT_REPORT is stale and misleading. |
| **Root cleanliness** | Good. Only app source, README, .gitignore, .claspignore, appsscript.json, plus docs/ and archive/. |
| **Production readiness** | Not there. Envelope inconsistency, showHelp bug, and stale audit must be fixed; then a full ship checklist pass and a tagged release. |

---

## 3. KEEP / FIX / MOVE / DELETE Matrix

| File/Path | Current Role | Verdict | Why | Action Detail | Target Location / Replacement | Severity |
|-----------|--------------|---------|-----|---------------|-------------------------------|----------|
| Code.gs | Entrypoints: doGet, include, menu, setup, help | **FIX** | showHelp() references `ui` which is never defined; will throw in bound context | Add `var ui = SpreadsheetApp.getUi(); if (!ui) return;` at start of showHelp(), then use ui for showModalDialog | Same file | High |
| Api.gs | Public server endpoints; envelope + legacy returns | **FIX** | Majority of public functions return { success, data } or { status, message } instead of { ok, data, error, meta }; client relies on legacy surface | Wrap every public function’s return in _ok_() or _err_(); remove ad-hoc success/status shapes; or expose only api* from client and deprecate legacy names | Same file; normalize all returns to envelope | Critical |
| Data.gs | Data engine: source, parse, cache, pipeline, feature engines | **KEEP** | Single pipeline and sectioning are correct; no getActiveSpreadsheet in web path | None | — | — |
| Config.gs | Central constants | **KEEP** | Single responsibility; used by Data, Api, AI | Ensure load order: list Config.gs first in appsscript.json if order is respected, or document that CONFIG must exist | — | Low |
| AI.gs | AI: suggestCategory, insights, batching | **KEEP** | AI-only; uses _Config | None | — | — |
| Tests.gs | Regression harnesses | **KEEP** | Calls Data/Api internals; acceptable for harness | None | — | — |
| Index.html | Classic shell; inlines Styles + JavaScript | **KEEP** | Single job; 400+ lines, complete | None | — | — |
| JavaScript.html | Client app: state, router, API client, renderers | **KEEP** | 1,300+ lines; single serverCall path; section comments | Optional later: migrate serverCall targets to api* only once Api.gs is normalized | — | Medium |
| Styles.html | CSS and design tokens | **KEEP** | Theming and components | None | — | — |
| Start.html | Landing (choose Classic/Sacred) | **KEEP** | Single job | None | — | — |
| Sacred.html | Sacred layout view | **KEEP** | Same backend; large but one view | No change for triage; long-term consider shared fragments if scope grows | — | Low |
| appsscript.json | Manifest | **KEEP** | Minimal valid manifest | Add explicit file order if Apps Script respects it (Config first) | Same file | Low |
| README.md | Project overview, setup, deployment, structure | **KEEP** | Professional and accurate | None | — | — |
| .gitignore | Ignore .clasp.json | **KEEP** | Correct | None | — | — |
| .claspignore | Limit clasp push to app files | **KEEP** | Correct | None | — | — |
| .cursor/rules/apps-script-clasp.mdc | Editor rule for clasp/Apps Script | **KEEP** | Tooling; not deployed | None | — | — |
| docs/ARCHITECTURE.md | Backend/frontend layers, config, cache, routes | **KEEP** | Accurate and useful | None | — | — |
| docs/SCHEMA.md | Sheets, headers, import rules | **KEEP** | Accurate | None | — | — |
| docs/RELEASE.md | Workflow, branches, deployment, ship checklist | **KEEP** | Correct | None | — | — |
| docs/ROADMAP.md | Single active roadmap | **KEEP** | Useful | None | — | — |
| docs/CACHE_MATRIX.md | Cache buckets, TTL, invalidation | **KEEP** | Accurate | None | — | — |
| docs/FRONTEND_ARCHITECTURE.md | Page map, Sacred as mode, frontend layout | **KEEP** | Accurate | None | — | — |
| docs/SMOKE_CHECKLIST.md | Smoke checklist | **KEEP** | Operational | None | — | — |
| docs/README.md | Docs index | **KEEP** | Useful | None | — | — |
| docs/audits/AUDIT_REPORT.md | Historical audit | **FIX** | Refers to CODE.txt, API.txt, DATA.txt; describes fixed and unfixed bugs; reads as current | Add prominent header: "Historical audit — many items superseded by current codebase; see docs/ARCHITECTURE.md for current design." Or move to archive and replace with short "Audits" index | docs/audits/ with header; or archive/ | High |
| docs/roadmaps/IMPLEMENTATION_PLAN.md | Planning / feature ranking | **KEEP** | In roadmaps; not root | None | — | — |
| docs/patch-notes/SACRED_API_PATCH.md | Patch note | **KEEP** | In patch-notes | None | — | — |
| docs/patch-notes/CACHE_AND_BOTTLENECK_REVIEW.md | Patch note | **KEEP** | In patch-notes | None | — | — |
| archive/020326.txt | Historical dump | **KEEP** | Already in archive | No further action | archive/ | — |
| archive/DUMP.txt | Historical dump | **KEEP** | Already in archive | No further action | archive/ | — |
| archive/DUMP 2.txt | Historical dump | **KEEP** | Already in archive | No further action | archive/ | — |

---

## 4. Files That Must Be Split

| File | Mixed responsibilities | What to extract / leave |
|------|-------------------------|--------------------------|
| **Api.gs** | (1) Envelope helpers _ok_/_err_; (2) Default KPI fallback _defaultKPIs_; (3) Health report builder _buildHealthReportData_; (4) Sheet access validator _validateSheetAccess_; (5) 70+ public endpoints with mixed return shapes; (6) Logging _logSystem. | **Split:** Move _defaultKPIs_ and _buildHealthReportData_ to Data.gs (they are data/display helpers). Move _validateSheetAccess_ to Data.gs or keep as thin Api wrapper. Keep in Api.gs: _ok_, _err_, _requestId_, all public endpoints, _logSystem. **Do not split into multiple .gs files** for Apps Script simplicity; instead normalize all public function returns to _ok_/_err_ and remove duplicate “success”/“status” shapes. So the “split” is responsibility cleanup and envelope normalization, not more files. |

No other file is doing too many jobs in a way that requires splitting into new files. Data.gs is large but already sectioned; splitting would fragment the single pipeline.

---

## 5. Files That Must Be Moved Out of Root

**None.** Root is already clean. All non-production content is under `docs/` or `archive/`. No further moves required.

Target structure (already in place):

```
/
├── Code.gs
├── Api.gs
├── Data.gs
├── Config.gs
├── AI.gs
├── Tests.gs
├── Index.html
├── JavaScript.html
├── Styles.html
├── Start.html
├── Sacred.html
├── appsscript.json
├── README.md
├── .gitignore
├── .claspignore
├── .cursor/
│   └── rules/
│       └── apps-script-clasp.mdc
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SCHEMA.md
│   ├── RELEASE.md
│   ├── ROADMAP.md
│   ├── CACHE_MATRIX.md
│   ├── FRONTEND_ARCHITECTURE.md
│   ├── SMOKE_CHECKLIST.md
│   ├── README.md
│   ├── audits/
│   │   └── AUDIT_REPORT.md
│   ├── roadmaps/
│   │   └── IMPLEMENTATION_PLAN.md
│   └── patch-notes/
│       ├── SACRED_API_PATCH.md
│       └── CACHE_AND_BOTTLENECK_REVIEW.md
└── archive/
    ├── 020326.txt
    ├── DUMP.txt
    └── DUMP 2.txt
```

---

## 6. Files That Should Be Deleted With No Regret

**None.** No file in the current layout is harmful enough to delete. Archive dumps are already out of root; keeping them in archive preserves history without misleading. AUDIT_REPORT is fixed by a header or move, not deletion.

If you wanted to delete archive contents to signal “no legacy baggage,” you could delete the three .txt files in archive; that would be a stylistic choice, not a requirement. Recommendation: **do not delete**; leave archive as-is.

---

## 7. Files That Are Suspect / Incomplete / Untrustworthy

| File | Concern | Verdict |
|------|---------|--------|
| **Api.gs** | Advertised “every public method returns the same envelope”; in practice only api* and a few paths do. Rest return success/data or status/message. Client code assumes legacy shapes. | **Suspect.** Fix by normalizing all returns. |
| **Code.gs showHelp()** | Uses `ui` without defining it. | **Bug.** Fix. |
| **docs/audits/AUDIT_REPORT.md** | Refers to old file names and mix of fixed/unfixed issues. New reader cannot tell what still applies. | **Misleading.** Mark historical or move to archive. |
| **Data.gs _Config** | Uses `typeof CONFIG !== 'undefined'` fallbacks. If Config.gs loads after Data.gs, CONFIG is undefined and fallbacks are used; behavior is then correct but duplicated. | **Latent risk.** Document or enforce load order. |
| **JavaScript.html / Styles.html** | Previously reported “empty on GitHub”; current repo shows both populated (1,300+ and 800+ lines). | **No longer suspect** if deployment is from this repo. If deployment was ever from elsewhere, that would be the single biggest credibility issue; assume repo = source of truth. |

---

## 8. Target Professional Repo Structure

**Final layout** (already achieved except fixes above):

- **Root:** Code.gs, Api.gs, Data.gs, Config.gs, AI.gs, Tests.gs, Index.html, JavaScript.html, Styles.html, Start.html, Sacred.html, appsscript.json, README.md, .gitignore, .claspignore. Optional: .cursor/ for tooling.
- **docs/:** ARCHITECTURE.md, SCHEMA.md, RELEASE.md, ROADMAP.md, CACHE_MATRIX.md, FRONTEND_ARCHITECTURE.md, SMOKE_CHECKLIST.md, README.md; docs/audits/, docs/roadmaps/, docs/patch-notes/ with existing content.
- **archive/:** 020326.txt, DUMP.txt, DUMP 2.txt (or empty if you delete them).

**What should no longer exist:**  
- No files in root other than the list above.  
- No DUMP/scratch/plan files in root (already done).  
- No “current” documentation that describes obsolete architecture (AUDIT_REPORT must be marked historical or moved).

**Production files (clasp push):** All and only the .gs and .html in root plus appsscript.json (and .claspignore to restrict). No docs or archive in deployment.

---

## 9. Immediate Remediation Order

1. **Truthfulness fixes**  
   - Fix showHelp() in Code.gs (define `ui`).  
   - Add prominent “Historical — superseded by current architecture” (or equivalent) to docs/audits/AUDIT_REPORT.md, or move that file to archive and add a one-line note in docs/audits.

2. **Root cleanup**  
   - None; root is already clean.

3. **Architecture boundary cleanup**  
   - Normalize every public Api.gs endpoint to return only via _ok_() or _err_().  
   - Move _defaultKPIs_ and _buildHealthReportData_ into Data.gs (or keep in Api but call from envelope-wrapped functions only).  
   - Ensure no public function returns { success, data } or { status, message } without wrapping in _ok_/_err_.  
   - Update JavaScript.html to handle envelope only (it may already tolerate both; if so, keep client as-is until Api is normalized, then optionally simplify).

4. **Frontend/backend responsibility cleanup**  
   - Confirm client does not depend on ad-hoc property names from legacy endpoints (e.g. result.success vs result.ok). If it does, fix client in step 3 when normalizing Api.

5. **Documentation normalization**  
   - After AUDIT_REPORT fix, ensure docs/README and ARCHITECTURE point to “current” design and audits as historical.

6. **Release-readiness pass**  
   - Run backend tests (runAllBackendTests_).  
   - Run through docs/RELEASE.md ship checklist.  
   - Tag first release (e.g. v1.0.0-beta.1) and document in RELEASE.md.

---

## 10. Non-Negotiables Before Release

1. **Single API envelope.** Every response from Api.gs that the client can receive must be { ok, data, error, meta }. No raw success/status/array at the top level.  
2. **showHelp() must not throw.** Define SpreadsheetApp.getUi() before use.  
3. **Stale audit must not read as current.** AUDIT_REPORT.md must be clearly marked historical or moved to archive.  
4. **Config load order.** Either document that Config.gs must load first or remove reliance on CONFIG in Data.gs cold path (e.g. inline fallbacks only, no CONFIG in critical path).  
5. **Ship checklist passed.** Backend, frontend, and repo sections of docs/RELEASE.md satisfied.  
6. **One tagged release.** At least one version tag (e.g. v1.0.0-beta.1) pushed after the above, and deployment from that tag (or main at that point) verified.

---

## Brutal Bottom Line

- **Is this repo currently respectable?**  
  **No.** Root and docs are in good shape, but the API contract is advertised and not delivered, and there is a clear bug in Code.gs. A senior engineer would call out the envelope lie and the Help bug immediately.

- **Is it currently shippable?**  
  **No.** Same reasons: envelope inconsistency and showHelp() bug must be fixed; then a full ship checklist and a tagged release.

- **What is the single most embarrassing problem?**  
  **Api.gs:** “Every public method returns the same envelope” is false. Most methods return something else. That is a broken contract and the fastest way to lose a reviewer’s trust.

- **What is the first fix that changes the repo’s credibility fastest?**  
  **Normalize all Api.gs public returns to _ok_()/_err_().** Then fix showHelp() and mark the audit historical. After that, run the ship checklist and tag a release. Envelope normalization is the highest-impact single change.
