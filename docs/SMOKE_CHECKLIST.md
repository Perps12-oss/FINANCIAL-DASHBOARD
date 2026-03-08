# Production Smoke Checklist — Financial Dashboard

**Deployment URL:** `https://script.google.com/macros/s/AKfycbzpBiwI8942eSZ4x-a4hzeHsuKEcKB2HWNdLNaqnqhI6nltlyIUu857P0hfUuBc4nQ/exec`  
**Date run:** 2025-03-07  
**Scope:** Start → Classic → SACRED, transactions, budgets, import, diagnostics

---

## 1. Deployment & Routing

| Check | Expected | Result | Notes |
|-------|----------|--------|-------|
| Base URL loads | HTML returned | ✅ PASS | Returns "Financial Dashboard" (Start view) |
| `?view=classic` | Classic dashboard shell | ✅ PASS | Returns "Financial Dashboard" (Index) |
| `?view=sacred` | SACRED dashboard | ✅ PASS | Returns "SACRED Financial Dashboard" |
| `fd-runtime` meta tag | `web-app` | ✅ PASS | doGet adds meta in Code.gs |

---

## 2. Start Menu (Landing)

| Check | Expected | Result | Notes |
|-------|----------|--------|-------|
| Start page renders | Cards for Classic & SACRED | ✅ PASS | Both card links present |
| Classic card → `?view=classic` | Navigate to Classic | ⚠️ MANUAL | Click card, verify URL |
| SACRED card → `?view=sacred` | Navigate to SACRED | ⚠️ MANUAL | Click card, verify URL |
| Sheet modal fallback | google.script.run for showDashboard/showSacredDashboard | ✅ PASS | goToView checks isSheetDialog, calls run |

---

## 3. Classic Dashboard — Bootstrap

| Check | Expected | Result | Notes |
|-------|----------|--------|-------|
| apiGetAppBootstrap exists & called | Returns { ok, data: { dashboard, charts } } | ✅ PASS | Api.gs:955, JS:310 |
| apiGetTransactionsPage exists & called | Returns { ok, data: { transactions, total, categories } } | ✅ PASS | Api.gs:1053, JS:311 |
| getBudgetsData, getAiFinancialInsights, getCalendarData | All called in parallel | ✅ PASS | JS:312–314 |
| bootstrap.ok check | Throws on failure | ✅ PASS | JS:316 |
| AppState.bundle, AppState.chartPack populated | From bootstrap.data | ✅ PASS | JS:317–318 |
| Fatal error banner | showFatalError on catch | ✅ PASS | Index:98–100, JS:281, 335–345 |
| clearFatalError on success | Hidden after load | ✅ PASS | JS:327 |

---

## 4. Classic — Data Flow

| Check | Expected | Result | Notes |
|-------|----------|--------|-------|
| getClassicDashboardBundle | Returns { success, data } with kpis, lists, health, meta | ✅ PASS | Api.gs:287, fallback in 325 |
| getClassicChartPack | Returns chart configs | ✅ PASS | Api.gs:329 |
| getClassicTransactions | Returns { transactions, total, categories } | ✅ PASS | Api.gs:342 |
| apiGetAppBootstrap uses _testDataSourceConnection_ | Fails early if no source | ✅ PASS | Api.gs:961–962 |
| _ok_ / _err_ envelope | Consistent shape | ✅ PASS | Api.gs:18–29 |

---

## 5. Classic — Modules & serverCall Targets

| Check | Expected | Result | Notes |
|-------|----------|--------|-------|
| syncFromSourceSheet | Exists in Api.gs | ✅ PASS | Api.gs:586 |
| getClassicTransactions | Exists | ✅ PASS | Api.gs:342 |
| getSmartBudgetSuggestions | Exists | ✅ PASS | Api.gs:754 |
| saveFinalBudgets | Exists | ✅ PASS | Api.gs:926 |
| updateGoal, getGoalsData | Exist | ✅ PASS | Api.gs:476, 449 |
| getCalendarData, getCalendarDayData | Exist | ✅ PASS | Api.gs:384, 396 |
| saveCalendarNote, deleteCalendarNote | Exist | ✅ PASS | Api.gs:406, 420 |
| loadUserSettings, getSourceInfo | Exist | ✅ PASS | Api.gs:526, 502 |
| updateDataSource, saveUserSettings | Exist | ✅ PASS | Api.gs:896, 917 |
| testExternalConnection | Exists | ✅ PASS | Api.gs:875 |
| getHealthReport, getDiagnostics, getSystemLogEntries | Exist | ✅ PASS | Api.gs:494, 169, 155 |
| getAccounts, saveNetWorth | Exist | ✅ PASS | Api.gs:790, 936 |
| testGetDashboardData | Exists | ✅ PASS | Api.gs:189 |
| labsClearCaches | Exists (clearCachesOnly) | ✅ PASS | Api.gs:598/806 |
| processImportData, exportData | Exist | ✅ PASS | Api.gs:946, 563 |
| serverCall fallback | Handles missing google.script.run | ✅ PASS | JS:67–71 |

---

## 6. SACRED Dashboard

| Check | Expected | Result | Notes |
|-------|----------|--------|-------|
| Sacred.html loads for view=sacred | Full SACRED UI | ✅ PASS | doGet selects Sacred |
| Dashboard switcher in Classic | Link to SACRED (stays in app) | ✅ PASS | Index:21, switch-to-sacred |

---

## 7. Import / Export

| Check | Expected | Result | Notes |
|-------|----------|--------|-------|
| processImportData | Accepts rows, returns result | ✅ PASS | Api.gs:946 |
| exportData | Accepts opts, returns data | ✅ PASS | Api.gs:563 |

---

## 8. Diagnostics & System

| Check | Expected | Result | Notes |
|-------|----------|--------|-------|
| Copy diagnostics button | Copies JSON with buildInfo, route, healthReport, etc. | ⚠️ MANUAL | In System panel |
| getDiagnostics | Returns diagnostic object | ✅ PASS | Api.gs:169 |
| getHealthReport | Returns quality data | ✅ PASS | Api.gs:494 |

---

## Summary

| Category | Pass | Fail | Manual |
|----------|------|------|--------|
| Deployment & Routing | 4 | 0 | 0 |
| Start Menu | 2 | 0 | 2 |
| Classic Bootstrap | 7 | 0 | 0 |
| Classic Data Flow | 5 | 0 | 0 |
| Modules & serverCall | 17 | 0 | 0 |
| SACRED | 2 | 0 | 0 |
| Import/Export | 2 | 0 | 0 |
| Diagnostics | 2 | 0 | 1 |
| **Total** | **41** | **0** | **3** |

---

## Manual Verification (Run in Browser)

1. **Start → Classic** — Open base URL, click Classic card → URL should be `...?view=classic`, Classic dashboard loads.
2. **Start → SACRED** — From Start, click SACRED card → URL `...?view=sacred`, SACRED loads.
3. **Diagnostics** — In Classic, go to System, click "Copy diagnostics" → JSON in clipboard.

---

## Code Trace Verification

- ✅ All `serverCall()` targets exist in Api.gs.
- ✅ apiGetAppBootstrap wraps getClassicDashboardBundle + getClassicChartPack + loadUserSettings + getSourceInfo.
- ✅ Frontend expects `bootstrap.data.dashboard` and `bootstrap.data.charts`; API returns them under `dashboard` and `charts` in data.
- ✅ txData uses apiGetTransactionsPage → getClassicTransactions → `{ transactions, total, categories }` wrapped in _ok_.

---

**Result: Code-based smoke check PASSED.** No code mismatches found. Run manual checks when possible to confirm live behavior with real data.
