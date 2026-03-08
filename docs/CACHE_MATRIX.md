# Cache matrix — Financial Dashboard backend

Single source of truth for cache buckets, keys, TTLs, and invalidation.

## Cache layers

| Layer | Location | Scope |
|-------|----------|--------|
| Execution memory | Data.gs `_Config.cachedTransactions` | Parsed transactions only; one execution. |
| CacheService | Data.gs `cacheService_` | Cross-execution; keyed by scope + params hash. |

## Cache buckets

| Domain | Cache Key Basis | TTL | Invalidated By |
|--------|------------------|-----|----------------|
| **transactions** | `tx:parsed:v2` (spreadsheet + sheet) | CACHE_SERVICE_TTL_SEC (240s) | import commit, settings save, source switch, manual refresh (sync) |
| **bootstrap** | Not cached separately; uses transactions + dashboard + charts | — | Same as transactions |
| **dashboard context** | `ctx:dashboard:v2` + range/fromIso/toIso | CACHE_SERVICE_TTL_SEC (240s) | import, settings, source switch, manual refresh |
| **charts** | `ctx:charts:v2` + range/fromIso/toIso | CACHE_SERVICE_TTL_SEC (240s) | import, settings, source switch, manual refresh |
| **summary** | Same as dashboard context | CACHE_SERVICE_TTL_SEC (240s) | import, settings, source switch |
| **budgets** | User property (no server cache) | — | budget save (user prop write) |
| **forecast** | Derived from dashboard context / transactions | Same as transactions | import, settings |
| **insights** | Not cached (AI call) or short-lived | — | — |
| **diagnostics** | None (or very short) | — | Always fresh or 30s |

## Invalidation rules

When any of the following happen, **all** of the following must run:

- `_Config.clearCache_()` (clears in-memory + CacheService keys: `tx:parsed:v2`, `ctx:dashboard:v2`, `ctx:charts:v2`, `ctx:summary:v2`)

**Trigger invalidation on:**

1. **Import commit** — after `_saveImportedTransactions` / processImportData success.
2. **Settings save** — when data source or sheet changes (updateDataSource, saveUserSettings when source/externalId changes).
3. **Source switch** — updateDataSource().
4. **Budget save** — does not invalidate transaction cache; budget actuals are computed from current transaction cache.
5. **Manual refresh** — syncFromSourceSheet(), clearCachesOnly(), or client “Sync”.

## Implementation notes

- **Transaction pipeline**: Only `_getTransactions(useCache)` reads from cache. All features (dashboard, charts, summary, forecast, export) use `_getTransactions(true)` then filter/aggregate. So invalidating `tx:parsed:v2` and in-memory cache is sufficient for data consistency.
- **Dashboard/chart context**: Cached in `_buildDashboardContext_` and `_buildClassicChartPack_` with keys from `_Config.getCacheKey_('ctx:dashboard:v2', params)`. When transactions cache is cleared, the next request for context will call `_getTransactions(true)` (cache miss), then rebuild context and repopulate context cache.
