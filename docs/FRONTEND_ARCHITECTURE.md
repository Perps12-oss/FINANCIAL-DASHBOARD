# Frontend architecture — Classic dashboard

## Page map (product structure)

| Page | Purpose | Contents |
|------|--------|----------|
| **1. Overview** (route: `dashboard`) | Landing; high-level snapshot | Top KPIs, cash flow snapshot, recent trend, top alerts, quick actions (e.g. Open calendar, Review transactions). |
| **2. Transactions** | Table-heavy operations | Transaction list, filters, search, pagination, export, bulk recategorize, notes/tags. |
| **3. Budgets & Goals** | Budget + goals together | Budget summaries, budget vs actual, goals/progress, category pressure, monthly close. (Current routes: `budget`, `goals`.) |
| **4. Analytics** | Deep visual work | Category/merchant analysis, trends, histograms, heatmaps, waterfall, Sankey, advanced views. (Current route: `analytics`.) |
| **5. Forecast & Insights** | Projections and signals | Forecast, AI summary, recurring candidates, smart signals, suggestions, risk/opportunity. (Current routes: `forecast`, `insights`.) |
| **6. Settings & System** | Config and ops | Data source, API key, import tools, diagnostics, logs, health, “Show Labs” toggle. (Current routes: `settings`, `system`.) |
| **7. Labs** (optional) | Developer/debug | Shown only when enabled (System → Show Labs or `?labs=1`). Import, cache controls, test endpoints. |

Additional routes in the current app: `calendar`, `categories`, `merchants`. These stay as-is; calendar is reachable from Overview quick actions; categories/merchants are analytics-style content.

## Sacred as mode, not a separate app

- **Classic** = layout/theme mode (current Index.html + JavaScript.html).
- **Sacred** = premium/immersive layout mode (Sacred.html); same backend, same APIs, different presentation.
- One backend, one state model, one route system, one feature set. Sacred is a visual mode (and a separate HTML entrypoint for historical reasons), not a logic fork.

## Frontend code layout (JavaScript.html)

The file is organized into these sections:

| Section | Responsibility |
|--------|----------------|
| **A. App shell** | Startup, route restore, global state init, fatal error boundary. |
| **B. Router** | Page registration, route changes (hash), navigation guards, route persistence. |
| **C. API client** | All `google.script.run` calls go through one wrapper; envelope parsing, standard success/failure handling. |
| **D. State store** | Centralized state: route, date range, custom dates, filters, mode, loading flags, diagnostics. |
| **E. Renderers** | Per-page or per-widget render: overview, transactions, budgets, analytics, forecast/insights, settings/system. |
| **F. UI utilities** | Toasts, modals, formatters, chart mount helpers, skeleton/empty/error helpers. |

## Design tokens (Styles.html)

Defined in `:root` and theme classes:

- **Spacing**: panel padding, gaps (e.g. `--topbar-gap`, `--sidebar-width`).
- **Typography**: font family (Inter), weights.
- **Radii**: `--radius`.
- **Shadows**: `--shadow`.
- **Colors**: `--bg`, `--panel`, `--text`, `--muted`, `--primary`, `--success`, `--warning`, `--danger`.

Chart heights and panel padding are set in component rules; for consistency they should align with these tokens.

## UX states (every page)

- **Loading**: loader overlay or inline skeleton.
- **Empty**: “No data” message and optional primary action.
- **Error**: visible message (banner or toast), no blank area.
- **Success**: confirmation where needed (e.g. “Saved”, “Synced”).

No silent failure; no white blank content; no dead clicks.

## Feature relocation reference

| Existing feature | Page / location |
|-----------------|-----------------|
| KPI cards | Overview |
| Running balance, category donut, income vs expense, monthly net | Overview / Analytics |
| Recent transactions, recurring candidates | Overview (with links to Transactions / Insights) |
| Transaction list, filters, export | Transactions |
| Budgets, goals | Budgets & Goals |
| Charts (scatter, histogram, heatmaps, Sankey, etc.) | Analytics |
| Forecast, AI insights, recurring candidates | Forecast & Insights |
| Data source, API key, import, diagnostics, logs, Show Labs | Settings & System |
| Labs actions, import CSV | Labs (when visible) |
