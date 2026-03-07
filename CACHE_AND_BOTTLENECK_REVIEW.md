# Cache & Bottleneck Review – Financial Dashboard

## Summary

The repo was reviewed for **bottlenecks** and **cache constraints** that could prevent data from reaching the frontend. Several issues were fixed; remaining items are documented for future work.

---

## 1. Cache constraints (fixed)

### Server-side cache (Data.gs)

- **Issue:** `_getTransactions(useCache = true)` uses a 1‑minute in-memory cache. After import, settings change (e.g. switching data source), or “Sync”, the server could still return stale data for up to 1 minute because `getDashboardData()` did not accept a “skip cache” flag.
- **Fix:**
  - **Api.gs:** `getDashboardData(forceRefresh)` now takes an optional boolean. When `forceRefresh === true`, it calls `_getTransactions(false)` so the sheet is read again.
  - **Api.gs:** `updateDataSource()` now calls `_Config.clearCache_()` so the next read uses the new sheet.

### Client-side cache (JavaScript.html)

- **Issue:** `loadDashboardData(forceRefresh)` skips `sessionStorage` when `forceRefresh` is true, but the server was still using its cache, so “refresh” could show stale data.
- **Fix:** When the client calls with `forceRefresh`, it now passes that to the server: `getDashboardData(forceRefresh)`.

### Sync and post-import flow

- **Issue:** “Sync Now” (`manualSync`) called `getDashboardData()` with no argument, so the server cache was used and data could be up to 1 minute old.
- **Fix:** `manualSync` now calls `getDashboardData(true)` so the server bypasses its cache.

---

## 2. Bottlenecks (unchanged; for awareness)

- **Single heavy `getDashboardData()`:** One call does: sheet read (or cache) + 4× `PropertiesService.getUserProperties()` + `_calculateKPIs()`. For very large sheets, `getDataRange().getValues()` can be slow and approach execution time limits.
- **Multiple round-trips:** Sankey, 3D matrix, forecast, and budgets each use separate `google.script.run` calls. Batching (e.g. one endpoint returning transactions + matrix + Sankey for a given range) would reduce latency.
- **Full-sheet read:** `_getCoreTransactionData()` uses `sheet.getDataRange().getValues()`. For very large transaction sheets, consider reading only used columns or paginating (e.g. last N rows) if the UI allows.

---

## 3. Defensive fixes (missing DOM)

- The date filter and sync UI logic reference elements that are **not present** in `Index.html` (`start-date`, `end-date`, `filtered-summary`, `sync-button`, `sync-icon`, `last-sync-time`, `filtered-balance`, etc.). Accessing them would throw and break flows.
- **Fix:** Added null checks in:
  - `setQuickRange`, `applyDateFilter`, `updateFilteredSummary`, `renderFilteredCharts`, `clearFilter`
  - `updateSyncUI` (works when only `sync-button` exists; `sync-icon` is optional)
- **Optional:** To enable the date filter and sync button in the UI, add the corresponding inputs and container to `Index.html` (see DUMP files for example markup).

---

## 4. Cache TTL reference

| Layer   | Location        | TTL / behavior |
|--------|-----------------|----------------|
| Server | Data.gs         | 1 minute (`CACHE_DURATION_MS: 60000`). Cleared on import and on `updateDataSource()`. Bypassed when `getDashboardData(true)` is used. |
| Client | JavaScript.html | 5 minutes in `sessionStorage`. Bypassed when `loadDashboardData(true)` is used. |

---

## 5. Files changed

- **Api.gs:** `getDashboardData(forceRefresh)`, `updateDataSource()` clears cache.
- **JavaScript.html:** Pass `forceRefresh` to `getDashboardData(forceRefresh)`; `manualSync` calls `getDashboardData(true)`; null checks for date filter and sync UI elements.

No changes to Data.gs, AI.gs, Index.html, or Style.html in this pass.
