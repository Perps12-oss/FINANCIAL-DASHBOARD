/**
 * PUBLIC API ENDPOINTS
 * All google.script.run calls go here.
 *
 * SINGLE SOURCE OF TRUTH: Data.gs _getTransactions(useCache) is the only place that reads
 * transaction data. getDashboardData (Classic) and getDashboardSummary (SACRED) both use
 * it; neither does a second "validation" read. Dashboards request what they need from this.
 *
 * RETURN ENVELOPE (getDashboardData, refreshAllData):
 *   { success: boolean, data: object|null, error: string|null, meta: { fromCache, lastFetched, validation } }
 *   data: { transactions: [], settings: {}, budgets: {}, nw: {}, goals: [], kpis: {} }
 *
 * checkDataConnection(): { success: boolean, message: string, rowCount?: number, sheetName?: string }
 * getDiagnostics(): { connection: checkResult, lastError: object|null, cacheAgeMs: number|null }
 * getSystemLogEntries(): { success: boolean, entries: Array<{t,level,message,source,detail}> }
 */

/** Default KPIs when there is no data. */
function _defaultKPIs_() {
  return {
    balance: '0.00',
    income: '0.00',
    expense: '0.00',
    savingsRate: '0',
    daysToPayday: 0,
    avgIncome: '0.00',
    avgExpense: '0.00'
  };
}

/**
 * Returns: { success: boolean, data: object|null, error: string|null, meta: { fromCache, lastFetched, validation } }
 * @param {boolean} [forceRefresh] - If true, bypass server cache and force fresh read for all sources.
 */
var MAX_TRANSACTIONS_RETURNED = 2500;

/**
 * Classic dashboard payload. Uses SINGLE SOURCE OF TRUTH: _getTransactions() only.
 * No second read or validation step – whatever _getTransactions returns is what we return.
 */
function getDashboardData(forceRefresh) {
  var envelope = { success: false, data: null, error: null, meta: { fromCache: false, lastFetched: null, validation: { valid: true, errors: [], warnings: [] }, totalRows: 0, limit: MAX_TRANSACTIONS_RETURNED } };
  try {
    var useCache = forceRefresh !== true;
    var txResult = _getTransactions(useCache);
    var allTransactions = (txResult && txResult.transactions) ? txResult.transactions : [];
    var totalRows = allTransactions.length;
    envelope.meta.totalRows = totalRows;
    var validation = (txResult && txResult.validation) ? txResult.validation : envelope.meta.validation;
    envelope.meta.validation = validation;
    envelope.meta.fromCache = useCache && !!_Config.cachedTransactions;
    envelope.meta.lastFetched = _Config.lastFetchTime ? new Date(_Config.lastFetchTime).toISOString() : null;

    var settings = _Config.getEffectiveDataSettings_();
    if (validation && validation.errors && validation.errors.length) {
      envelope.error = validation.errors[0];
    }

    var budgets = '{}';
    var nw = '{"assets":[],"liabilities":[]}';
    var goals = '[]';
    if (!forceRefresh) {
      try { budgets = _Config.getUserProp_(_Config.KEYS.BUDGETS_PROP_KEY) || '{}'; } catch (e) {}
      try { nw = _Config.getUserProp_(_Config.KEYS.NET_WORTH_KEY) || nw; } catch (e) {}
      try { goals = _Config.getUserProp_(_Config.KEYS.GOALS_PROP_KEY) || '[]'; } catch (e) {}
    }
    try { budgets = JSON.parse(budgets); } catch (e) { budgets = {}; }
    try { nw = JSON.parse(nw); } catch (e) { nw = { assets: [], liabilities: [] }; }
    try { goals = JSON.parse(goals); } catch (e) { goals = []; }

    var kpis = _calculateKPIs(allTransactions);
    var transactionsForClient = totalRows <= MAX_TRANSACTIONS_RETURNED ? allTransactions : allTransactions.slice(-MAX_TRANSACTIONS_RETURNED);
    if (totalRows > MAX_TRANSACTIONS_RETURNED) {
      envelope.meta.validation.warnings = envelope.meta.validation.warnings || [];
      envelope.meta.validation.warnings.push('Showing latest ' + MAX_TRANSACTIONS_RETURNED + ' of ' + totalRows + ' transactions (limit for response size). KPIs use all ' + totalRows + '.');
    }
    envelope.success = true;
    envelope.data = {
      transactions: transactionsForClient,
      settings: settings,
      budgets: budgets,
      nw: nw,
      goals: goals,
      kpis: kpis
    };
    return envelope;
  } catch (e) {
    envelope.error = e.message || 'Failed to load data';
    _logSystem('ERROR', envelope.error, 'getDashboardData', e.stack);
    envelope.data = { transactions: [], settings: {}, budgets: {}, nw: { assets: [], liabilities: [] }, goals: [], kpis: _defaultKPIs_() };
    return envelope;
  }
}

/** Validates that the data sheet exists and is readable. Returns { accessible: boolean, error?: string }. */
function _validateSheetAccess_() {
  try {
    var raw = _getCoreTransactionData();
    if (raw.error) return { accessible: false, error: raw.error };
    return { accessible: true };
  } catch (e) {
    return { accessible: false, error: e.message };
  }
}

/**
 * Health check: reads a few rows and returns status. Call on app load to confirm connectivity.
 * Returns: { success: boolean, message: string, rowCount?: number, sheetName?: string }
 */
function checkDataConnection() {
  var result = { success: false, message: '' };
  try {
    var raw = _getCoreTransactionData();
    if (raw.error) {
      result.message = raw.error;
      _logSystem('WARN', 'checkDataConnection: ' + raw.error, 'checkDataConnection');
      return result;
    }
    var rows = raw.rows || [];
    result.success = true;
    result.message = 'OK';
    result.rowCount = rows.length;
    result.sheetName = _Config.RUNTIME.TRANSACTION_SHEET_NAME;
    return result;
  } catch (e) {
    result.message = e.message || 'Connection failed';
    _logSystem('ERROR', 'checkDataConnection: ' + result.message, 'checkDataConnection', e.stack);
    return result;
  }
}

/**
 * Clears all caches and returns fresh dashboard data. Use after import or settings change.
 * Returns same envelope as getDashboardData.
 */
function refreshAllData() {
  _Config.clearCache_();
  return getDashboardData(true);
}

/**
 * Returns recent diagnostic log entries (from ScriptProperty DIAGNOSTIC_LOG).
 * For Labs: monitor and alert on failures.
 */
function getSystemLogEntries() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('DIAGNOSTIC_LOG');
    if (!raw) return { success: true, entries: [] };
    var arr = JSON.parse(raw);
    return { success: true, entries: arr };
  } catch (e) {
    return { success: false, entries: [], error: e.message };
  }
}

/**
 * Returns diagnostics for Labs: connection status, last error, cache age.
 */
function getDiagnostics() {
  var conn = checkDataConnection();
  var logRaw = PropertiesService.getScriptProperties().getProperty('DIAGNOSTIC_LOG');
  var lastError = null;
  if (logRaw) try {
    var arr = JSON.parse(logRaw);
    var err = arr.filter(function(x) { return x.level === 'ERROR'; });
    if (err.length) lastError = err[err.length - 1];
  } catch (e) {}
  return {
    connection: conn,
    lastError: lastError,
    cacheAgeMs: _Config.lastFetchTime ? (Date.now() - _Config.lastFetchTime) : null
  };
}

/**
 * Test function for Apps Script: run testGetDashboardData() and check logs.
 * Returns: { success: boolean, envelope: object, error?: string }
 */
function testGetDashboardData() {
  try {
    var envelope = getDashboardData(false);
    Logger.log('testGetDashboardData: success=' + envelope.success + ', transactions=' + (envelope.data && envelope.data.transactions ? envelope.data.transactions.length : 0));
    if (envelope.error) Logger.log('testGetDashboardData error: ' + envelope.error);
    return { success: envelope.success, envelope: envelope, error: envelope.error };
  } catch (e) {
    Logger.log('testGetDashboardData threw: ' + e.message);
    return { success: false, envelope: null, error: e.message };
  }
}

/**
 * Returns a page of transactions. Overloaded for Classic vs SACRED:
 * - getTransactionsPaginated(offset, limit) -> { success, transactions, totalRows, hasMore } for Classic.
 * - getTransactionsPaginated(range, fromIso, toIso, offset, limit) -> { transactions, total, offset, limit } for SACRED load more.
 * - getTransactionsPaginated(opts) with opts.range, fromIso, toIso, type, limit -> same shape for SACRED rail modal.
 */
function getTransactionsPaginated(a, b, c, d, e) {
  if (arguments.length === 1 && typeof a === 'object' && a !== null) {
    var opts = a;
    var range = opts.range || 'all';
    var fromIso = opts.fromIso || null;
    var toIso = opts.toIso || null;
    var type = opts.type || 'all';
    var limit = Math.min(100, Math.max(1, parseInt(opts.limit, 10) || 50));
    return getTransactionsPaginatedWithRange(range, fromIso, toIso, 0, limit, type);
  }
  if (arguments.length >= 5) {
    return getTransactionsPaginatedWithRange(a, b, c, d, (e != null ? e : 25), 'all');
  }
  return getTransactionsPaginatedOffsetLimit(a, b);
}

/** Classic dashboard: (offset, limit) -> { success, transactions, totalRows, hasMore }. */
function getTransactionsPaginatedOffsetLimit(offset, limit) {
  var result = { success: false, transactions: [], totalRows: 0, hasMore: false };
  try {
    var txResult = _getTransactions(true);
    var all = (txResult && txResult.transactions) ? txResult.transactions : [];
    var totalRows = all.length;
    var reversed = all.slice().reverse();
    var start = Math.max(0, parseInt(offset, 10) || 0);
    var pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    result.transactions = reversed.slice(start, start + pageSize);
    result.totalRows = totalRows;
    result.hasMore = start + result.transactions.length < totalRows;
    result.success = true;
    return result;
  } catch (e) {
    result.error = e.message || 'Failed to load transactions';
    if (typeof _logSystem === 'function') _logSystem('ERROR', result.error, 'getTransactionsPaginatedOffsetLimit', e.stack);
    return result;
  }
}

/**
 * SACRED / Enhanced dashboard: summary by range (KPIs + lists).
 * @param {string} range - '7d'|'30d'|'90d'|'6m'|'1y'|'all'|'custom'
 * @param {string|null} fromIso - For custom: YYYY-MM-DD
 * @param {string|null} toIso - For custom: YYYY-MM-DD
 */
function getDashboardSummary(range, fromIso, toIso) {
  try {
    return _getDashboardSummaryData(range || '30d', fromIso || null, toIso || null);
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getDashboardSummary: ' + e.message, 'getDashboardSummary', e.stack);
    return {
      kpis: { currentBalance: 0, totalIncome: 0, totalExpenses: 0, netCashFlow: 0, savingsRate: 0, daysUntilPayday: 0 },
      lists: { recentTransactions: [], topMerchants: [], topIncomeSources: [], recurringCandidates: [] },
      metadata: {}
    };
  }
}

function _buildHealthReportData_() {
  var txResult = _getTransactions(true);
  var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
  var issues = { duplicates: [], missingCategory: 0, invalidAmount: 0, futureDates: 0 };
  var seen = {};
  var now = new Date();
  txs.forEach(function(tx) {
    var key = [tx.date, tx.description, tx.amount].join('|');
    if (seen[key] && issues.duplicates.length < 20) issues.duplicates.push(key);
    seen[key] = true;
    if (!tx.category || String(tx.category).trim() === '' || String(tx.category).toLowerCase() === 'uncategorized') issues.missingCategory += 1;
    if (!isFinite(Number(tx.amount))) issues.invalidAmount += 1;
    var d = new Date(tx.date);
    if (!isNaN(d.getTime()) && d > now) issues.futureDates += 1;
  });
  var score = 100;
  score -= Math.min(30, issues.duplicates.length * 2);
  score -= Math.min(20, issues.missingCategory);
  score -= Math.min(20, issues.invalidAmount * 5);
  score -= Math.min(10, issues.futureDates * 3);
  return { score: Math.max(0, score), issues: issues };
}

function getClassicDashboardBundle(opts) {
  try {
    opts = opts || {};
    var range = opts.range || '30d';
    var fromIso = opts.fromIso || opts.from || null;
    var toIso = opts.toIso || opts.to || null;
    var context = _buildDashboardContext_(range, fromIso, toIso);
    var health = (function(kpis) {
      var savingsRate = Number(kpis.savingsRate || 0);
      var net = Number(kpis.netCashFlow || 0);
      if (savingsRate >= 20 && net > 0) return { grade: 'Excellent', message: 'Strong savings and positive cash flow.' };
      if (savingsRate >= 10 && net >= 0) return { grade: 'Good', message: 'Healthy financial position.' };
      if (savingsRate >= 0) return { grade: 'Fair', message: 'Room for improvement in savings.' };
      return { grade: 'Needs Attention', message: 'Negative cash flow detected.' };
    })(context.kpis);
    return {
      success: true,
      data: {
        kpis: context.kpis,
        lists: {
          recentTransactions: context.recentTransactions,
          topCategories: context.topCategories,
          topMerchants: context.topMerchants,
          topIncomeSources: context.topIncomeSources,
          recurringCandidates: context.recurringCandidates
        },
        health: health,
        meta: {
          range: context.range,
          fromIso: context.fromIso,
          toIso: context.toIso,
          totalRows: context.totalRows,
          validation: context.validation
        }
      }
    };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getClassicDashboardBundle: ' + e.message, 'getClassicDashboardBundle', e.stack);
    return { success: false, error: e.message, data: { kpis: _defaultKPIs_(), lists: { recentTransactions: [], topCategories: [], topMerchants: [], topIncomeSources: [], recurringCandidates: [] }, health: { grade: 'Unknown', message: 'No data.' }, meta: {} } };
  }
}

function getClassicChartPack(opts) {
  try {
    opts = opts || {};
    var range = opts.range || '30d';
    var fromIso = opts.fromIso || opts.from || null;
    var toIso = opts.toIso || opts.to || null;
    return { success: true, data: _buildClassicChartPack_(range, fromIso, toIso) };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getClassicChartPack: ' + e.message, 'getClassicChartPack', e.stack);
    return { success: false, error: e.message, data: {} };
  }
}

function getClassicTransactions(opts) {
  try {
    opts = opts || {};
    var range = opts.range || '30d';
    var fromIso = opts.fromIso || opts.from || null;
    var toIso = opts.toIso || opts.to || null;
    var search = String(opts.search || '').trim().toLowerCase();
    var category = String(opts.category || 'All');
    var min = opts.min !== undefined && opts.min !== '' ? Number(opts.min) : null;
    var max = opts.max !== undefined && opts.max !== '' ? Number(opts.max) : null;
    var start = Math.max(0, parseInt(opts.offset, 10) || 0);
    var limit = Math.min(500, Math.max(25, parseInt(opts.limit, 10) || 250));
    var context = _buildDashboardContext_(range, fromIso, toIso);
    var list = context.filteredTransactions.slice().reverse().filter(function(tx) {
      var amount = Number(tx.amount) || 0;
      var matchSearch = !search || (tx.description || '').toLowerCase().indexOf(search) !== -1 || (tx.category || '').toLowerCase().indexOf(search) !== -1 || (tx.date || '').toLowerCase().indexOf(search) !== -1;
      var matchCategory = category === 'All' || (tx.category || 'Uncategorized') === category;
      var matchMin = min == null || amount >= min;
      var matchMax = max == null || amount <= max;
      return matchSearch && matchCategory && matchMin && matchMax;
    });
    var slice = list.slice(start, start + limit).map(function(tx) {
      var amount = Number(tx.amount) || 0;
      return {
        date: tx.date,
        dateFormatted: tx.date,
        description: tx.description || '',
        merchant: tx.description || '',
        name: tx.description || '',
        category: tx.category || 'Uncategorized',
        amount: amount,
        amountFormatted: _Config.formatCurrency_(Math.abs(amount)),
        type: amount >= 0 ? 'income' : 'expense'
      };
    });
    return { success: true, data: { transactions: slice, total: list.length, categories: Array.from(new Set(context.filteredTransactions.map(function(tx) { return tx.category || 'Uncategorized'; }))).sort() } };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getClassicTransactions: ' + e.message, 'getClassicTransactions', e.stack);
    return { success: false, error: e.message, data: { transactions: [], total: 0, categories: [] } };
  }
}

function getCalendarData(opts) {
  try {
    opts = opts || {};
    var view = opts.view || 'month';
    var anchorDate = opts.anchorDate || null;
    return { success: true, data: _buildCalendarWindowData_(view, anchorDate) };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getCalendarData: ' + e.message, 'getCalendarData', e.stack);
    return { success: false, error: e.message, data: { view: 'month', days: [] } };
  }
}

function getCalendarDayData(opts) {
  try {
    var dateStr = opts && opts.date ? opts.date : null;
    return { success: true, data: _getCalendarDayData_(dateStr) };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getCalendarDayData: ' + e.message, 'getCalendarDayData', e.stack);
    return { success: false, error: e.message, data: { transactions: [] } };
  }
}

function saveCalendarNote(opts) {
  try {
    var dateStr = opts && opts.date ? String(opts.date) : '';
    if (!dateStr) return { success: false, error: 'date required' };
    var notes = _getCalendarNotesMap_();
    notes[dateStr] = { emoji: (opts && opts.emoji) ? String(opts.emoji) : '', note: (opts && opts.note) ? String(opts.note) : '' };
    _saveCalendarNotesMap_(notes);
    return { success: true, data: notes[dateStr] };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function deleteCalendarNote(opts) {
  try {
    var dateStr = opts && opts.date ? String(opts.date) : '';
    if (!dateStr) return { success: false, error: 'date required' };
    var notes = _getCalendarNotesMap_();
    delete notes[dateStr];
    _saveCalendarNotesMap_(notes);
    return { success: true, data: { ok: true } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getCalendarNotes(opts) {
  try {
    opts = opts || {};
    var notes = _getCalendarNotesMap_();
    if (!opts.fromIso || !opts.toIso) return { success: true, data: notes };
    var out = {};
    Object.keys(notes).forEach(function(key) {
      if (key >= opts.fromIso && key <= opts.toIso) out[key] = notes[key];
    });
    return { success: true, data: out };
  } catch (e) {
    return { success: false, error: e.message, data: {} };
  }
}

function getGoalsData() {
  try {
    return { success: true, data: { goals: _getGoalsList_() } };
  } catch (e) {
    return { success: false, error: e.message, data: { goals: [] } };
  }
}

function addGoal(opts) {
  try {
    var goals = _getGoalsList_();
    var row = {
      name: String((opts && opts.name) || '').trim(),
      target: Number((opts && opts.target) || 0),
      current: Number((opts && opts.current) || 0)
    };
    if (!row.name || !isFinite(row.target) || row.target <= 0 || !isFinite(row.current) || row.current < 0) {
      return { success: false, error: 'Invalid goal data' };
    }
    goals.push(row);
    _saveGoalsList_(goals);
    return { success: true, data: { goals: goals } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function updateGoal(opts) {
  try {
    var goals = _getGoalsList_();
    var name = String((opts && opts.name) || '').trim();
    if (!name) return { success: false, error: 'Name required' };
    var target = Number((opts && opts.target) || 0);
    var current = Number((opts && opts.current) || 0);
    var idx = goals.findIndex(function(goal) { return String(goal.name || '').trim() === name; });
    var row = { name: name, target: target, current: current };
    if (idx >= 0) goals[idx] = row;
    else goals.push(row);
    _saveGoalsList_(goals);
    return { success: true, data: { goals: goals } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getHealthReport() {
  try {
    return { success: true, data: _buildHealthReportData_() };
  } catch (e) {
    return { success: false, error: e.message, data: { score: 0, issues: {} } };
  }
}

function getSourceInfo() {
  try {
    var txResult = _getTransactions(true);
    var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
    var settings = _Config.getEffectiveDataSettings_();
    return {
      success: true,
      data: {
        spreadsheetName: settings.source === 'external' ? 'External spreadsheet' : 'Bound spreadsheet',
        recordCount: txs.length,
        lastUpdated: _Config.lastFetchTime ? new Date(_Config.lastFetchTime).toISOString() : null,
        txSheet: _Config.RUNTIME.TRANSACTION_SHEET_NAME,
        sourceSpreadsheetId: settings.externalId || PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || ''
      }
    };
  } catch (e) {
    return { success: false, error: e.message, data: {} };
  }
}

function loadUserSettings() {
  try {
    var raw = _Config.getUserProp_(_Config.KEYS.SETTINGS_PROP_KEY) || '{}';
    var parsed = {};
    try { parsed = JSON.parse(raw); } catch (e) {}
    return { success: true, data: parsed };
  } catch (e) {
    return { success: false, error: e.message, data: {} };
  }
}

function getCurrentBalance(fromIso, toIso) {
  try {
    var context = _buildDashboardContext_('custom', fromIso || null, toIso || null);
    return { success: true, data: { balance: context.kpis.currentBalance } };
  } catch (e) {
    return { success: false, error: e.message, data: { balance: 0 } };
  }
}

function getDaysToPayday() {
  try {
    return { success: true, data: { days: _getDaysToPayday() } };
  } catch (e) {
    return { success: false, error: e.message, data: { days: null } };
  }
}

function getMetricsSummary() {
  try {
    var context = _buildDashboardContext_('30d', null, null);
    return { success: true, data: { burnRate: context.kpis.burnRate, projectedDaysToZero: context.kpis.projectedDaysToZero } };
  } catch (e) {
    return { success: false, error: e.message, data: { burnRate: 0, projectedDaysToZero: null } };
  }
}

function exportData(opts) {
  try {
    opts = opts || {};
    var range = opts.range || (opts.from && opts.to ? 'custom' : '30d');
    var fromIso = opts.from || opts.fromIso || null;
    var toIso = opts.to || opts.toIso || null;
    var context = _buildDashboardContext_(range, fromIso, toIso);
    var rows = ['Date,Description,Category,Amount'];
    context.filteredTransactions.forEach(function(tx) {
      var line = [
        '"' + String(tx.date || '').replace(/"/g, '""') + '"',
        '"' + String(tx.description || '').replace(/"/g, '""') + '"',
        '"' + String(tx.category || '').replace(/"/g, '""') + '"',
        Number(tx.amount || 0)
      ];
      rows.push(line.join(','));
    });
    return { success: true, data: { filename: 'financial-dashboard-export.csv', rowCount: context.filteredTransactions.length, content: rows.join('\n') } };
  } catch (e) {
    return { success: false, error: e.message, data: { content: '' } };
  }
}

function syncFromSourceSheet() {
  try {
    var t0 = Date.now();
    _Config.clearCache_();
    var txResult = _getTransactions(false);
    var count = (txResult && txResult.transactions) ? txResult.transactions.length : 0;
    return { status: 'ok', rowsCopied: count, rowsSynced: count, durationMs: Date.now() - t0 };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function labsClearCaches() {
  return clearCachesOnly();
}

/**
 * SACRED: charts data for range.
 */
function getChartsData(range, fromIso, toIso) {
  try {
    return _getChartsDataForRange(range || '30d', fromIso || null, toIso || null);
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getChartsData: ' + e.message, 'getChartsData', e.stack);
    return { runningBalance: [], incomeVsExpense: [], spendingByCategory: [], budgetVsActual: [] };
  }
}

/**
 * SACRED: paginated transactions with range and optional type. Args: range, fromIso, toIso, offset, limit, type (optional 'income'|'expense').
 * Returns { transactions, total, offset, limit } (transactions have name, date, category, amount).
 */
function getTransactionsPaginatedWithRange(range, fromIso, toIso, offset, limit, type) {
  try {
    return _getTransactionsPaginatedWithRange(range || 'all', fromIso || null, toIso || null, offset || 0, limit || 25, type || 'all');
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getTransactionsPaginatedWithRange: ' + e.message, 'getTransactionsPaginatedWithRange', e.stack);
    return { transactions: [], total: 0, offset: 0, limit: 25 };
  }
}

/**
 * SACRED: recurring candidates (same description + amount, 2+ times).
 */
function getRecurringCandidatesData(opts) {
  try {
    var txResult = _getTransactions(true);
    var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
    var list = _getRecurringCandidatesList(txs);
    return { success: true, data: list };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getRecurringCandidatesData: ' + e.message, 'getRecurringCandidatesData', e.stack);
    return { success: false, data: [] };
  }
}

/**
 * SACRED: uncategorized transactions.
 */
function getUncategorizedTransactionsData(opts) {
  try {
    var range = (opts && opts.range) ? opts.range : 'all';
    var fromIso = (opts && opts.fromIso) ? opts.fromIso : null;
    var toIso = (opts && opts.toIso) ? opts.toIso : null;
    var list = _getUncategorizedTransactions(range, fromIso, toIso);
    return { success: true, data: list };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getUncategorizedTransactionsData: ' + e.message, 'getUncategorizedTransactionsData', e.stack);
    return { success: false, data: [] };
  }
}

/**
 * SACRED: transactions for a single day. opts = { date: 'YYYY-MM-DD' }.
 */
function getTransactionsForDay(opts) {
  try {
    var dateStr = (opts && opts.date) ? opts.date : null;
    if (!dateStr) return { success: false, data: [] };
    var list = _getTransactionsForDay(dateStr);
    return { success: true, data: list };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getTransactionsForDay: ' + e.message, 'getTransactionsForDay', e.stack);
    return { success: false, data: [] };
  }
}

/**
 * SACRED: analytics (category spend summary).
 */
function getAnalyticsData(opts) {
  try {
    var range = (opts && opts.range) ? opts.range : '30d';
    var fromIso = (opts && opts.fromIso) ? opts.fromIso : null;
    var toIso = (opts && opts.toIso) ? opts.toIso : null;
    return _getAnalyticsDataForRange(range, fromIso, toIso);
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getAnalyticsData: ' + e.message, 'getAnalyticsData', e.stack);
    return { data: { categories: [], summary: { totalExpenses: 0 } } };
  }
}

/**
 * SACRED: budgets + chart (actual by category). opts can have range.
 */
function getBudgetsData(opts) {
  try {
    var raw = _Config.getUserProp_(_Config.KEYS.BUDGETS_PROP_KEY) || '{}';
    var parsed = {};
    try { parsed = JSON.parse(raw); } catch (e) {}
    var budgetList = [];
    if (Array.isArray(parsed)) budgetList = parsed;
    else if (parsed && typeof parsed === 'object' && parsed.categories) budgetList = parsed.categories;
    else if (parsed && typeof parsed === 'object') budgetList = Object.entries(parsed).map(function(e) { return { category: e[0], amount: e[1] }; });
    var txResult = _getTransactions(true);
    var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
    var range = (opts && opts.range) ? opts.range : '90d';
    var filtered = _filterTransactionsByRange(txs, range, (opts && opts.fromIso) || null, (opts && opts.toIso) || null);
    var actualByCat = {};
    filtered.filter(function(t) { return t.amount < 0; }).forEach(function(t) {
      var cat = t.category || 'Uncategorized';
      actualByCat[cat] = (actualByCat[cat] || 0) + Math.abs(t.amount);
    });
    var categories = budgetList.map(function(b) { return (typeof b === 'object' && b.category) ? b.category : ''; });
    var actuals = budgetList.map(function(b) { var c = (typeof b === 'object' && b.category) ? b.category : ''; return actualByCat[c] || 0; });
    return {
      success: true,
      data: {
        budgets: budgetList.map(function(b) { return { category: (typeof b === 'object' && b.category) ? b.category : '', amount: (typeof b === 'object' && b.amount != null) ? b.amount : 0, period: (typeof b === 'object' && b.period) ? b.period : 'monthly' }; }),
        chart: { categories: categories, actual: actuals }
      }
    };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getBudgetsData: ' + e.message, 'getBudgetsData', e.stack);
    return { success: false, data: { budgets: [], chart: { categories: [], actual: [] } } };
  }
}

/**
 * SACRED: save a single budget row. b = { category, amount, period }.
 */
function updateBudget(b) {
  try {
    var category = (b && b.category) ? String(b.category).trim() : '';
    var amount = (b && b.amount != null) ? parseFloat(b.amount) : 0;
    if (!category) return { status: 'error', message: 'Category required' };
    var raw = _Config.getUserProp_(_Config.KEYS.BUDGETS_PROP_KEY) || '{}';
    var parsed = {};
    try { parsed = JSON.parse(raw); } catch (e) {}
    var list = [];
    if (Array.isArray(parsed)) list = parsed.slice();
    else if (parsed && parsed.categories) list = parsed.categories.slice();
    else if (parsed && typeof parsed === 'object') list = Object.entries(parsed).map(function(e) { return { category: e[0], amount: e[1] }; });
    var idx = list.findIndex(function(item) { var c = (typeof item === 'object' && item.category) ? item.category : item; return c === category; });
    var row = { category: category, amount: amount, period: (b && b.period) ? b.period : 'monthly' };
    if (idx >= 0) list[idx] = row; else list.push(row);
    _Config.setUserProp_(_Config.KEYS.BUDGETS_PROP_KEY, JSON.stringify(list));
    return { status: 'success' };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'updateBudget: ' + e.message, 'updateBudget', e.stack);
    return { status: 'error', message: e.message };
  }
}

/**
 * SACRED: smart budget suggestions (3-month average). Returns { success, data: [{ category, suggestedMonthly, avgSpend3m }] }.
 */
function getSmartBudgetSuggestions() {
  try {
    var arr = _getSmartBudgetSuggestions();
    var data = (arr || []).map(function(s) {
      return {
        category: s.category,
        suggestedMonthly: s.suggestedLimit || 0,
        avgSpend3m: (s.suggestedLimit && s.suggestedLimit * 3) || 0
      };
    });
    return { success: true, data: data };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'getSmartBudgetSuggestions: ' + e.message, 'getSmartBudgetSuggestions', e.stack);
    return { success: false, data: [] };
  }
}

/**
 * SACRED: get config value. key e.g. 'source_spreadsheet', defaultValue if missing.
 */
function getConfig(key, defaultValue) {
  try {
    if (key === 'source_spreadsheet') {
      var settings = _Config.getEffectiveDataSettings_();
      if (settings.source === 'external' && settings.externalId) return settings.externalId;
      try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        return ss ? ss.getId() : (defaultValue || 'Active spreadsheet');
      } catch (e) {
        return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || defaultValue || 'Active spreadsheet';
      }
    }
    return defaultValue != null ? defaultValue : '';
  } catch (e) {
    return defaultValue != null ? defaultValue : '';
  }
}

/**
 * SACRED: accounts (from net worth or placeholder).
 */
function getAccounts() {
  try {
    var raw = _Config.getUserProp_(_Config.KEYS.NET_WORTH_KEY) || '{"assets":[],"liabilities":[]}';
    var nw = {};
    try { nw = JSON.parse(raw); } catch (e) {}
    var assets = (nw.assets || []).map(function(a) { return { name: a.name || 'Asset', balance: a.value || a.balance || 0 }; });
    var accounts = assets.length ? assets : [{ name: 'Primary', balance: 0 }];
    return accounts;
  } catch (e) {
    return [{ name: 'Primary', balance: 0 }];
  }
}

/**
 * SACRED: clear server caches only (no full reload).
 */
function clearCachesOnly() {
  try {
    _Config.clearCache_();
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/**
 * SACRED: AI-generated financial insights (short text from KPIs).
 */
function getAiFinancialInsights() {
  try {
    var summary = _getDashboardSummaryData('30d', null, null);
    var k = summary.kpis || {};
    var lines = [];
    if (Number(k.savingsRate) > 20) lines.push('Your savings rate is ' + k.savingsRate + '%. Keep it up.');
    if (Number(k.netCashFlow) > 0) lines.push('Positive cash flow this period: £' + Number(k.netCashFlow).toFixed(2) + '.');
    if (Number(k.daysUntilPayday) <= 7) lines.push('Payday in ' + k.daysUntilPayday + ' days.');
    var text = lines.length ? lines.join(' ') : 'Add more transactions to get personalized insights.';
    return { success: true, data: { text: text } };
  } catch (e) {
    return { success: true, data: { text: 'Insights will appear once you have more data.' } };
  }
}

function getMatrixData(startDate, endDate) {
  try {
    return _get3DMatrixData(startDate || null, endDate || null);
  } catch (e) {
    console.error('getMatrixData error:', e);
    return { x: [], y: [], z: [] };
  }
}

function fetchSankeyData(startDate, endDate) {
  try {
    return _getSankeyData(startDate || null, endDate || null);
  } catch (e) {
    console.error('fetchSankeyData error:', e);
    return { labels: [], sources: [], targets: [], values: [], colors: [] };
  }
}

function getSmartBudgets() {
  try {
    return _getSmartBudgetSuggestions();
  } catch (e) {
    console.error('getSmartBudgets error:', e);
    return [];
  }
}

function getForecastData(adjustments) {
  try {
    return _calculateForecast(adjustments || { incomeMod: 0, expenseMod: 0 });
  } catch (e) {
    console.error('getForecastData error:', e);
    return [];
  }
}

function testExternalConnection(sheetId) {
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName(_Config.RUNTIME.TRANSACTION_SHEET_NAME);
    
    if (sheet) {
      return { success: true, name: ss.getName() };
    } else {
      return { 
        success: false, 
        message: `Tab '${_Config.RUNTIME.TRANSACTION_SHEET_NAME}' not found in that sheet.` 
      };
    }
  } catch (e) {
    return { 
      success: false, 
      message: 'Invalid ID or No Permission. Ensure the sheet is shared with you.' 
    };
  }
}

function updateDataSource(sourceType, externalId) {
  try {
    const currentSettings = JSON.parse(_Config.getUserProp_(_Config.KEYS.SETTINGS_PROP_KEY) || '{}');
    currentSettings.source = sourceType;
    currentSettings.externalId = externalId;

    _Config.setUserProp_(_Config.KEYS.SETTINGS_PROP_KEY, JSON.stringify(currentSettings));
    _Config.clearCache_(); // Ensure next read uses new sheet
    _logSystem('INFO', 'Data source updated', `Source: ${sourceType}, ID: ${externalId || 'none'}`);
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function saveUserSettings(settings) {
  try {
    _Config.setUserProp_(_Config.KEYS.SETTINGS_PROP_KEY, JSON.stringify(settings));
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function saveFinalBudgets(budgetMap) {
  try {
    _Config.setUserProp_(_Config.KEYS.BUDGETS_PROP_KEY, JSON.stringify(budgetMap));
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function saveNetWorth(data) {
  try {
    _Config.setUserProp_(_Config.KEYS.NET_WORTH_KEY, JSON.stringify(data));
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function processImportData(dataArray) {
  try {
    return _saveImportedTransactions(dataArray);
  } catch (e) {
    console.error('processImportData error:', e);
    return false;
  }
}

function getAISuggestion(description) {
  try {
    return suggestCategory(description);
  } catch (e) {
    return 'Uncategorized';
  }
}

function setUserProp(key, value) {
  try {
    if (!key || typeof key !== 'string') {
      return { status: 'error', message: 'Invalid key' };
    }
    _Config.setUserProp_(key, value);
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/**
 * Logs to Logger and _SystemLog sheet. Optionally appends to ScriptProperty DIAGNOSTIC_LOG (last 10 entries) for Web App retrieval.
 * @param {string} level - INFO, WARN, ERROR
 * @param {string} message
 * @param {string} [source] - Function or module name
 * @param {string} [detail] - Stack trace or extra context
 */
function _logSystem(level, message, source, detail) {
  var sourceName = source || 'API';
  var fullMsg = message + (detail ? ' | ' + detail : '');
  try {
    Logger.log(level + ': ' + fullMsg + ' (' + sourceName + ')');
  } catch (e) {}
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      var logSheet = ss.getSheetByName('_SystemLog');
      if (logSheet) logSheet.appendRow([new Date(), level, message, sourceName].concat(detail ? [detail] : []));
    }
  } catch (e) {}
  try {
    var key = 'DIAGNOSTIC_LOG';
    var maxEntries = 10;
    var arr = [];
    var existing = PropertiesService.getScriptProperties().getProperty(key);
    if (existing) try { arr = JSON.parse(existing); } catch (e) { arr = []; }
    arr.push({ t: new Date().toISOString(), level: level, message: message, source: sourceName, detail: detail || '' });
    if (arr.length > maxEntries) arr = arr.slice(-maxEntries);
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(arr));
  } catch (e) {}
}