# Architecture — Financial Dashboard

Single source of truth for backend layers, frontend layers, config model, cache, and route structure.

---

## Backend layers

| Layer | File | Responsibility |
|-------|------|----------------|
| **Entrypoints** | Code.gs | `doGet` (web app), `include`, spreadsheet menu, setup, help. No business logic. |
| **Public API** | Api.gs | All `google.script.run` endpoints. Same envelope: `{ ok, data, error, meta: { requestId, version [, cache ] } }`. Delegates to Data.gs / AI.gs. |
| **Data engine** | Data.gs | Source resolution, transaction load/parse/filter, aggregation, chart shaping, cache. Single pipeline only. |
| **Config** | Config.gs | Constants: property keys, cache TTLs, sheet names, headers, schema version, API version. |
| **AI** | AI.gs | Prompts, suggestions, summarization, retries, batching. |
| **Tests** | Tests.gs | Regression harnesses; run via Labs → Run backend tests. |

**Rule:** Web app never uses `getActiveSpreadsheet()`. Data source is explicit: script properties or user settings only.

---

## Frontend layers

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Shell** | Index.html, Start.html, Sacred.html | HTML shells. Classic inlines Styles.html + JavaScript.html via `include()`. |
| **Styles** | Styles.html | Design tokens (`:root`), theme classes, components. |
| **App** | JavaScript.html | App shell, router (hash), API client (`serverCall` / `api`), state (AppState), renderers per page, UI utilities. |

**Rule:** All server calls go through one wrapper. Sacred = same backend and data core; different presentation (Sacred.html).

---

## Config model

- **Data source:** `{ mode, spreadsheetId, sheetName, schemaVersion }`. Resolved from user settings (USER_SETTINGS) or script properties (DATA_SHEET_ID, SPREADSHEET_ID). No “active” fallback in web path.
- **Constants:** Config.gs `CONFIG` — RUNTIME (sheet name, currency, cache TTLs), KEYS (user props), TRANSACTION_HEADERS, SCHEMA_VERSION, API_VERSION.

---

## Cache map

See **docs/CACHE_MATRIX.md** for the full matrix.

- **Buckets:** transactions (`tx:parsed:v2`), dashboard context (`ctx:dashboard:v2`), charts (`ctx:charts:v2`).
- **Invalidation:** import commit, settings/source change, manual sync. All via `_Config.clearCache_()`.

---

## Route / page structure

| Route | Page | Purpose |
|-------|------|---------|
| (default) | Start | Choose Classic or SACRED. |
| `?view=classic` | Classic | Full app: Overview, Transactions, Analytics, Budget, Goals, Calendar, Categories, Merchants, Insights, Forecast, Settings, System, Labs (if enabled). |
| `?view=sacred` | Sacred | Premium layout; same data and APIs. |

**Classic hash routes:** `#dashboard`, `#transactions`, `#analytics`, `#budget`, `#goals`, `#calendar`, `#categories`, `#merchants`, `#insights`, `#forecast`, `#settings`, `#system`, `#labs`.

---

## Feature ownership

| Feature | Backend | Frontend |
|---------|---------|----------|
| Transactions | Data.gs `_getTransactions`, `_buildDashboardContext_`, getClassicTransactions | JavaScript.html TransactionsModule, DataLoader |
| Budgets | Api.gs getBudgetsData, saveFinalBudgets; Data.gs context for actuals | BudgetModule |
| Goals | Api.gs getGoalsData, updateGoal, addGoal; Data.gs _getGoalsList_ | GoalsModule |
| Calendar | Api.gs getCalendarData, getCalendarDayData, saveCalendarNote; Data.gs _buildCalendarWindowData_ | CalendarModule |
| Charts | Data.gs _buildClassicChartPack_, _getSankeyData, _get3DMatrixData, etc. | ChartRenderer |
| Import | Api.gs processImportData, apiValidateImportPreview, apiCommitImportRows; Data.gs _saveImportedTransactions | LabsModule, Import UI |
| Diagnostics | Api.gs getDiagnostics, getHealthReport, getSystemLogEntries | SystemModule |
| Settings / source | Api.gs loadUserSettings, saveUserSettings, updateDataSource, testExternalConnection | SettingsModule |

---

## File purpose (root only)

| File | Single job |
|------|------------|
| Code.gs | Entrypoints only. |
| Api.gs | Public server endpoints only. |
| Data.gs | Data engine only. |
| Config.gs | Constants only. |
| AI.gs | AI logic only. |
| Tests.gs | Regression tests only. |
| Index.html | Classic shell (inlines Styles + JavaScript). |
| JavaScript.html | Client app logic. |
| Styles.html | CSS and design tokens. |
| Start.html | Landing (choose view). |
| Sacred.html | Sacred layout view. |
| appsscript.json | Apps Script manifest. |

Everything else (audits, roadmaps, patch notes, dumps) lives under **docs/** or **archive/**.
