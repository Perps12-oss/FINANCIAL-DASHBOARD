/**
 * CORE DATA ENGINE — Single transaction pipeline and feature engines.
 * All transaction reads flow: source → raw rows → _parseTransactions → _getTransactions → filter/aggregate.
 * Config constants live in Config.gs (CONFIG). This module holds runtime state and source resolution.
 */

const _Config = (function() {
  var RUNTIME = typeof CONFIG !== 'undefined' ? CONFIG.RUNTIME : { TRANSACTION_SHEET_NAME: 'Personal Account Transactions', CURRENCY_SYMBOL: '£', CACHE_DURATION_MS: 60000, CACHE_SERVICE_TTL_SEC: 240, PAYDAY_DAY: 3 };
  var KEYS = typeof CONFIG !== 'undefined' ? CONFIG.KEYS : { SETTINGS_PROP_KEY: 'USER_SETTINGS', BUDGETS_PROP_KEY: 'USER_BUDGETS', GOALS_PROP_KEY: 'USER_GOALS', NET_WORTH_KEY: 'USER_NET_WORTH', OPENAI_API_KEY: 'OPENAI_API_KEY', LAST_REFRESH: 'LAST_REFRESH' };
  var SCRIPT_KEY_DATA_SHEET_ID = typeof CONFIG !== 'undefined' ? CONFIG.SCRIPT_KEYS.DATA_SHEET_ID : 'DATA_SHEET_ID';

  var cacheService_ = CacheService.getScriptCache();
  var cachedTransactions_ = null;
  var lastFetchTime_ = 0;

  function getUserProp_(key) {
    return PropertiesService.getUserProperties().getProperty(key);
  }
  function setUserProp_(key, value) {
    PropertiesService.getUserProperties().setProperty(key, value);
  }
  function clearCache_() {
    cachedTransactions_ = null;
    lastFetchTime_ = 0;
    try {
      cacheService_.removeAll(['tx:parsed:v2', 'ctx:dashboard:v2', 'ctx:charts:v2', 'ctx:summary:v2']);
    } catch (e) {}
  }
  function formatCurrency_(amount) {
    return (RUNTIME.CURRENCY_SYMBOL || '£') + parseFloat(amount).toFixed(2);
  }
  function getCacheKey_(scope, params) {
    var raw = scope + ':' + JSON.stringify(params || {});
    var hash = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8)).slice(0, 24);
    return scope + ':' + hash;
  }
  function readCacheJson_(key) {
    try {
      var raw = cacheService_.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeCacheJson_(key, value, ttlSec) {
    try {
      cacheService_.put(key, JSON.stringify(value), ttlSec || RUNTIME.CACHE_SERVICE_TTL_SEC);
    } catch (e) {}
  }
  function invalidateDashboardCaches_() {
    clearCache_();
  }

  /**
   * Data source model: mode, spreadsheetId, sheetName, schemaVersion.
   * Web app uses only this; no getActiveSpreadsheet().
   */
  function getEffectiveDataSettings_() {
    var userJson = getUserProp_(KEYS.SETTINGS_PROP_KEY);
    var sheetName = RUNTIME.TRANSACTION_SHEET_NAME;
    if (userJson && userJson.trim() !== '') {
      try {
        var parsed = JSON.parse(userJson);
        if (parsed && parsed.sheetName) sheetName = String(parsed.sheetName).trim() || sheetName;
        if (parsed && parsed.mode === 'user_external' && parsed.spreadsheetId) {
          return { mode: 'user_external', source: 'external', externalId: String(parsed.spreadsheetId).trim(), spreadsheetId: String(parsed.spreadsheetId).trim(), sheetName: sheetName, schemaVersion: (typeof CONFIG !== 'undefined' ? CONFIG.SCHEMA_VERSION : 1) };
        }
        if (parsed && parsed.source === 'external' && parsed.externalId) {
          return { mode: 'user_external', source: 'external', externalId: String(parsed.externalId).trim(), spreadsheetId: String(parsed.externalId).trim(), sheetName: sheetName, schemaVersion: (typeof CONFIG !== 'undefined' ? CONFIG.SCHEMA_VERSION : 1) };
        }
      } catch (e) {}
    }
    var scriptId = PropertiesService.getScriptProperties().getProperty(SCRIPT_KEY_DATA_SHEET_ID);
    if (scriptId && scriptId.trim() !== '') {
      return { mode: 'script_default', source: 'external', externalId: scriptId.trim(), spreadsheetId: scriptId.trim(), sheetName: sheetName, schemaVersion: (typeof CONFIG !== 'undefined' ? CONFIG.SCHEMA_VERSION : 1) };
    }
    var boundId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (boundId && boundId.trim() !== '') {
      return { mode: 'script_default', source: 'external', externalId: boundId.trim(), spreadsheetId: boundId.trim(), sheetName: sheetName, schemaVersion: (typeof CONFIG !== 'undefined' ? CONFIG.SCHEMA_VERSION : 1) };
    }
    return { mode: 'script_default', source: 'none', externalId: '', spreadsheetId: '', sheetName: sheetName, schemaVersion: (typeof CONFIG !== 'undefined' ? CONFIG.SCHEMA_VERSION : 1) };
  }
  return {
    RUNTIME: RUNTIME,
    KEYS: KEYS,
    AI: typeof CONFIG !== 'undefined' ? CONFIG.AI : {},
    SCRIPT_KEY_DATA_SHEET_ID: SCRIPT_KEY_DATA_SHEET_ID,
    getEffectiveDataSettings_,
    getUserProp_,
    setUserProp_,
    clearCache_,
    formatCurrency_,
    getCacheKey_,
    readCacheJson_,
    writeCacheJson_,
    invalidateDashboardCaches_,
    get cachedTransactions() { return cachedTransactions_; },
    set cachedTransactions(val) { cachedTransactions_ = val; },
    get lastFetchTime() { return lastFetchTime_; },
    set lastFetchTime(val) { lastFetchTime_ = val; }
  };
})();

/**
 * SINGLE SOURCE OF TRUTH for transaction data.
 * All dashboards (Classic, SACRED) and APIs (getDashboardData, getDashboardSummary, getTransactionsPaginated, etc.)
 * must use this function only – no second “validation” read that can contradict it.
 * @param {boolean} [useCache=true]
 * @returns {{ transactions: Array, totalRows: number, validation: { valid: boolean, errors: string[], warnings: string[] } }}
 */
function _getTransactions(useCache) {
  if (useCache === undefined) useCache = true;
  var cacheKey = 'tx:parsed:v2';
  var now = Date.now();
  if (useCache && _Config.cachedTransactions && (now - _Config.lastFetchTime < _Config.RUNTIME.CACHE_DURATION_MS)) {
    return { transactions: _Config.cachedTransactions, totalRows: _Config.cachedTransactions.length, validation: { valid: true, errors: [], warnings: [] } };
  }
  try {
    if (useCache) {
      var cached = _Config.readCacheJson_(cacheKey);
      if (cached && Array.isArray(cached.transactions)) {
        _Config.cachedTransactions = cached.transactions;
        _Config.lastFetchTime = now;
        return {
          transactions: cached.transactions,
          totalRows: cached.transactions.length,
          validation: cached.validation || { valid: true, errors: [], warnings: [] }
        };
      }
    }
    var rawResult = _getCoreTransactionData();
    if (rawResult.error) {
      return { transactions: [], totalRows: 0, validation: { valid: false, errors: [rawResult.error], warnings: [] } };
    }
    var parseResult = _parseTransactions(rawResult.rows || []);
    var parsed = parseResult.transactions || [];
    _Config.cachedTransactions = parsed;
    _Config.lastFetchTime = now;
    _Config.writeCacheJson_(cacheKey, { transactions: parsed, validation: parseResult.validation || { valid: true, errors: [], warnings: [] } }, _Config.RUNTIME.CACHE_SERVICE_TTL_SEC);
    return { transactions: parsed, totalRows: parsed.length, validation: parseResult.validation || { valid: true, errors: [], warnings: [] } };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', '_getTransactions failed: ' + e.message, '_getTransactions', e.stack);
    return { transactions: [], totalRows: 0, validation: { valid: false, errors: [e.message], warnings: [] } };
  }
}

/**
 * Resolves the spreadsheet used for transaction data.
 * Uses only explicit configuration: user settings (external ID) or script properties (DATA_SHEET_ID, SPREADSHEET_ID).
 * Does NOT fall back to getActiveSpreadsheet() so that web app and bound contexts behave the same:
 * if no ID is configured, the caller gets null and can show "No spreadsheet configured".
 */
function _resolveDataSpreadsheet_(settings) {
  if (settings && settings.source === 'external' && settings.externalId) {
    return SpreadsheetApp.openById(settings.externalId);
  }
  var scriptId = PropertiesService.getScriptProperties().getProperty(_Config.SCRIPT_KEY_DATA_SHEET_ID) ||
    PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (scriptId && scriptId.trim()) {
    return SpreadsheetApp.openById(scriptId.trim());
  }
  return null;
}

/**
 * Gets raw data from the sheet (Active or External).
 * @returns {{ rows: Array, error: string|undefined }}
 */
function _getCoreTransactionData() {
  var settings, ss, sheet;
  try {
    settings = _Config.getEffectiveDataSettings_();
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getEffectiveDataSettings failed', '_getCoreTransactionData', e.message);
    return { rows: [], error: 'Configuration error: ' + (e.message || 'unknown') };
  }
  try {
    ss = _resolveDataSpreadsheet_(settings);
    if (!ss) return { rows: [], error: 'No spreadsheet configured. Set Script Property DATA_SHEET_ID or run Initialize System in the bound spreadsheet.' };
    sheet = ss.getSheetByName((settings && settings.sheetName) ? settings.sheetName : _Config.RUNTIME.TRANSACTION_SHEET_NAME);
    if (!sheet) {
      if (typeof _logSystem === 'function') _logSystem('WARN', 'Sheet not found: ' + ((settings && settings.sheetName) ? settings.sheetName : _Config.RUNTIME.TRANSACTION_SHEET_NAME), '_getCoreTransactionData');
      return { rows: [], error: "Sheet '" + ((settings && settings.sheetName) ? settings.sheetName : _Config.RUNTIME.TRANSACTION_SHEET_NAME) + "' not found in the spreadsheet." };
    }
    return { rows: sheet.getDataRange().getValues() };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'Connection error: ' + e.message, '_getCoreTransactionData', e.stack);
    return { rows: [], error: e.message || 'Connection failed.' };
  }
}

function _validateTransactionHeaders_(headers) {
  var normalized = (headers || []).map(function(h) { return String(h || '').toLowerCase().trim(); });
  var required = ['date', 'description', 'amount'];
  var missing = required.filter(function(r) { return normalized.indexOf(r) === -1; });
  return {
    ok: missing.length === 0,
    missing: missing,
    headers: normalized
  };
}

function _testDataSourceConnection_() {
  var settings = _Config.getEffectiveDataSettings_();
  if (!settings.spreadsheetId) {
    return { ok: false, code: 'CONFIG_MISSING', message: 'No spreadsheet configured.' };
  }
  try {
    var ss = SpreadsheetApp.openById(settings.spreadsheetId);
    var sheetName = settings.sheetName || _Config.RUNTIME.TRANSACTION_SHEET_NAME;
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { ok: false, code: 'SHEET_MISSING', message: "Sheet '" + sheetName + "' not found.", spreadsheetId: settings.spreadsheetId, spreadsheetName: ss.getName() };
    var values = sheet.getDataRange().getValues();
    var headerValidation = _validateTransactionHeaders_(values[0] || []);
    if (!headerValidation.ok) {
      return {
        ok: false,
        code: 'INVALID_HEADERS',
        message: 'Missing required headers: ' + headerValidation.missing.join(', '),
        spreadsheetId: settings.spreadsheetId,
        spreadsheetName: ss.getName(),
        rowCount: Math.max(0, values.length - 1)
      };
    }
    return {
      ok: true,
      code: 'OK',
      message: 'Connection successful.',
      spreadsheetId: settings.spreadsheetId,
      spreadsheetName: ss.getName(),
      sheetName: sheetName,
      rowCount: Math.max(0, values.length - 1),
      headers: headerValidation.headers
    };
  } catch (e) {
    return { ok: false, code: 'CONNECTION_FAILED', message: e.message || 'Connection failed.', spreadsheetId: settings.spreadsheetId || '' };
  }
}

function _getDataSourceMetadata_() {
  var settings = _Config.getEffectiveDataSettings_();
  var test = _testDataSourceConnection_();
  return {
    mode: settings.mode || 'script_default',
    source: settings.source || 'none',
    spreadsheetId: settings.spreadsheetId || '',
    sheetName: settings.sheetName || _Config.RUNTIME.TRANSACTION_SHEET_NAME,
    status: test
  };
}

/* ─── FILTER ENGINE: range and list filters ─── */

/**
 * Filter transactions by range. range: '7d'|'30d'|'90d'|'6m'|'1y'|'all'|'custom'.
 * For 'custom', fromIso and toIso must be YYYY-MM-DD.
 * @returns {Array} Filtered transactions (same objects).
 */
function _filterTransactionsByRange(txs, range, fromIso, toIso) {
  if (!txs || !txs.length) return [];
  var start = null;
  var end = null;
  if (range === 'custom' && fromIso && toIso) {
    start = new Date(fromIso);
    end = new Date(toIso);
    end.setHours(23, 59, 59);
  } else {
    var now = new Date();
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    start = new Date(now.getTime());
    if (range === '7d') start.setDate(start.getDate() - 7);
    else if (range === '30d') start.setDate(start.getDate() - 30);
    else if (range === '90d') start.setDate(start.getDate() - 90);
    else if (range === '6m') start.setMonth(start.getMonth() - 6);
    else if (range === '1y') start.setFullYear(start.getFullYear() - 1);
    else if (range === 'all') return txs;
    else start.setDate(start.getDate() - 30);
  }
  return txs.filter(function(t) {
    var d = new Date(t.date);
    return d >= start && d <= end;
  });
}

/* ─── DASHBOARD / SUMMARY ENGINE ─── */

/**
 * Build dashboard summary for SACRED: KPIs + lists (recent, top merchants, top income, recurring).
 * Transactions in lists use { name, date, category, amount } (name = description).
 */
function _getDashboardSummaryData(range, fromIso, toIso) {
  var txResult = _getTransactions(true);
  var all = (txResult && txResult.transactions) ? txResult.transactions : [];
  var txs = _filterTransactionsByRange(all, range || '30d', fromIso, toIso);
  var kpis = _calculateKPIs(all);
  var balance = parseFloat(kpis.balance) || 0;
  var income = txs.filter(function(t) { return t.amount > 0; }).reduce(function(s, t) { return s + t.amount; }, 0);
  var expenses = Math.abs(txs.filter(function(t) { return t.amount < 0; }).reduce(function(s, t) { return s + t.amount; }, 0));
  var netCashFlow = income - expenses;
  var savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;
  var daysToPayday = _getDaysToPayday();

  var topIncomeMap = {};
  txs.filter(function(t) { return t.amount > 0; }).forEach(function(t) {
    var name = t.description || 'Income';
    topIncomeMap[name] = (topIncomeMap[name] || 0) + t.amount;
  });
  var topIncomeSources = Object.entries(topIncomeMap).map(function(e) { return { name: e[0], amount: e[1], transactions: 0 }; });
  txs.filter(function(t) { return t.amount > 0; }).forEach(function(t) {
    var name = t.description || 'Income';
    var o = topIncomeSources.find(function(x) { return x.name === name; });
    if (o) o.transactions = (o.transactions || 0) + 1;
  });
  topIncomeSources.sort(function(a, b) { return b.amount - a.amount; });

  var merchantMap = {};
  txs.filter(function(t) { return t.amount < 0; }).forEach(function(t) {
    var name = t.description || t.category || 'Expense';
    merchantMap[name] = (merchantMap[name] || { amount: 0, count: 0 });
    merchantMap[name].amount += Math.abs(t.amount);
    merchantMap[name].count += 1;
  });
  var topMerchants = Object.entries(merchantMap).map(function(e) { return { name: e[0], amount: e[1].amount, transactions: e[1].count }; });
  topMerchants.sort(function(a, b) { return b.amount - a.amount; });

  var recentSlice = txs.slice().reverse().slice(0, 25);
  var recentTransactions = recentSlice.map(function(t) {
    return { name: t.description || '', date: t.date || '', category: t.category || 'Uncategorized', amount: t.amount };
  });

  var recurringCandidates = _getRecurringCandidatesList(all);

  return {
    kpis: {
      currentBalance: balance,
      totalIncome: income,
      totalExpenses: expenses,
      netCashFlow: netCashFlow,
      savingsRate: savingsRate,
      daysUntilPayday: daysToPayday
    },
    lists: {
      recentTransactions: recentTransactions,
      topMerchants: topMerchants.slice(0, 20),
      topIncomeSources: topIncomeSources.slice(0, 20),
      recurringCandidates: recurringCandidates
    },
    metadata: { range: range, fromIso: fromIso, toIso: toIso }
  };
}

/* ─── RECURRING DETECTION ENGINE ─── */

/**
 * Recurring candidates: same description + same amount, at least 2 occurrences.
 */
function _getRecurringCandidatesList(txs) {
  if (!txs || !txs.length) return [];
  var keyTo = {};
  txs.forEach(function(t) {
    var key = (t.description || '').trim() + '|' + Number(t.amount);
    if (!keyTo[key]) keyTo[key] = { pattern: t.description || '', totalAmount: 0, transactions: 0 };
    keyTo[key].totalAmount += t.amount;
    keyTo[key].transactions += 1;
  });
  return Object.values(keyTo).filter(function(r) { return r.transactions >= 2; }).slice(0, 30);
}

/**
 * Charts data for range: runningBalance, incomeVsExpense, spendingByCategory, budgetVsActual.
 */
function _getChartsDataForRange(range, fromIso, toIso) {
  var txResult = _getTransactions(true);
  var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
  var filtered = _filterTransactionsByRange(txs, range || '30d', fromIso, toIso);
  var sorted = filtered.slice().sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

  var running = 0;
  var runningBalance = sorted.map(function(t) {
    running += t.amount;
    return { date: t.date, balance: running };
  });

  var byMonth = {};
  filtered.forEach(function(t) {
    var key = t.date ? t.date.substring(0, 7) : '';
    if (!key) return;
    if (!byMonth[key]) byMonth[key] = { income: 0, expenses: 0 };
    if (t.amount > 0) byMonth[key].income += t.amount; else byMonth[key].expenses += Math.abs(t.amount);
  });
  var months = Object.keys(byMonth).sort();
  var incomeVsExpense = months.map(function(m) {
    var o = byMonth[m];
    return { month: m, income: o.income, expenses: o.expenses };
  });

  var categorySpend = {};
  filtered.filter(function(t) { return t.amount < 0; }).forEach(function(t) {
    var cat = t.category || 'Uncategorized';
    categorySpend[cat] = (categorySpend[cat] || 0) + Math.abs(t.amount);
  });
  var spendingByCategory = Object.entries(categorySpend).map(function(e) { return { category: e[0], amount: e[1] }; });

  var budgetsJson = _Config.getUserProp_(_Config.KEYS.BUDGETS_PROP_KEY) || '{}';
  var budgets = [];
  try { budgets = JSON.parse(budgetsJson); } catch (e) {}
  var budgetList = Array.isArray(budgets) ? budgets : (budgets.categories ? budgets.categories : Object.entries(budgets).map(function(e) { return { category: e[0], amount: e[1] }; }));
  var actualByCat = {};
  filtered.filter(function(t) { return t.amount < 0; }).forEach(function(t) {
    var cat = t.category || 'Uncategorized';
    actualByCat[cat] = (actualByCat[cat] || 0) + Math.abs(t.amount);
  });
  var budgetVsActual = budgetList.slice(0, 15).map(function(b) {
    var cat = typeof b === 'object' && b.category ? b.category : (typeof b === 'string' ? b : '');
    var budgetAmt = typeof b === 'object' && b.amount != null ? Number(b.amount) : 0;
    return { category: cat || 'Other', budget: budgetAmt, actual: actualByCat[cat] || 0 };
  });

  return {
    runningBalance: runningBalance,
    incomeVsExpense: incomeVsExpense,
    spendingByCategory: spendingByCategory,
    budgetVsActual: budgetVsActual
  };
}

/**
 * Paginated transactions with optional range and type. type: 'all'|'income'|'expense'.
 * Returns newest first. Signature for SACRED: (range, fromIso, toIso, offset, limit) or with opts.type.
 */
function _getTransactionsPaginatedWithRange(range, fromIso, toIso, offset, limit, type) {
  var txResult = _getTransactions(true);
  var all = (txResult && txResult.transactions) ? txResult.transactions : [];
  var filtered = (range || fromIso || toIso) ? _filterTransactionsByRange(all, range || 'all', fromIso, toIso) : all;
  if (type === 'income') filtered = filtered.filter(function(t) { return t.amount > 0; });
  else if (type === 'expense') filtered = filtered.filter(function(t) { return t.amount < 0; });
  var reversed = filtered.slice().reverse();
  var start = Math.max(0, parseInt(offset, 10) || 0);
  var pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  var slice = reversed.slice(start, start + pageSize);
  return {
    transactions: slice.map(function(t) { return { name: t.description || '', date: t.date || '', category: t.category || 'Uncategorized', amount: t.amount }; }),
    total: reversed.length,
    offset: start,
    limit: pageSize
  };
}

/**
 * Uncategorized transactions (no category or 'Uncategorized') in range.
 */
function _getUncategorizedTransactions(range, fromIso, toIso) {
  var txResult = _getTransactions(true);
  var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
  var filtered = _filterTransactionsByRange(txs, range || 'all', fromIso, toIso);
  return filtered.filter(function(t) {
    var c = (t.category || '').trim();
    return !c || c.toLowerCase() === 'uncategorized';
  }).map(function(t) { return { date: t.date, name: t.description || '', category: t.category || '', amount: t.amount }; });
}

/**
 * Transactions for a single day (dateStr YYYY-MM-DD).
 */
function _getTransactionsForDay(dateStr) {
  if (!dateStr) return [];
  var txResult = _getTransactions(true);
  var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
  var dayStart = new Date(dateStr);
  var dayEnd = new Date(dateStr);
  dayEnd.setHours(23, 59, 59);
  return txs.filter(function(t) {
    var d = new Date(t.date);
    return d >= dayStart && d <= dayEnd;
  }).map(function(t) { return { date: t.date, description: t.description, category: t.category, amount: t.amount }; });
}

/**
 * Analytics: category summary for range (expenses by category).
 */
function _getAnalyticsDataForRange(range, fromIso, toIso) {
  var txResult = _getTransactions(true);
  var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
  var filtered = _filterTransactionsByRange(txs, range || '30d', fromIso, toIso);
  var categorySpend = {};
  filtered.filter(function(t) { return t.amount < 0; }).forEach(function(t) {
    var cat = t.category || 'Uncategorized';
    categorySpend[cat] = (categorySpend[cat] || 0) + Math.abs(t.amount);
  });
  var totalExpenses = Object.values(categorySpend).reduce(function(s, v) { return s + v; }, 0);
  var categories = Object.entries(categorySpend).map(function(e) { return { name: e[0], amount: e[1] }; }).sort(function(a, b) { return b.amount - a.amount; });
  return { data: { categories: categories, summary: { totalExpenses: totalExpenses } } };
}

function _resolveRangeBounds_(range, fromIso, toIso) {
  if (range === 'custom' && fromIso && toIso) {
    return { fromIso: fromIso, toIso: toIso };
  }
  if (range === 'all') return { fromIso: null, toIso: null };
  var now = new Date();
  var end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var start = new Date(end.getTime());
  if (range === '7d') start.setDate(start.getDate() - 7);
  else if (range === '30d') start.setDate(start.getDate() - 30);
  else if (range === '90d') start.setDate(start.getDate() - 90);
  else if (range === '6m') start.setMonth(start.getMonth() - 6);
  else if (range === '1y') start.setFullYear(start.getFullYear() - 1);
  else start.setDate(start.getDate() - 30);
  return {
    fromIso: start.toISOString().slice(0, 10),
    toIso: end.toISOString().slice(0, 10)
  };
}

function _sumAmounts_(txs, predicate) {
  return (txs || []).filter(predicate || function() { return true; }).reduce(function(sum, tx) {
    return sum + (Number(tx.amount) || 0);
  }, 0);
}

function _groupTransactionsByMonth_(txs) {
  var byMonth = {};
  (txs || []).forEach(function(tx) {
    if (!tx.date) return;
    var key = tx.date.substring(0, 7);
    if (!byMonth[key]) byMonth[key] = { income: 0, expenses: 0, net: 0, transactions: [] };
    var amount = Number(tx.amount) || 0;
    if (amount >= 0) byMonth[key].income += amount;
    else byMonth[key].expenses += Math.abs(amount);
    byMonth[key].net += amount;
    byMonth[key].transactions.push(tx);
  });
  return byMonth;
}

function _groupTransactionsByDay_(txs) {
  var byDay = {};
  (txs || []).forEach(function(tx) {
    if (!tx.date) return;
    if (!byDay[tx.date]) byDay[tx.date] = { income: 0, expenses: 0, net: 0, count: 0, transactions: [] };
    var amount = Number(tx.amount) || 0;
    if (amount >= 0) byDay[tx.date].income += amount;
    else byDay[tx.date].expenses += Math.abs(amount);
    byDay[tx.date].net += amount;
    byDay[tx.date].count += 1;
    byDay[tx.date].transactions.push(tx);
  });
  return byDay;
}

function _getTopCategories_(txs, limit) {
  var categorySpend = {};
  (txs || []).filter(function(tx) { return Number(tx.amount) < 0; }).forEach(function(tx) {
    var category = tx.category || 'Uncategorized';
    categorySpend[category] = (categorySpend[category] || 0) + Math.abs(Number(tx.amount) || 0);
  });
  return Object.entries(categorySpend)
    .map(function(entry) { return { name: entry[0], category: entry[0], amount: Number(entry[1].toFixed(2)) }; })
    .sort(function(a, b) { return b.amount - a.amount; })
    .slice(0, limit || 10);
}

function _getTopMerchants_(txs, limit) {
  var merchants = {};
  (txs || []).filter(function(tx) { return Number(tx.amount) < 0; }).forEach(function(tx) {
    var name = tx.description || tx.category || 'Expense';
    if (!merchants[name]) merchants[name] = { name: name, amount: 0, transactions: 0 };
    merchants[name].amount += Math.abs(Number(tx.amount) || 0);
    merchants[name].transactions += 1;
  });
  return Object.values(merchants)
    .sort(function(a, b) { return b.amount - a.amount; })
    .slice(0, limit || 10)
    .map(function(item) {
      item.amount = Number(item.amount.toFixed(2));
      return item;
    });
}

function _getTopIncomeSources_(txs, limit) {
  var income = {};
  (txs || []).filter(function(tx) { return Number(tx.amount) > 0; }).forEach(function(tx) {
    var name = tx.description || 'Income';
    if (!income[name]) income[name] = { name: name, amount: 0, transactions: 0 };
    income[name].amount += Number(tx.amount) || 0;
    income[name].transactions += 1;
  });
  return Object.values(income)
    .sort(function(a, b) { return b.amount - a.amount; })
    .slice(0, limit || 10)
    .map(function(item) {
      item.amount = Number(item.amount.toFixed(2));
      return item;
    });
}

function _getRecentTransactions_(txs, limit) {
  return (txs || []).slice().reverse().slice(0, limit || 25).map(function(tx) {
    return {
      date: tx.date || '',
      dateFormatted: tx.date || '',
      description: tx.description || '',
      merchant: tx.description || '',
      name: tx.description || '',
      category: tx.category || 'Uncategorized',
      amount: Number(tx.amount) || 0,
      amountFormatted: _Config.formatCurrency_(Math.abs(Number(tx.amount) || 0)),
      type: Number(tx.amount) >= 0 ? 'income' : 'expense'
    };
  });
}

function _getMonthlyCategoryMatrix_(txs, limit) {
  var byMonth = _groupTransactionsByMonth_(txs);
  var months = Object.keys(byMonth).sort();
  var topCategories = _getTopCategories_(txs, limit || 8).map(function(cat) { return cat.category; });
  var z = topCategories.map(function(category) {
    return months.map(function(monthKey) {
      var total = 0;
      (byMonth[monthKey].transactions || []).forEach(function(tx) {
        if ((tx.category || 'Uncategorized') === category && Number(tx.amount) < 0) {
          total += Math.abs(Number(tx.amount) || 0);
        }
      });
      return Number(total.toFixed(2));
    });
  });
  return { months: months, categories: topCategories, z: z };
}

function _getWeekdayHeatmap_(txs) {
  var weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var weekKeys = [];
  var matrix = {};
  (txs || []).forEach(function(tx) {
    var d = new Date(tx.date);
    if (isNaN(d.getTime())) return;
    var weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    var weekKey = weekStart.toISOString().slice(0, 10);
    if (weekKeys.indexOf(weekKey) === -1) weekKeys.push(weekKey);
    if (!matrix[weekKey]) matrix[weekKey] = [0, 0, 0, 0, 0, 0, 0];
    if (Number(tx.amount) < 0) matrix[weekKey][d.getDay()] += Math.abs(Number(tx.amount) || 0);
  });
  weekKeys.sort();
  return {
    x: weekdayLabels,
    y: weekKeys,
    z: weekKeys.map(function(key) { return matrix[key]; })
  };
}

function _getForecastSeries_(txs) {
  var projection = _calculateForecast({ incomeMod: 0, expenseMod: 0 }) || [];
  return {
    labels: projection.map(function(row) { return row.month; }),
    balance: projection.map(function(row) { return Number(row.balance) || 0; }),
    income: projection.map(function(row) { return Number(row.income) || 0; }),
    expense: projection.map(function(row) { return Number(row.expense) || 0; }),
    netFlow: projection.map(function(row) { return Number(row.netFlow) || 0; })
  };
}

function _buildDashboardContext_(range, fromIso, toIso) {
  var cacheKey = _Config.getCacheKey_('ctx:dashboard:v2', { range: range || '30d', fromIso: fromIso || null, toIso: toIso || null });
  var cached = _Config.readCacheJson_(cacheKey);
  if (cached && cached.kpis && cached.filteredTransactions) return cached;
  var resolved = _resolveRangeBounds_(range || '30d', fromIso || null, toIso || null);
  var txResult = _getTransactions(true);
  var allTransactions = (txResult && txResult.transactions) ? txResult.transactions : [];
  var filteredTransactions = _filterTransactionsByRange(allTransactions, range || '30d', resolved.fromIso, resolved.toIso);
  var sortedTransactions = filteredTransactions.slice().sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
  var fullKpis = _calculateKPIs(allTransactions);
  var income = _sumAmounts_(sortedTransactions, function(tx) { return Number(tx.amount) > 0; });
  var expenseSigned = _sumAmounts_(sortedTransactions, function(tx) { return Number(tx.amount) < 0; });
  var expenses = Math.abs(expenseSigned);
  var netCashFlow = income - expenses;
  var savingsRate = income > 0 ? ((netCashFlow / income) * 100) : 0;
  var last30Transactions = _filterTransactionsByRange(allTransactions, '30d', null, null);
  var burnRate = Math.abs(_sumAmounts_(last30Transactions, function(tx) { return Number(tx.amount) < 0; })) / 30;
  var currentBalance = parseFloat(fullKpis.balance) || 0;
  var projectedDaysToZero = burnRate > 0 ? Math.floor(currentBalance / burnRate) : null;
  var monthly = _groupTransactionsByMonth_(sortedTransactions);
  var daily = _groupTransactionsByDay_(sortedTransactions);
  var context = {
    range: range || '30d',
    fromIso: resolved.fromIso,
    toIso: resolved.toIso,
    validation: (txResult && txResult.validation) ? txResult.validation : { valid: true, errors: [], warnings: [] },
    allTransactions: allTransactions,
    filteredTransactions: filteredTransactions,
    sortedTransactions: sortedTransactions,
    totalRows: allTransactions.length,
    kpis: {
      currentBalance: Number(currentBalance.toFixed(2)),
      totalIncome: Number(income.toFixed(2)),
      totalExpenses: Number(expenses.toFixed(2)),
      netCashFlow: Number(netCashFlow.toFixed(2)),
      savingsRate: Number(savingsRate.toFixed(1)),
      daysUntilPayday: _getDaysToPayday(),
      burnRate: Number(burnRate.toFixed(2)),
      projectedDaysToZero: projectedDaysToZero == null ? null : Math.max(0, projectedDaysToZero),
      avgIncome: Number(fullKpis.avgIncome || 0),
      avgExpense: Number(fullKpis.avgExpense || 0)
    },
    monthly: monthly,
    daily: daily,
    topCategories: _getTopCategories_(sortedTransactions, 12),
    topMerchants: _getTopMerchants_(sortedTransactions, 12),
    topIncomeSources: _getTopIncomeSources_(sortedTransactions, 12),
    recurringCandidates: _getRecurringCandidatesList(sortedTransactions),
    recentTransactions: _getRecentTransactions_(sortedTransactions, 50)
  };
  _Config.writeCacheJson_(cacheKey, context, _Config.RUNTIME.CACHE_SERVICE_TTL_SEC);
  return context;
}

function _buildClassicChartPack_(range, fromIso, toIso) {
  var cacheKey = _Config.getCacheKey_('ctx:charts:v2', { range: range || '30d', fromIso: fromIso || null, toIso: toIso || null });
  var cached = _Config.readCacheJson_(cacheKey);
  if (cached && cached.runningBalance) return cached;
  var context = _buildDashboardContext_(range, fromIso, toIso);
  var txs = context.sortedTransactions;
  var running = 0;
  var runningBalance = txs.map(function(tx) {
    running += Number(tx.amount) || 0;
    return { date: tx.date, balance: Number(running.toFixed(2)) };
  });
  var monthlyKeys = Object.keys(context.monthly).sort();
  var incomeVsExpense = monthlyKeys.map(function(monthKey) {
    return {
      month: monthKey,
      income: Number(context.monthly[monthKey].income.toFixed(2)),
      expenses: Number(context.monthly[monthKey].expenses.toFixed(2))
    };
  });
  var monthlyNet = monthlyKeys.map(function(monthKey) {
    return { month: monthKey, net: Number(context.monthly[monthKey].net.toFixed(2)) };
  });
  var scatter = txs.map(function(tx) {
    return { date: tx.date, amount: Number(tx.amount) || 0, category: tx.category || 'Uncategorized' };
  });
  var histogram = txs.filter(function(tx) { return Number(tx.amount) < 0; }).map(function(tx) {
    return Math.abs(Number(tx.amount) || 0);
  });
  var categoryMonth = _getMonthlyCategoryMatrix_(txs, 8);
  var weekdayHeatmap = _getWeekdayHeatmap_(txs);
  var sankey = _getSankeyData(context.fromIso, context.toIso);
  var matrix3D = _get3DMatrixData(context.fromIso, context.toIso);
  var forecast = _getForecastSeries_(context.allTransactions);
  var categoryTrends = categoryMonth.categories.map(function(category, index) {
    return {
      category: category,
      values: categoryMonth.z[index]
    };
  });
  var merchants = context.topMerchants.map(function(merchant) {
    return { name: merchant.name, amount: merchant.amount, transactions: merchant.transactions };
  });
  var pack = {
    runningBalance: runningBalance,
    categoryDonut: context.topCategories.map(function(category) {
      return { category: category.category, amount: category.amount };
    }),
    incomeVsExpense: incomeVsExpense,
    monthlyNet: monthlyNet,
    scatter: scatter,
    histogram: histogram,
    categoryMonthHeatmap: { x: categoryMonth.months, y: categoryMonth.categories, z: categoryMonth.z },
    weekdayHeatmap: weekdayHeatmap,
    monthlyWaterfall: monthlyNet,
    surface3D: matrix3D,
    forecast: forecast,
    categoryTrends: { months: categoryMonth.months, series: categoryTrends },
    advancedTrend: monthlyKeys.map(function(monthKey) {
      return {
        month: monthKey,
        totalSpending: Number(context.monthly[monthKey].expenses.toFixed(2)),
        totalIncome: Number(context.monthly[monthKey].income.toFixed(2))
      };
    }),
    sankey: sankey,
    merchants: merchants
  };
  _Config.writeCacheJson_(cacheKey, pack, _Config.RUNTIME.CACHE_SERVICE_TTL_SEC);
  return pack;
}

/* ─── CALENDAR ENGINE ─── */

function _getCalendarNotesMap_() {
  var raw = _Config.getUserProp_(_Config.KEYS.CALENDAR_NOTES || 'USER_CALENDAR_NOTES') || '{}';
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

function _saveCalendarNotesMap_(map) {
  _Config.setUserProp_('USER_CALENDAR_NOTES', JSON.stringify(map || {}));
}

function _buildCalendarWindowData_(view, anchorDate) {
  var anchor = anchorDate ? new Date(anchorDate) : new Date();
  if (isNaN(anchor.getTime())) anchor = new Date();
  var start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  var end = new Date(start);
  if (view === 'week') {
    var day = start.getDay();
    var diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  }
  var txResult = _getTransactions(true);
  var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
  var filtered = txs.filter(function(tx) {
    var d = new Date(tx.date);
    return d >= start && d <= end;
  });
  var daily = _groupTransactionsByDay_(filtered);
  var notes = _getCalendarNotesMap_();
  var days = [];
  var cursor = new Date(start);
  while (cursor <= end) {
    var iso = cursor.toISOString().slice(0, 10);
    var info = daily[iso] || { income: 0, expenses: 0, net: 0, count: 0, transactions: [] };
    var note = notes[iso] || null;
    days.push({
      date: iso,
      dayNumber: cursor.getDate(),
      dayName: cursor.toLocaleDateString('en-US', { weekday: 'short' }),
      income: Number(info.income.toFixed(2)),
      expense: Number(info.expenses.toFixed(2)),
      net: Number(info.net.toFixed(2)),
      count: info.count,
      note: note
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return {
    view: view === 'week' ? 'week' : 'month',
    anchorDate: anchor.toISOString().slice(0, 10),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    days: days
  };
}

function _getCalendarDayData_(dateStr) {
  var txs = _getTransactionsForDay(dateStr) || [];
  var note = _getCalendarNotesMap_()[dateStr] || null;
  var income = txs.filter(function(tx) { return Number(tx.amount) > 0; }).reduce(function(sum, tx) { return sum + (Number(tx.amount) || 0); }, 0);
  var expense = Math.abs(txs.filter(function(tx) { return Number(tx.amount) < 0; }).reduce(function(sum, tx) { return sum + (Number(tx.amount) || 0); }, 0));
  return {
    date: dateStr,
    income: Number(income.toFixed(2)),
    expense: Number(expense.toFixed(2)),
    net: Number((income - expense).toFixed(2)),
    note: note,
    transactions: txs.sort(function(a, b) { return Math.abs(Number(b.amount) || 0) - Math.abs(Number(a.amount) || 0); })
  };
}

function _getGoalsList_() {
  var raw = _Config.getUserProp_(_Config.KEYS.GOALS_PROP_KEY) || '[]';
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function _saveGoalsList_(goals) {
  _Config.setUserProp_(_Config.KEYS.GOALS_PROP_KEY, JSON.stringify(Array.isArray(goals) ? goals : []));
}

/**
 * Robust date parser handling ISO strings and Excel Serials
 */
function _parseDate_(dateInput) {
  if (!dateInput) return null;

  // Case 1: Already a Date object
  if (Object.prototype.toString.call(dateInput) === '[object Date]') {
    if (!isNaN(dateInput.getTime())) return dateInput;
  }

  // Case 2: Excel Serial Number (common in imports)
  if (typeof dateInput === 'number') {
    // Excel serial date logic (approximation)
    return new Date((dateInput - 25569) * 86400 * 1000);
  }

  // Case 3: String parsing
  const parsed = new Date(dateInput);
  if (parsed instanceof Date && !isNaN(parsed)) {
    return parsed;
  }

  return null;
}

/**
 * Parses raw sheet data into structured objects. Validates structure.
 * @param {Array|{rows:Array}} rowsOrObj - Raw rows or result from _getCoreTransactionData
 * @returns {{ transactions: Array, validation: { valid: boolean, errors: string[], warnings: string[] } }}
 */
function _parseTransactions(rowsOrObj) {
  var rows = Array.isArray(rowsOrObj) ? rowsOrObj : (rowsOrObj && rowsOrObj.rows) ? rowsOrObj.rows : [];
  var validation = { valid: true, errors: [], warnings: [] };
  if (!rows || rows.length < 2) {
    if (rows && rows.length === 1) validation.warnings.push('Only header row present; no transaction rows.');
    return { transactions: [], validation: validation };
  }
  var headers = rows[0].map(function(h) { return h.toString().toLowerCase().trim(); });
  var required = ['date', 'description', 'amount'];
  var indices = { date: headers.indexOf('date'), description: headers.indexOf('description'), amount: headers.indexOf('amount'), category: headers.indexOf('category') };
  if (indices.date === -1 || indices.description === -1 || indices.amount === -1) {
    validation.valid = false;
    validation.errors.push('Missing required columns: need Date, Description, Amount. Found: ' + headers.join(', '));
    return { transactions: [], validation: validation };
  }
  if (indices.category === -1) validation.warnings.push('No Category column; all transactions will be Uncategorized.');
  var skipped = 0;
  var transactions = rows.slice(1)
    .map(function(row, rowIndex) {
      var dateVal = _parseDate_(row[indices.date]);
      var desc = row[indices.description];
      var amt = parseFloat(row[indices.amount]) || 0;
      if (!dateVal || !desc) { skipped++; return null; }
      var dateISO = dateVal.toISOString().split('T')[0];
      var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, dateISO + '-' + desc + '-' + amt, Utilities.Charset.UTF_8)
        .map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
      return {
        id: hash,
        date: dateISO,
        dateObj: dateVal,
        description: desc.toString().trim(),
        amount: amt,
        category: indices.category !== -1 ? (row[indices.category] || 'Uncategorized') : 'Uncategorized',
        arrayIndex: rowIndex
      };
    })
    .filter(function(t) { return t !== null; });
  if (skipped > 0) validation.warnings.push('Skipped ' + skipped + ' rows with missing date or description.');
  return { transactions: transactions, validation: validation };
}

/**
 * Calculate KPIs with 3-month rolling averages. Does not mutate input.
 * @param {Array} txs - Transaction objects (date, amount, etc.)
 * @returns {{ balance: string, income: string, expense: string, savingsRate: string, daysToPayday: number, avgIncome: string, avgExpense: string }}
 */
function _calculateKPIs(txs) {
  var def = { balance: '0.00', income: '0.00', expense: '0.00', savingsRate: '0', daysToPayday: 0, avgIncome: '0.00', avgExpense: '0.00' };
  if (!txs || !Array.isArray(txs) || txs.length === 0) return def;
  try {
    var list = txs.slice(0); // copy to avoid mutation
    var now = new Date();
    var currentMonth = now.getMonth();
    var currentYear = now.getFullYear();
    var currentMonthTxs = list.filter(function(t) {
      var d = new Date(t.date);
      return !isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    var income = currentMonthTxs.filter(function(t) { return t.amount > 0; }).reduce(function(s, t) { return s + t.amount; }, 0);
    var expense = Math.abs(currentMonthTxs.filter(function(t) { return t.amount < 0; }).reduce(function(s, t) { return s + t.amount; }, 0));
    var totalBalance = list.reduce(function(s, t) { return s + t.amount; }, 0);
    var balanceOverride = null;
    try {
      var raw = _Config.getUserProp_(_Config.KEYS.SETTINGS_PROP_KEY) || '{}';
      var s = JSON.parse(raw);
      if (s.balanceOverride != null && s.balanceOverride !== '' && !isNaN(Number(s.balanceOverride))) balanceOverride = Number(s.balanceOverride);
    } catch (e) {}
    var displayBalance = balanceOverride != null ? balanceOverride : totalBalance;
    var savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;
    var threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    var recentTxs = list.filter(function(t) { return new Date(t.date) >= threeMonthsAgo; });
    var monthsFound = recentTxs.length ? new Set(recentTxs.map(function(t) { return t.date.substring(0, 7); })).size : 1;
    var totalRecentIncome = recentTxs.filter(function(t) { return t.amount > 0; }).reduce(function(s, t) { return s + t.amount; }, 0);
    var totalRecentExpense = Math.abs(recentTxs.filter(function(t) { return t.amount < 0; }).reduce(function(s, t) { return s + t.amount; }, 0));
    return {
      balance: Number(displayBalance).toFixed(2),
      income: income.toFixed(2),
      expense: expense.toFixed(2),
      savingsRate: savingsRate.toFixed(1),
      daysToPayday: _getDaysToPayday(),
      avgIncome: (totalRecentIncome / monthsFound).toFixed(2),
      avgExpense: (totalRecentExpense / monthsFound).toFixed(2)
    };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', '_calculateKPIs failed: ' + e.message, '_calculateKPIs', e.stack);
    return def;
  }
}

/** User-editable pay day (1–31). From USER_SETTINGS.paydayDay or RUNTIME.PAYDAY_DAY. */
function _getEffectivePaydayDay_() {
  try {
    var raw = _Config.getUserProp_(_Config.KEYS.SETTINGS_PROP_KEY) || '{}';
    var s = JSON.parse(raw);
    var d = parseInt(s.paydayDay, 10);
    if (d >= 1 && d <= 31) return d;
  } catch (e) {}
  return _Config.RUNTIME.PAYDAY_DAY;
}

/**
 * Enhanced Payday Calculator with Weekend Handling
 */
function _getDaysToPayday() {
  var paydayDay = _getEffectivePaydayDay_();
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();

  if (now.getDate() >= paydayDay) {
    month++;
    if (month > 11) { month = 0; year++; }
  }

  let payday = new Date(year, month, paydayDay);
  
  // Adjust for weekends (move to Friday if Sat/Sun)
  const dayOfWeek = payday.getDay();
  if (dayOfWeek === 0) payday.setDate(payday.getDate() - 2); // Sunday -> Friday
  if (dayOfWeek === 6) payday.setDate(payday.getDate() - 1); // Saturday -> Friday
  
  return Math.ceil((payday - now) / (1000 * 60 * 60 * 24));
}

/**
 * 3D Matrix Data with Year Awareness.
 * Optional startDate, endDate (YYYY-MM-DD) to filter.
 */
function _get3DMatrixData(startDateStr, endDateStr) {
  var txResult = _getTransactions();
  var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
  if (startDateStr && endDateStr) {
    var start = new Date(startDateStr);
    var end = new Date(endDateStr);
    end.setHours(23, 59, 59);
    txs = txs.filter(function(t) {
      var d = new Date(t.date);
      return d >= start && d <= end;
    });
  }
  var categorySpend = {};
  txs.filter(function(t) { return t.amount < 0; }).forEach(function(t) {
    categorySpend[t.category] = (categorySpend[t.category] || 0) + Math.abs(t.amount);
  });
  
  // 2. Select Top 8 Categories
  const categories = Object.entries(categorySpend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cat]) => cat);

  // 3. Build Year-Month Labels (Last 6 months)
  const months = [];
  const monthKeys = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toLocaleString('default', { month: 'short', year: '2-digit' })); // "Jan 24"
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  
  // 4. Build Z Matrix
  const z = months.map(() => categories.map(() => 0));
  
  txs.forEach(t => {
    if (t.amount >= 0) return;
    const key = t.date.substring(0, 7); // "YYYY-MM"
    const monthIdx = monthKeys.indexOf(key);
    const catIdx = categories.indexOf(t.category);
    
    if (monthIdx !== -1 && catIdx !== -1) {
      z[monthIdx][catIdx] += Math.abs(t.amount);
    }
  });
  
  return { x: categories, y: months, z: z };
}

/**
 * Sankey Diagram with "Other" Grouping for cleaner visuals.
 * Optional startDate, endDate (YYYY-MM-DD) to filter.
 */
function _getSankeyData(startDateStr, endDateStr) {
  var txResult = _getTransactions();
  var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
  if (startDateStr && endDateStr) {
    var start = new Date(startDateStr);
    var end = new Date(endDateStr);
    end.setHours(23, 59, 59);
    txs = txs.filter(function(t) {
      var d = new Date(t.date);
      return d >= start && d <= end;
    });
  }
  const MIN_FLOW_VALUE = 50; // Filter out noise transactions < £50

  // Income Sources
  const incomeMap = {};
  txs.filter(t => t.amount > 0).forEach(t => {
    incomeMap[t.description] = (incomeMap[t.description] || 0) + t.amount;
  });

  // Expense Categories
  const expenseMap = {};
  txs.filter(t => t.amount < 0).forEach(t => {
    expenseMap[t.category] = (expenseMap[t.category] || 0) + Math.abs(t.amount);
  });

  // Structure
  const labels = [];
  const sources = [];
  const targets = [];
  const values = [];
  const colors = [];

  // Nodes
  const incomeLabels = Object.keys(incomeMap).filter(k => incomeMap[k] > MIN_FLOW_VALUE);
  const expenseLabels = Object.keys(expenseMap);
  
  const totalIncomeIdx = incomeLabels.length;
  labels.push(...incomeLabels, '💰 Total Income', ...expenseLabels);

  // Links: Income -> Total
  let accumulatedIncome = 0;
  incomeLabels.forEach((src, i) => {
    const val = incomeMap[src];
    accumulatedIncome += val;
    sources.push(i);
    targets.push(totalIncomeIdx);
    values.push(val);
    colors.push('rgba(46, 204, 113, 0.6)');
  });

  // Links: Total -> Expenses
  expenseLabels.forEach((cat, i) => {
    const val = expenseMap[cat];
    sources.push(totalIncomeIdx);
    targets.push(totalIncomeIdx + 1 + i);
    values.push(val);
    colors.push('rgba(231, 76, 60, 0.6)');
  });

  return { labels, sources, targets, values, colors };
}

/**
 * Smart budget suggestions based on last 3 months of spending.
 */
function _getSmartBudgetSuggestions() {
  var txResult = _getTransactions();
  var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
  var now = new Date();
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(now.getMonth() - 3);

  const recentExpenses = txs.filter(function(t) {
    const tDate = new Date(t.date);
    return tDate >= threeMonthsAgo && tDate <= now && t.amount < 0;
  });

  const categoryTotals = {};
  recentExpenses.forEach(function(t) {
    const cat = t.category || 'Uncategorized';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.amount);
  });

  const currentMonthSpend = {};
  txs.filter(function(t) {
    const tDate = new Date(t.date);
    return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear() && t.amount < 0;
  }).forEach(function(t) {
    const cat = t.category || 'Uncategorized';
    currentMonthSpend[cat] = (currentMonthSpend[cat] || 0) + Math.abs(t.amount);
  });

  return Object.entries(categoryTotals)
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 10)
    .map(function(entry) {
      const category = entry[0];
      const total = entry[1];
      return {
        category: category,
        suggestedLimit: Math.ceil(total / 3),
        currentMonthSpend: currentMonthSpend[category] || 0
      };
    });
}

/**
 * Forecast using Rolling Averages
 */
function _calculateForecast(adjustments) {
  var txResult = _getTransactions();
  var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
  var kpis = _calculateKPIs(txs);
  
  let balance = parseFloat(kpis.balance);
  
  // Use Rolling Averages from KPIs (more stable than current month)
  let avgIncome = parseFloat(kpis.avgIncome) + (adjustments?.incomeMod || 0);
  let avgExpense = parseFloat(kpis.avgExpense) + (adjustments?.expenseMod || 0);

  // If no history, fallback to current month
  if (avgIncome === 0) avgIncome = parseFloat(kpis.income);
  if (avgExpense === 0) avgExpense = parseFloat(kpis.expense);

  const monthlyNet = avgIncome - avgExpense;
  const projection = [];

  for (let i = 0; i <= 12; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    
    projection.push({
      month: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      balance: balance.toFixed(2),
      income: avgIncome.toFixed(2),
      expense: avgExpense.toFixed(2),
      netFlow: monthlyNet.toFixed(2)
    });
    
    balance += monthlyNet;
  }
  
  return projection;
}

/**
 * Import with Duplicate Detection
 */
function _saveImportedTransactions(data) {
  if (!data || !data.length) return { success: false, count: 0 };

  // 1. Get existing transaction IDs for deduplication
  var txResult = _getTransactions();
  var existingTx = (txResult && txResult.transactions) ? txResult.transactions : [];
  var existingIds = new Set(existingTx.map(function(t) { return t.id; }));

  // 2. Filter new data
  const newRows = [];
  data.forEach(item => {
    // Generate hash for incoming item
    const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, 
      `${item.date}-${item.description}-${item.amount}`, 
      Utilities.Charset.UTF_8
    ).map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');

    if (!existingIds.has(hash)) {
      newRows.push([
        item.date,
        item.description,
        parseFloat(item.amount) || 0,
        item.category || 'Uncategorized'
      ]);
      existingIds.add(hash); // Prevent duplicates within the import batch itself
    }
  });

  if (newRows.length === 0) return { success: true, count: 0, message: "No new transactions to import." };

  // 3. Save to Sheet (same effective settings as _getCoreTransactionData)
  var settings = _Config.getEffectiveDataSettings_();
  var ss;
  try {
    ss = _resolveDataSpreadsheet_(settings);
    if (!ss) return { success: false, count: 0, message: "Database connection failed." };
  } catch (e) {
    return { success: false, count: 0, message: "Database connection failed." };
  }
  
  let sheet = ss.getSheetByName(settings.sheetName || _Config.RUNTIME.TRANSACTION_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(settings.sheetName || _Config.RUNTIME.TRANSACTION_SHEET_NAME);
    sheet.appendRow(['Date', 'Description', 'Amount', 'Category']);
  }
  
  const startRow = sheet.getLastRow() + 1;
  const endRow = startRow + newRows.length - 1;
  sheet.getRange(startRow, 1, endRow, 4).setValues(newRows);
  
  // 4. Clear cache so next fetch includes new data
  _Config.invalidateDashboardCaches_();
  _Config.setUserProp_(_Config.KEYS.LAST_REFRESH, new Date().toISOString());
  
  return { success: true, count: newRows.length };
}