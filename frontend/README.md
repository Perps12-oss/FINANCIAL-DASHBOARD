# Frontend source (bundled for Apps Script)

**JavaScript.html** and **Styles.html** in the repo root are **generated** from the files in this folder. Do not edit those HTML files directly—edit the source here, then run the build.

---

## Source files (edit these)

| File | Contents |
|------|----------|
| **state.js** | Utils, ApiClient, AppState, PageMeta, ThemeOptions |
| **charts.js** | ChartRenderer (Plotly charts by route) |
| **app.js** | StateManager, Router, DataLoader, render helpers, page modules (Transactions, Budget, Calendar, etc.), CSV parser, bindGlobalUI, bootstrap |
| **styles.css** | All CSS (tokens, layout, components) |

**Concatenation order (fixed):** state.js → charts.js → app.js. The build script uses this order; do not change it without updating `scripts/build-frontend.js` and this README.

---

## Build and deploy

From repo root:

```bash
npm run build
```

Then commit (source + generated `JavaScript.html` and `Styles.html`), push, and `clasp push`.

**Rule:** Before every commit or `clasp push`, run `npm run build`. The generated files must stay in sync with frontend source.

---

## Future refinement (optional)

- **app.js** is still broad. A cleaner split would be: `app.js` (bootstrap only), `router.js`, `pages.js` (or `pages/`), `data-loader.js`, `ui.js`, `csv.js`, plus existing `charts.js`.
- **state.js** mixes concerns (utils, API client, state, constants). A cleaner split would be: `api.js`, `state.js`, `constants.js`, `utils.js`.

The current three-file JS layout is acceptable until those splits are needed.
