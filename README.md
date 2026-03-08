# Financial Dashboard

A sheet-backed personal finance dashboard that gives a cleaner monthly picture, budget pressure signals, recurring spend awareness, and fast visual review—without forcing you to build pivots or charts manually. Backed by a single Google Sheet (Date, Description, Amount, Category).

---

## What it is

- **Web app** served by Apps Script (`doGet`). Opening the app URL loads the **main dashboard** directly. Optional: `?view=start` for a minimal landing, `?view=sacred` for an enhanced layout (same data, different presentation).
- **Data source:** One Google Sheet with a transaction table. Source is configured via Script Properties or in-app Settings; no “active spreadsheet” assumption in web.
- **One product, one entrypoint.** Layout option (standard vs enhanced) is in the spreadsheet menu or via `?view=sacred`; it is not a primary user choice.

---

## Feature summary

| Area | Features |
|------|----------|
| **Overview** | KPIs (balance, income, expense, savings rate, burn, payday), health grade, smart signals, running balance and category charts, recent transactions, recurring candidates. |
| **Transactions** | Paginated list, filters (search, category, amount range), export CSV. |
| **Analytics** | Scatter, histogram, heatmaps, waterfall, 3D surface, Sankey, forecast, category trends. |
| **Budget & goals** | Budget vs actual, smart suggestions, save plan; goals list and progress. |
| **Calendar** | Month/week view, day drill-down, server-backed notes. |
| **Settings & system** | Data source config, API key (for AI), theme; health, diagnostics, logs; optional Developer tools. |
| **Developer** (hidden) | Import CSV, clear caches, test endpoints. Enable in Settings or `?dev=1`. |

---

## Architecture overview

- **Backend:** Entrypoints (Code.gs) → Public API (Api.gs) → Data engine (Data.gs) + Config (Config.gs) + AI (AI.gs). Single transaction pipeline; all responses use the same envelope. See **docs/ARCHITECTURE.md**.
- **Frontend:** Main app = Index.html (Styles.html + JavaScript.html). One router, one API client, one state store. Enhanced layout (Sacred.html) uses the same APIs.
- **Config:** Central constants in Config.gs; data source model: `mode`, `spreadsheetId`, `sheetName`, `schemaVersion`. Cache and invalidation: **docs/CACHE_MATRIX.md**.

---

## Setup

1. **Clone the repo**  
   `git clone <repo-url> && cd FINANCIAL-DASHBOARD`

2. **Install clasp and log in**  
   `npm install -g @google/clasp` then `clasp login`

3. **Link or create Apps Script project**  
   From repo root: `clasp create` or `clasp clone <scriptId>`

4. **Script Properties** (Apps Script: Project Settings → Script properties)  
   - `DATA_SHEET_ID` — Google Sheet ID that contains your transaction data (from the sheet URL).  
   - Optional: `OPENAI_API_KEY` — for AI category suggestions.

5. **Transaction sheet**  
   In that spreadsheet, a sheet named **Personal Account Transactions** with headers: **Date**, **Description**, **Amount**, **Category** (Category optional). Or run **Initialize System** from the spreadsheet menu when the script is bound to a sheet.

6. **Deploy**  
   In Apps Script: Deploy → New deployment → Web app (Execute as: Me; Who has access: as needed). Use the web app URL to open the app.

---

## Deployment

- **Workflow:** Change locally → commit → push to GitHub → `clasp push` → Deploy in Apps Script → tag release. See **docs/RELEASE.md**.
- **Rule:** Production deployment must come from committed Git state. No deploying from uncommitted or unpushed code.

---

## Spreadsheet schema

- **Transaction sheet:** `Personal Account Transactions` (or name set in settings). Required columns: Date, Description, Amount. Optional: Category.  
- Full details: **docs/SCHEMA.md**.

---

## Route / page map

| URL / route | Page |
|-------------|------|
| `/exec` | Main dashboard (default) |
| `/exec?view=start` | Minimal landing with “Open Dashboard” |
| `/exec?view=sacred` | Same app, enhanced layout |
| Hash routes: `#dashboard`, `#transactions`, `#analytics`, `#budget`, `#goals`, `#calendar`, `#categories`, `#merchants`, `#insights`, `#forecast`, `#settings`, `#system`, `#labs` | In-app pages |

Developer tools (Labs) are hidden unless enabled in Settings → Developer tools or `?dev=1` / `?labs=1`.

---

## Screenshots

*(Add a short description or image links here when you have them.)*

---

## Repo structure (root only)

```
/
├── Code.gs          # Entrypoints only
├── Api.gs           # Public server endpoints
├── Data.gs          # Data engine
├── Config.gs        # Constants
├── AI.gs            # AI logic
├── Tests.gs         # Regression tests
├── Index.html       # Classic shell
├── JavaScript.html  # Client app
├── Styles.html      # CSS
├── Start.html       # Landing
├── Sacred.html      # Enhanced layout (optional)
├── appsscript.json  # Manifest
├── README.md        # This file
├── .gitignore
├── .claspignore
├── docs/            # Architecture, schema, release, roadmap, cache, audits, patch-notes
└── archive/         # Historical dumps / scratch
```

`.clasp.json` is local (not committed); see **docs/RELEASE.md** for branch strategy and release checklist.

---

## License

Private / internal use. See repo settings for terms.
