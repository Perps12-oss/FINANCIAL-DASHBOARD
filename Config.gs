/**
 * CENTRAL CONFIG — Single source for constants.
 * Used by Data.gs, Api.gs, AI.gs. No business logic here.
 */

var CONFIG = {
  /** Schema version for data source and transaction model. */
  SCHEMA_VERSION: 1,

  /** Script property keys. */
  SCRIPT_KEYS: {
    DATA_SHEET_ID: 'DATA_SHEET_ID',
    SPREADSHEET_ID: 'SPREADSHEET_ID'
  },

  /** Max transactions returned in a single getDashboardData response (response size limit). */
  MAX_TRANSACTIONS_RETURNED: 2500,

  /** Runtime constants: sheet names, currency, timezone, cache TTLs. */
  RUNTIME: {
    TRANSACTION_SHEET_NAME: 'Personal Account Transactions',
    CURRENCY_SYMBOL: '£',
    DEFAULT_TIMEZONE: 'Europe/London',
    PAYDAY_DAY: 3,
    MAX_CATEGORIES: 10,
    /** In-memory cache TTL (ms). */
    CACHE_DURATION_MS: 60000,
    /** CacheService TTL (seconds) for parsed transactions and context. */
    CACHE_SERVICE_TTL_SEC: 240,
    /** Short TTL for diagnostics (seconds). */
    CACHE_DIAGNOSTICS_TTL_SEC: 30
  },

  /** User property keys (UserProperties). */
  KEYS: {
    SETTINGS_PROP_KEY: 'USER_SETTINGS',
    BUDGETS_PROP_KEY: 'USER_BUDGETS',
    GOALS_PROP_KEY: 'USER_GOALS',
    NET_WORTH_KEY: 'USER_NET_WORTH',
    OPENAI_API_KEY: 'OPENAI_API_KEY',
    LAST_REFRESH: 'LAST_REFRESH',
    CALENDAR_NOTES: 'USER_CALENDAR_NOTES'
  },

  /** Required transaction sheet headers (lowercase). */
  TRANSACTION_HEADERS: ['date', 'description', 'amount'],

  /** Optional transaction sheet headers. */
  TRANSACTION_HEADERS_OPTIONAL: ['category'],

  /** AI provider settings. */
  AI: {
    PROVIDER: 'openai',
    OPENAI: {
      BASE: 'https://api.openai.com/v1/chat/completions',
      MODEL: 'gpt-4o-mini'
    },
    TIMEOUT_MS: 10000
  },

  /** API response version (in meta.version). */
  API_VERSION: '1.0'
};
