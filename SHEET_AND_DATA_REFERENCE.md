# Sheet Structure & Data Reference

## Tab Name (case-sensitive)
`Personal Account Transactions`

## Supported Headers (first row fixed)

| Required | Primary        | Fallback / Alias |
|----------|----------------|------------------|
| Date     | `Date`         | —                |
| Description | `Description` | `Name`         |
| Amount   | `Amount`       | `Local amount`   |
| Optional | `Category`     | `Category split`|
| Optional | `Type`         | — (income/expense flips sign) |

## Data Format

- **Date**: ISO (YYYY-MM-DD), Excel serial, DD/MM/YYYY, MM/DD/YYYY
- **Amount**: Strips £$€, commas, spaces. Negative = expense.
- **Type** (optional): "Expense"/"Debit" → negate positive amount; "Income"/"Credit" → negate negative

## Your Source Headers
```
Transaction ID | Date | Time | Type | Name | Emoji | Category | Amount | Currency | Local amount | Local currency | Notes and #tags | Address | Receipt | Description | Category split
```
Mapping: Date→date, Description→description (fallback: Name), Amount→amount (fallback: Local amount), Category→category.

## Cache (5–8K rows)

- **Server**: In-memory only (CacheService 100KB limit; full payload not cached).
- **Client**: sessionStorage with quota handling; datasets >5K rows use 1‑min TTL; large payloads may skip cache.

## Themes
Themes only change CSS; they do not affect data loading or AppState.
