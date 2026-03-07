# SACRED Dashboard – API wiring for this Apps Script project

Your SACRED HTML expects these server APIs. They are now implemented in `Api.gs` and `Data.gs`.

## No client changes required

The server **overloads** `getTransactionsPaginated` so your existing SACRED HTML works as-is:

- **2 args:** `getTransactionsPaginated(offset, limit)` → Classic dashboard shape `{ success, transactions, totalRows, hasMore }`.
- **5 args:** `getTransactionsPaginated(range, fromIso, toIso, offset, limit)` → SACRED shape `{ transactions, total, offset, limit }` (load more).
- **1 object:** `getTransactionsPaginated({ range, fromIso, toIso, type, limit })` → same SACRED shape (rail modal).

So you do **not** need to rename to `getTransactionsPaginatedWithRange` or change arguments in your SACRED HTML.

## When you paste your full SACRED HTML into Sacred.html

1. **Keep `<base target="_top">`** in `<head>` so `google.script.run` works in the Sheets dialog.
2. **Keep or add the start menu bar** at the top so you can switch to Start menu or Classic Dashboard (see the current Sacred.html for the exact HTML).

---

## Backend functions that match SACRED

- `getDashboardSummary(range, fromIso, toIso)` ✓  
- `getChartsData(range, fromIso, toIso)` ✓  
- `getRecurringCandidatesData(opts)` ✓  
- `getUncategorizedTransactionsData(opts)` ✓  
- `getBudgetsData(opts)` ✓  
- `getSmartBudgetSuggestions()` ✓  
- `updateBudget(b)` ✓  
- `getTransactionsForDay({ date })` ✓  
- `getAnalyticsData(opts)` ✓  
- `getAiFinancialInsights()` ✓  
- `getConfig(key, defaultValue)` ✓  
- `getAccounts()` ✓  
- `clearCachesOnly()` ✓  

---

## 5. Add Sacred.html and open it

1. Save your full SACRED HTML file as **Sacred.html** in this project (same folder as `Index.html`).
2. Apply the three changes above (base tag + two `getTransactionsPaginated` → `getTransactionsPaginatedWithRange`).
3. Deploy: `clasp push`.
4. In the spreadsheet menu: **Financial Dashboard** → **Open Enhanced (SACRED) Dashboard**.

The dialog will load Sacred.html and call the new APIs; data comes from the same “Personal Account Transactions” sheet and Script Properties (e.g. `DATA_SHEET_ID`, budgets, net worth).
