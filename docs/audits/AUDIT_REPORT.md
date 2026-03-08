# Google Apps Script Financial Dashboard – Architecture Audit

## Executive Summary

This audit identifies **performance**, **quota**, and **reliability** issues across the project. Critical bugs were found in the import flow, `_saveImportedTransactions`, and missing `_getSmartBudgetSuggestions`.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           ENTRY POINTS                                        │
│  onOpen() → Menu "Open Dashboard" | doGet() → Web App                          │
│  showDashboard() → HtmlService.createTemplateFromFile('Index')                 │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           CODE LAYER (CODE.txt)                                │
│  include('Styles'|'JavaScript'), setupSystem(), showHelp()                    │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           API LAYER (API.txt)                                  │
│  getDashboardData | getMatrixData | fetchSankeyData | getSmartBudgets         │
│  getForecastData | saveUserSettings | saveNetWorth | processImportData        │
│  getAISuggestion | testExternalConnection | updateDataSource | _logSystem     │
└──────────────────────────────────────────────────────────────────────────────┘
         │                    │                    │                    │
         ▼                    ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   DATA.txt      │  │   AI.gs         │  │   PropertiesService│  │  SpreadsheetApp │
│                 │  │                 │  │   (User Properties)│  │  (Logging)      │
│ _getTransactions│  │ suggestCategory │  │                   │  │                 │
│ _getCoreTxData  │  │ batchCategorize │  │ getUserProp_      │  │ _SystemLog       │
│ _parseTrans...  │  │                 │  │ setUserProp_      │  │ appendRow       │
│ _calculateKPIs  │  │                 │  │                   │  │                 │
│ _get3DMatrixData│  │ UrlFetchApp     │  │                   │  │                 │
│ _getSankeyData  │  │ (OpenAI API)    │  │                   │  │                 │
│ _calculateForecast│ │                 │  │                   │  │                 │
│ _saveImportedTx │  │                 │  │                   │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| **CODE.txt** | Entry points, menu, template includes, setup |
| **API.txt** | Public `google.script.run` endpoints, error handling |
| **DATA.txt** | Data engine: fetch, parse, cache, KPIs, matrix, Sankey, forecast, import |
| **AI.gs** | OpenAI integration: category suggestion, batch categorize, insights |
| **INDEX.txt** | HTML shell, layout, modals |
| **Style.txt** | CSS, themes |
| **JavaScript.txt** | Client logic: state, charts, calendar, import, settings |

---

## Issues and Fixes

### FILE: AI.gs

#### ISSUE 1: Spreadsheet writes inside loop
**EXPLANATION:** `batchCategorizeTransactions` calls `sheet.getRange(row, categoryColIndex).setValue(suggestion)` inside a `forEach` loop. Each uncategorized transaction triggers a separate Spreadsheet write. For 50+ rows this causes 50+ API calls and risks quota.

**FIX:** Collect all updates and use a single `setValues()` call.

**CODE PATCH:** See AI.gs refactor below.

---

#### ISSUE 2: UrlFetch inside loop with sleep
**EXPLANATION:** Each `suggestCategory(tx.description)` call uses `UrlFetchApp.fetch()`. With `Utilities.sleep(200)` between calls, 50 transactions → 50 UrlFetch calls + 10s+ sleep. UrlFetch daily limit (e.g. 20,000) can be hit quickly; execution time grows linearly.

**FIX:** Keep batching but add retry with exponential backoff for individual calls; optionally batch OpenAI requests if API supports it.

---

#### ISSUE 3: No retry/backoff for external API
**EXPLANATION:** `suggestCategory` has no retry on transient failures. Single timeout/5xx will return "Error (API)".

**FIX:** Add retry with exponential backoff (e.g. 3 attempts).

---

### FILE: DATA.txt

#### ISSUE 4: Critical bug in _saveImportedTransactions range
**EXPLANATION:** `sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 4)` uses `newRows.length` as rowEnd. Correct form is `(startRow, 1, startRow + newRows.length - 1, 4)`. Otherwise the range is invalid for non-empty sheets.

**FIX:** Use `sheet.getLastRow() + newRows.length` as rowEnd.

---

#### ISSUE 5: Missing _getSmartBudgetSuggestions
**EXPLANATION:** `getSmartBudgets` in API.txt calls `_getSmartBudgetSuggestions()`, which is not defined in DATA.txt. This causes a runtime error when opening the Budgets page.

**FIX:** Add `_getSmartBudgetSuggestions` to DATA.txt (from DUMP.txt/020326.txt).

---

#### ISSUE 6: CacheService not used
**EXPLANATION:** Only in-memory cache is used. Each new script invocation loses the cache. For heavy dashboards with multiple calls, CacheService would reduce Spreadsheet reads across executions.

**FIX:** Optionally add CacheService with a short TTL (e.g. 60s) for transaction data.

---

### FILE: API.txt

#### ISSUE 7: getDashboardData bypasses _getTransactions cache
**EXPLANATION:** `getDashboardData` calls `_getCoreTransactionData()` and `_parseTransactions()` directly, skipping `_getTransactions()`. Multiple dashboard loads trigger full sheet reads each time.

**FIX:** Use `_getTransactions()` so the in-memory cache is used when valid.

---

#### ISSUE 8: Missing setUserProp server function
**EXPLANATION:** Client calls `google.script.run.setUserProp('OPENAI_API_KEY', apiKey)` but no `setUserProp` is exposed in API.txt. Saving the API key fails.

**FIX:** Add `function setUserProp(key, value)` that delegates to `_Config.setUserProp_()`.

---

#### ISSUE 9: _logSystem writes on every call
**EXPLANATION:** Each `_logSystem` call does `logSheet.appendRow([...])`, which is a separate write. Frequent logging can increase write quota usage.

**FIX:** Buffer logs or use `Logger.log` for non-critical logs; or batch append if needed.

---

### FILE: JavaScript.txt

#### ISSUE 10: Import flow passes wrong data
**EXPLANATION:** `executeImport` sends only `mapping` (column indices) to `processImportData`, but the server expects an array of `{date, description, amount, category}`. The parsed CSV data is never stored or sent, so import fails.

**FIX:** Store parsed CSV in a module variable. In `executeImport`, apply mapping to build the correct array and send it to the server.

---

#### ISSUE 11: fetchSankeyData / getMatrixData with date params
**EXPLANATION:** Date filter code calls `fetchSankeyData(startDate, endDate)` and `getMatrixData(startDate, endDate)`, but server functions take no parameters. Extra arguments are ignored; filtering does not work.

**FIX:** Either add optional date parameters to server functions and filter server-side, or filter client-side using the already-loaded dashboard data.

---

#### ISSUE 12: createTransactionRow XSS risk
**EXPLANATION:** `showTransactionDetails(${JSON.stringify(t).replace(/"/g, '&quot;')}, event)` mixes JSON into `onclick`. If description contains quotes or script, it can break or become an XSS vector.

**FIX:** Use data attributes and event delegation instead of inline `onclick` with embedded JSON.

---

### Quota Risks Summary

| Risk | Location | Mitigation |
|------|----------|------------|
| UrlFetch in loop | AI.gs `batchCategorizeTransactions` | Batch where possible; retry with backoff |
| Spreadsheet reads in loop | AI.gs `batchCategorizeTransactions` | Batch `setValues` |
| Drive openById | DATA.txt, API.txt | Cache spreadsheet/sheet references where possible |
| PropertiesService | Multiple | Avoid excessive get/set in loops |
| Trigger recursion | None found | N/A |

---

## Refactor Roadmap

### Phase 1: Critical fixes (immediate)
1. Add `_getSmartBudgetSuggestions` to DATA.txt  
2. Fix `_saveImportedTransactions` range calculation  
3. Add `setUserProp` to API.txt  
4. Fix import flow: store CSV data and send mapped array  

### Phase 2: Performance
5. Use `_getTransactions()` in `getDashboardData`  
6. Batch writes in `batchCategorizeTransactions`  
7. Add optional CacheService for transaction data  

### Phase 3: Robustness
8. Add retry/backoff in `suggestCategory`  
9. Reduce `_logSystem` write volume  
10. Fix date filter: either server params or client-side filtering  

---

## Corrected Files (Applied)

| File | Changes |
|------|---------|
| **AI.gs** | Retry with exponential backoff in `suggestCategory`; batch `setValues` in `batchCategorizeTransactions` (1 read + 1 write instead of N writes) |
| **DATA.txt** | Fixed `_saveImportedTransactions` range bug; added `_getSmartBudgetSuggestions`; added `arrayIndex` to parsed transactions; `_getSankeyData`/`_get3DMatrixData` accept optional date filter |
| **API.txt** | `getDashboardData` uses `_getTransactions()` for cache; added `setUserProp`; `fetchSankeyData`/`getMatrixData` pass date params; `_logSystem` uses `Logger.log` |
| **JavaScript.txt** | Import flow stores CSV data in `_importCSVData`, builds and sends `dataArray`; date filter calls server with `startDate`/`endDate`; theme init fix |

---

## Quota Risk Checklist

| Check | Status |
|-------|--------|
| UrlFetch in loop | Mitigated: still sequential (API constraint), but batch writes reduce Spreadsheet calls |
| Spreadsheet reads in loop | Fixed: `batchCategorizeTransactions` uses 1 read + 1 write |
| Drive openById | Used only when external source; acceptable |
| ScriptProperties | Used for settings; no excessive loops |
| Trigger recursion | None detected |
| CacheService | Not yet added; optional Phase 2 |
