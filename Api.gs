/**
 * PUBLIC API ENDPOINTS
 * All google.script.run calls go here.
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
function getDashboardData(forceRefresh) {
  var envelope = { success: false, data: null, error: null, meta: { fromCache: false, lastFetched: null, validation: { valid: true, errors: [], warnings: [] } } };
  try {
    var useCache = forceRefresh !== true;
    var txResult = _getTransactions(useCache);
    var transactions = (txResult && txResult.transactions) ? txResult.transactions : [];
    var validation = (txResult && txResult.validation) ? txResult.validation : envelope.meta.validation;
    envelope.meta.validation = validation;
    envelope.meta.fromCache = useCache && !!_Config.cachedTransactions;
    envelope.meta.lastFetched = _Config.lastFetchTime ? new Date(_Config.lastFetchTime).toISOString() : null;

    var settings = _Config.getEffectiveDataSettings_();
    var sheetOk = _validateSheetAccess_();
    if (!sheetOk.accessible) {
      envelope.error = sheetOk.error || 'Sheet not found or not accessible';
      _logSystem('WARN', envelope.error, 'getDashboardData');
      envelope.data = { transactions: [], settings: settings, budgets: {}, nw: { assets: [], liabilities: [] }, goals: [], kpis: _defaultKPIs_() };
      return envelope;
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

    envelope.success = true;
    envelope.data = {
      transactions: transactions,
      settings: settings,
      budgets: budgets,
      nw: nw,
      goals: goals,
      kpis: _calculateKPIs(transactions)
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