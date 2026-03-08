# Roadmap — Financial Dashboard

Single active roadmap. Prioritized by impact and stability first.

---

## Current status (as of repo cleanup)

- **Backend:** Contract-driven; single transaction pipeline; standardized envelope; cache matrix; regression tests; no web-context ambiguity.
- **Frontend:** Page-based Classic shell; Sacred as mode; Labs behind toggle; design tokens and UX states started.
- **Repo:** Clean root; docs under docs/ (architecture, schema, release, cache, frontend); audits and patch notes in docs/audits, docs/patch-notes; dumps in archive.

---

## Near-term (stability and clarity)

1. **Releases** — Tag first stable tag (e.g. `v1.0.0-beta.1`) after one full pass of the ship checklist.
2. **Manual smoke** — Document and run a short manual smoke (Start → Classic → SACRED → transactions, budgets, settings, diagnostics) and fix any gaps.
3. **Known issues** — Keep a short list in release notes or here; update as fixes land.

---

## Next (product)

- **Top merchants / recurring** — Already in data layer; ensure UI and copy are clear.
- **Budget vs actual** — Chart and summary clarity; align with reconciliation tests.
- **Export** — CSV export path verified and documented.
- **Mobile / responsive** — Sacred and Classic usable on small screens.

---

## Later (optional)

- Expandable nav / rail modals (if scope justifies).
- Skeleton loaders and perceived performance polish.
- Optional analytics endpoints and reports.

---

## Not in scope (for now)

- Multiple backends or non-Sheet storage.
- Real-time collaboration.
- Native mobile app.

---

*Update this file when priorities change; keep one place for roadmap.*
