/**
 * CORE DATA ENGINE v2.0
 * Enhanced with caching, robust parsing, and smarter analytics.
 */

const _Config = (function() {
  // Constants
  const RUNTIME = {
    TRANSACTION_SHEET_NAME: 'Personal Account Transactions',
    CURRENCY_SYMBOL: '£',
    DEFAULT_TIMEZONE: 'Europe/London',
    PAYDAY_DAY: 3,
    MAX_CATEGORIES: 10,
    CACHE_DURATION_MS: 60000 // 1 minute cache for script runtime
  };
  
  // Storage Keys
  const KEYS = {
    SETTINGS_PROP_KEY: 'USER_SETTINGS',
    BUDGETS_PROP_KEY: 'USER_BUDGETS',
    GOALS_PROP_KEY: 'USER_GOALS',
    NET_WORTH_KEY: 'USER_NET_WORTH',
    OPENAI_API_KEY: 'OPENAI_API_KEY',
    LAST_REFRESH: 'LAST_REFRESH'
  };
  
  // AI Configuration
  const AI = {
    PROVIDER: 'openai',
    OPENAI: {
      BASE: 'https://api.openai.com/v1/chat/completions',
      MODEL: 'gpt-4o-mini'
    },
    TIMEOUT_MS: 10000
  };

  // Runtime Cache
  let cachedTransactions_ = null;
  let lastFetchTime_ = 0;
  
  // Helper functions
  function getUserProp_(key) { 
    return PropertiesService.getUserProperties().getProperty(key); 
  }
  
  function setUserProp_(key, value) { 
    PropertiesService.getUserProperties().setProperty(key, value); 
  }

  /**
   * Clears the in-memory transaction cache.
   * Call this after saving new transactions.
   */
  function clearCache_() {
    cachedTransactions_ = null;
    lastFetchTime_ = 0;
  }

  /**
   * Formats a number as currency based on locale settings.
   */
  function formatCurrency_(amount) {
    return `${RUNTIME.CURRENCY_SYMBOL}${parseFloat(amount).toFixed(2)}`;
  }
  var SCRIPT_KEY_DATA_SHEET_ID = 'DATA_SHEET_ID';
  function getEffectiveDataSettings_() {
    var userJson = getUserProp_(KEYS.SETTINGS_PROP_KEY);
    if (userJson && userJson.trim() !== '') {
      try {
        var parsed = JSON.parse(userJson);
        if (parsed && ((parsed.source === 'external' && parsed.externalId) || parsed.source === 'active')) return parsed;
      } catch (e) {}
    }
    var scriptId = PropertiesService.getScriptProperties().getProperty(SCRIPT_KEY_DATA_SHEET_ID);
    if (scriptId && scriptId.trim() !== '') return { source: 'external', externalId: scriptId.trim() };
    return { source: 'active' };
  }
  return {
    RUNTIME,
    KEYS,
    AI,
    SCRIPT_KEY_DATA_SHEET_ID: SCRIPT_KEY_DATA_SHEET_ID,
    getEffectiveDataSettings_,
    getUserProp_,
    setUserProp_,
    clearCache_,
    formatCurrency_,
    get cachedTransactions() { return cachedTransactions_; },
    set cachedTransactions(val) { cachedTransactions_ = val; },
    get lastFetchTime() { return lastFetchTime_; },
    set lastFetchTime(val) { lastFetchTime_ = val; }
  };
})();

/**
 * Fetches and parses transaction data with in-memory caching.
 * @param {boolean} [useCache=true]
 * @returns {{ transactions: Array, totalRows: number, validation: { valid: boolean, errors: string[], warnings: string[] } }}
 */
function _getTransactions(useCache) {
  if (useCache === undefined) useCache = true;
  var now = Date.now();
  if (useCache && _Config.cachedTransactions && (now - _Config.lastFetchTime < _Config.RUNTIME.CACHE_DURATION_MS)) {
    return { transactions: _Config.cachedTransactions, totalRows: _Config.cachedTransactions.length, validation: { valid: true, errors: [], warnings: [] } };
  }
  try {
    var rawResult = _getCoreTransactionData();
    if (rawResult.error) {
      return { transactions: [], totalRows: 0, validation: { valid: false, errors: [rawResult.error], warnings: [] } };
    }
    var parseResult = _parseTransactions(rawResult.rows || []);
    var parsed = parseResult.transactions || [];
    _Config.cachedTransactions = parsed;
    _Config.lastFetchTime = now;
    return { transactions: parsed, totalRows: parsed.length, validation: parseResult.validation || { valid: true, errors: [], warnings: [] } };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', '_getTransactions failed: ' + e.message, '_getTransactions', e.stack);
    return { transactions: [], totalRows: 0, validation: { valid: false, errors: [e.message], warnings: [] } };
  }
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
    if (settings.source === 'external' && settings.externalId) {
      ss = SpreadsheetApp.openById(settings.externalId);
    } else {
      try {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      } catch (activeErr) {
        var scriptId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || PropertiesService.getScriptProperties().getProperty(_Config.SCRIPT_KEY_DATA_SHEET_ID);
        if (scriptId) ss = SpreadsheetApp.openById(scriptId);
        else return { rows: [], error: 'Set Script Property DATA_SHEET_ID, or open the bound spreadsheet and run Initialize System.' };
      }
    }
    if (!ss) return { rows: [], error: 'Spreadsheet not found.' };
    sheet = ss.getSheetByName(_Config.RUNTIME.TRANSACTION_SHEET_NAME);
    if (!sheet) {
      if (typeof _logSystem === 'function') _logSystem('WARN', 'Sheet not found: ' + _Config.RUNTIME.TRANSACTION_SHEET_NAME, '_getCoreTransactionData');
      return { rows: [], error: "Sheet '" + _Config.RUNTIME.TRANSACTION_SHEET_NAME + "' not found in the spreadsheet." };
    }
    return { rows: sheet.getDataRange().getValues() };
  } catch (e) {
    if (typeof _logSystem === 'function') _logSystem('ERROR', 'Connection error: ' + e.message, '_getCoreTransactionData', e.stack);
    try {
      var scriptId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || PropertiesService.getScriptProperties().getProperty(_Config.SCRIPT_KEY_DATA_SHEET_ID);
      if (scriptId) {
        ss = SpreadsheetApp.openById(scriptId);
        sheet = ss.getSheetByName(_Config.RUNTIME.TRANSACTION_SHEET_NAME);
        return { rows: sheet ? sheet.getDataRange().getValues() : [] };
      }
    } catch (e2) {
      if (typeof _logSystem === 'function') _logSystem('ERROR', 'Fallback read failed: ' + e2.message, '_getCoreTransactionData');
    }
    return { rows: [], error: e.message || 'Connection failed.' };
  }
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
    var savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;
    var threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    var recentTxs = list.filter(function(t) { return new Date(t.date) >= threeMonthsAgo; });
    var monthsFound = recentTxs.length ? new Set(recentTxs.map(function(t) { return t.date.substring(0, 7); })).size : 1;
    var totalRecentIncome = recentTxs.filter(function(t) { return t.amount > 0; }).reduce(function(s, t) { return s + t.amount; }, 0);
    var totalRecentExpense = Math.abs(recentTxs.filter(function(t) { return t.amount < 0; }).reduce(function(s, t) { return s + t.amount; }, 0));
    return {
      balance: totalBalance.toFixed(2),
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

/**
 * Enhanced Payday Calculator with Weekend Handling
 */
function _getDaysToPayday() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  
  // Determine target month
  if (now.getDate() >= _Config.RUNTIME.PAYDAY_DAY) {
    month++;
    if (month > 11) { month = 0; year++; }
  }
  
  let payday = new Date(year, month, _Config.RUNTIME.PAYDAY_DAY);
  
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
    if (settings.source === 'external' && settings.externalId) {
      ss = SpreadsheetApp.openById(settings.externalId);
    } else {
      try {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      } catch (activeErr) {
        var scriptId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || PropertiesService.getScriptProperties().getProperty(_Config.SCRIPT_KEY_DATA_SHEET_ID);
        if (scriptId) ss = SpreadsheetApp.openById(scriptId);
      }
    }
    if (!ss) return { success: false, count: 0, message: "Database connection failed." };
  } catch (e) {
    return { success: false, count: 0, message: "Database connection failed." };
  }
  
  let sheet = ss.getSheetByName(_Config.RUNTIME.TRANSACTION_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(_Config.RUNTIME.TRANSACTION_SHEET_NAME);
    sheet.appendRow(['Date', 'Description', 'Amount', 'Category']);
  }
  
  const startRow = sheet.getLastRow() + 1;
  const endRow = startRow + newRows.length - 1;
  sheet.getRange(startRow, 1, endRow, 4).setValues(newRows);
  
  // 4. Clear cache so next fetch includes new data
  _Config.clearCache_();
  _Config.setUserProp_(_Config.KEYS.LAST_REFRESH, new Date().toISOString());
  
  return { success: true, count: newRows.length };
}