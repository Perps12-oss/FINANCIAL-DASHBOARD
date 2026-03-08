# Implementation Plan: Feature List vs Current Codebase

This document compares your feature list to the current app, **ignores what is already implemented**, and ranks **unimplemented** items by **impact (most improvement first)**. At the end: whether your actual code for these features would help.

---

## Already implemented (ignored for ranking)

- **Dashboard overview**: Sticky KPI header with 4 cards (Balance, Income, Expense, Savings), clickable → modals; Sync button.
- **Date range**: Quick range (Month, 3 months, Year, All), custom from/to, Apply/Clear; filtered summary; date-driven charts/KPIs.
- **Charts**: Running Balance (Plotly, area), Sankey, 3D Spending; built from filtered transactions; responsive.
- **Recent Transactions**: List with search (client-side by name, category, date), **Load more** (server pagination via `getTransactionsPaginated`), color-coded amounts, click → detail modal.
- **Navigation**: Fixed left rail (Dashboard, Calendar, Budgets, Forecast, Net Worth, Settings, Labs, Import).
- **Budget**: Smart budget (suggestions), save plan; no full "Set budget" modal with add/remove/edit rows and period (monthly/weekly).
- **Sync**: Sync from source (clears server cache, refresh).
- **Server**: `getDashboardData`, `getTransactionsPaginated`, `checkDataConnection`, `getSmartBudgets`, `fetchSankeyData`, `getMatrixData`, `getForecastData`, `saveFinalBudgets`, `saveNetWorth`, `processImportData`, `getAISuggestion`, settings/data source, etc.
- **UI**: Glass styling, themes, toasts, modals (KPI detail, calendar day, import), FAB.
- **State**: `AppState` (data, dateRange, etc.); client cache for dashboard; meta (totalRows, limit).
- **Error/empty**: No-data banner, toasts, Labs (health check, logs, test).
- **Accessibility**: Some ARIA/semantic use; Escape closes modals.

---

## Unimplemented (or partial) — ranked by improvement

**1. Top Merchants list (high impact)**  
- **What**: Panel showing merchant name, transaction count, total amount.  
- **Why first**: Directly actionable (where you spend most), low complexity (aggregate from existing transactions).  
- **Gap**: No "Top Merchants" panel or server endpoint.  
- **Code**: Your implementation would help (data shape + UI).

**2. Recurring Candidates list (high impact)**  
- **What**: List of patterns detected from transactions (e.g. "Netflix £9.99 every month").  
- **Why**: Surfaces subscriptions and recurring spend; high user value.  
- **Gap**: No detection logic and no `getRecurringCandidatesData` (or similar) or UI.  
- **Code**: Your code would help a lot (algorithm + API + UI).

**3. Budget "Set budget" modal (medium–high impact)**  
- **What**: Add/remove/edit budget rows: category, amount, period (monthly/weekly); save to server.  
- **Why**: You have Smart budget and save plan, but not explicit category budgets with period.  
- **Gap**: No modal for editing individual budget lines or period selector.  
- **Code**: Your modal + `updateBudget` (or equivalent) would speed integration.

**4. Quick Actions panel (medium impact)**  
- **What**: Buttons: Weekly Review (range summary), Quick Export (CSV), Search (focus input), Add Transaction (placeholder).  
- **Why**: One place for common actions; Export is highly requested.  
- **Gap**: No Quick Actions block; Export exists only implicitly (no CSV download).  
- **Code**: Your layout and handlers would help; Export can use existing transaction data.

**5. Insights panel (medium impact)**  
- **What**: Auto-generated insights from KPIs (e.g. high savings rate, payday countdown).  
- **Why**: You already have KPI detail modals; an Insights strip would surface "so what?" without opening modals.  
- **Gap**: No dedicated insights UI; could derive from existing KPI/date logic.  
- **Code**: Your copy and conditions would help.

**6. Days Until Payday in KPI header (medium impact)**  
- **What**: Sixth KPI card "Days Until Payday" with info modal.  
- **Why**: In your list as a main KPI; currently only in server KPIs / detail, not in header.  
- **Gap**: Header has 4 cards; add one card + modal.  
- **Code**: Your card + modal text would help.

**7. Net Cash Flow KPI card (medium impact)**  
- **What**: Fifth card "Net Cash Flow" with summary modal.  
- **Why**: Complements Income/Expense; you can compute from existing KPIs.  
- **Gap**: No Net Cash Flow card in header.  
- **Code**: Your modal content would help.

**8. CountUp animations on KPI values (low–medium impact)**  
- **What**: Smooth number transitions when KPI values change.  
- **Why**: Polishes the dashboard; CountUp is already included.  
- **Gap**: KPIs are set as plain text; no CountUp usage.  
- **Code**: Your CountUp wiring would help.

**9. Mouse-tracking / gradient on KPI cards (low impact)**  
- **What**: Dynamic gradient or glow following mouse on KPI cards.  
- **Why**: Visual polish only.  
- **Gap**: Cards have hover style but no mouse-follow effect.  
- **Code**: Your CSS/JS would help if you want to keep exact effect.

**10. Range summary modal (medium impact)**  
- **What**: Modal for selected period: total income, expenses, net cash flow, savings rate, top 5 income/expense.  
- **Why**: "Weekly Review" and date-range summary in one place.  
- **Gap**: Filtered summary exists as inline bar; no modal with top 5.  
- **Code**: Your layout and top-5 logic would help.

**11. Custom date picker modal (low impact)**  
- **What**: Modal with from/to date inputs instead of inline date bar.  
- **Why**: Optional UX; current bar already supports custom range.  
- **Gap**: Only inline date inputs.  
- **Code**: Optional; your modal would help if you prefer that UX.

**12. Income vs Expenses grouped bar (monthly) (medium impact)**  
- **What**: Plotly grouped bar chart, income vs expenses by month.  
- **Why**: Standard view; you have Running Balance, Sankey, 3D but not this exact chart.  
- **Gap**: No monthly income vs expense bar chart.  
- **Code**: Your Plotly spec would help.

**13. Budget vs Actual bar chart (medium impact)**  
- **What**: Grouped bar by category: budget vs actual.  
- **Why**: Core budgeting feedback.  
- **Gap**: No chart using budget + actual from data.  
- **Code**: Your chart + data shape would help.

**14. Spending by Category donut/pie (low–medium impact)**  
- **What**: Donut or pie of spending by category.  
- **Why**: You have 3D spending; donut is another view.  
- **Gap**: No dedicated category donut/pie.  
- **Code**: Your Plotly config would help.

**15. Skeleton loaders for charts (low impact)**  
- **What**: Placeholder blocks while chart data loads.  
- **Why**: Better perceived performance.  
- **Gap**: Loader is global "Loading data…"  
- **Code**: Your skeleton markup/CSS would help.

**16. Expandable nav submenus (medium impact)**  
- **What**: Financial Planning (Budgets, Goals), Transactions (All, Income, Expenses, Recurring, Uncategorized), Analytics (Trends, Spending, Forecast, Reports), System (Settings submenu: General, Accounts, Categories, etc.).  
- **Why**: Matches your spec; current rail is flat.  
- **Gap**: No submenus or Rail Modal.  
- **Code**: Your nav structure and Rail Modal would help a lot.

**17. Rail Modal for submenu pages (high structural impact)**  
- **What**: Submenu items open a rail modal with server-loaded content (paginated transactions, budget table, settings, etc.).  
- **Why**: Keeps context while drilling in.  
- **Gap**: No rail modal; everything is full-page views.  
- **Code**: Your modal component and loading pattern would help.

**18. Export CSV (medium impact)**  
- **What**: Button to download CSV of (e.g. recent or filtered) transactions.  
- **Why**: Common ask; you have the data.  
- **Gap**: No CSV export.  
- **Code**: Simple to add; your desired columns/format would help.

**19. getConfig / getAccounts (low–medium impact)**  
- **What**: Endpoints for settings and account list.  
- **Why**: Needed if you add Accounts page or more settings.  
- **Gap**: Settings saved; no dedicated getConfig/getAccounts.  
- **Code**: Your return shapes would help.

**20. getAiFinancialInsights (optional)**  
- **What**: Server or AI-generated insights.  
- **Why**: You have getAISuggestion for category; full "insights" could power Insights panel.  
- **Gap**: No dedicated insights API.  
- **Code**: Your prompt/response shape would help.

**21. getUncategorizedTransactionsData (medium impact)**  
- **What**: List of transactions without category (or "Uncategorized").  
- **Why**: Supports Transactions → Uncategorized and bulk categorisation.  
- **Gap**: No endpoint or view.  
- **Code**: Your API + list UI would help.

**22. getAnalyticsData / Trends / Reports (lower priority)**  
- **What**: Analytics endpoints and views (trends, reports).  
- **Why**: Nice to have after core lists and budgets.  
- **Gap**: No dedicated analytics API or pages.  
- **Code**: Your data shape would help when we add them.

**23. clearCachesOnly (low impact)**  
- **What**: Server function that only clears caches (no full refresh).  
- **Why**: Sync already does refresh; could add cache-only if needed.  
- **Gap**: Not present.  
- **Code**: Trivial to add.

---

## Summary order (most improvement → can defer)

| Priority | Feature |
|----------|--------|
| 1 | Top Merchants list |
| 2 | Recurring Candidates list |
| 3 | Set budget modal (category + amount + period) |
| 4 | Quick Actions panel (Weekly Review, Export CSV, Search, Add Tx) |
| 5 | Insights panel from KPIs |
| 6 | Days Until Payday + Net Cash Flow KPI cards |
| 7 | Range summary modal (top 5 income/expense) |
| 8 | Income vs Expenses monthly bar + Budget vs Actual bar |
| 9 | Export CSV |
| 10 | Expandable nav + Rail Modal |
| 11 | getUncategorizedTransactionsData + Uncategorized view |
| 12 | CountUp on KPIs + skeleton loaders |
| 13 | Spending by Category donut |
| 14 | Mouse gradient on KPIs, custom date modal, getConfig/getAccounts, AI insights, clearCachesOnly |

---

## Would your actual code help?

**Yes.** For the items above, your code would help in this order:

1. **Most useful**: Recurring detection logic, Top Merchants aggregation, Set budget modal (HTML + `updateBudget`), Rail Modal + expandable nav (structure and data loading), Range summary modal (top 5 + copy).
2. **Very useful**: Quick Actions layout and Export CSV format, Insights copy and conditions, KPI card markup for Payday and Net Cash Flow, Income vs Expense and Budget vs Actual chart specs.
3. **Nice to have**: CountUp usage, skeleton HTML/CSS, mouse-gradient script, donut config, getUncategorizedTransactionsData shape, getAiFinancialInsights response shape.

Sharing your code for the top items will make implementation faster and keep your preferred UX and data shapes.
