# Schema — Financial Dashboard

Expected sheets, headers, columns, and import rules.

---

## Transaction sheet

**Sheet name:** `Personal Account Transactions` (configurable via settings; default from Config.gs `CONFIG.RUNTIME.TRANSACTION_SHEET_NAME`).

### Required columns

| Column | Header (case-insensitive) | Type | Notes |
|--------|---------------------------|------|--------|
| Date | `Date` | Date or ISO string | Parsed via _parseDate_; supports Excel serials and ISO. |
| Description | `Description` | Text | Payee or transaction description. |
| Amount | `Amount` | Number | Positive = income, negative = expense. |

### Optional columns

| Column | Header | Type | Notes |
|--------|--------|------|--------|
| Category | `Category` | Text | Default "Uncategorized" if missing. |

### Validation

- At connection time (`_testDataSourceConnection_`): spreadsheet exists, sheet exists, required headers present.
- On parse: missing Date or Description skips row; Amount defaults to 0 if invalid.
- Headers are normalized to lowercase; column order does not matter (index by name).

---

## Other sheets (optional)

- **_SystemLog** — Created by “Initialize System” from the spreadsheet menu. Columns: Timestamp, Level, Message, Source. Used for server-side log appends (WARN/ERROR only).
- No other sheets are required for the web app. Budgets, goals, net worth, calendar notes are stored in **User Properties**, not in sheets.

---

## Import rules (CSV / paste)

- **Expected shape per row:** `date`, `description`, `amount`, `category` (category optional).
- **Date:** ISO YYYY-MM-DD or parseable date string.
- **Amount:** Number; sign indicates income (positive) or expense (negative).
- **Duplicate detection:** Incoming rows are hashed (date + description + amount). Rows that already exist in the transaction sheet are skipped.
- **Write:** New rows are appended to the transaction sheet. Cache is invalidated after import so the next read is fresh.

---

## Data source config (user settings)

Stored in User Property `USER_SETTINGS`. Relevant keys:

- `source` / `mode` — e.g. external.
- `spreadsheetId` / `externalId` — Google Sheet ID (from URL).
- `sheetName` — Transaction sheet name (default `Personal Account Transactions`).

Script properties (Script Properties, not User):

- `DATA_SHEET_ID` — Default spreadsheet ID when no user override.
- `SPREADSHEET_ID` — Set by onOpen when bound to a sheet; used as fallback for default source.
