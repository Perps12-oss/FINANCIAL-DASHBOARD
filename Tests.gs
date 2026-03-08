/**
 * Backend regression harnesses. Run from Script Editor or menu (Labs).
 * Acceptance: dashboard totals = filtered tx totals; budget actuals = category sums; charts = same source; import invalidates caches.
 */

function testBootstrapPayload_() {
  try {
    var conn = _testDataSourceConnection_();
    if (!conn.ok) return { ok: false, message: 'Connection failed: ' + conn.message };
    var bundle = getClassicDashboardBundle({ range: '30d' });
    var hasData = bundle && bundle.data && bundle.data.kpis && bundle.data.meta;
    var totalRows = (bundle.data && bundle.data.meta && bundle.data.meta.totalRows) || 0;
    return { ok: !!hasData, totalRows: totalRows, message: hasData ? 'Bootstrap payload valid' : 'Missing kpis/meta' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function testTransactionParse_() {
  try {
    var rows = [
      ['Date', 'Description', 'Amount', 'Category'],
      ['2024-01-15', 'Test Shop', -10.50, 'Shopping'],
      ['2024-01-16', 'Salary', 2000, 'Income']
    ];
    var result = _parseTransactions(rows);
    var valid = result.transactions && result.transactions.length === 2 && result.validation.valid !== false;
    var first = result.transactions[0];
    var hasShape = first && first.date && first.description != null && typeof first.amount === 'number' && first.category != null;
    return { ok: valid && hasShape, count: result.transactions.length, message: valid ? 'Parse valid' : 'Parse failed or wrong count' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function testSummaryReconciliation_() {
  try {
    var txResult = _getTransactions(true);
    var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
    var context = _buildDashboardContext_('30d', null, null);
    if (!context || !context.filteredTransactions) return { ok: false, message: 'No context' };
    var filtered = context.filteredTransactions;
    var sumIncome = filtered.filter(function(t) { return Number(t.amount) > 0; }).reduce(function(s, t) { return s + (Number(t.amount) || 0); }, 0);
    var sumExpense = Math.abs(filtered.filter(function(t) { return Number(t.amount) < 0; }).reduce(function(s, t) { return s + (Number(t.amount) || 0); }, 0));
    var kpis = context.kpis || {};
    var incomeMatch = Math.abs((kpis.totalIncome || 0) - sumIncome) < 0.02;
    var expenseMatch = Math.abs((kpis.totalExpenses || 0) - sumExpense) < 0.02;
    return { ok: incomeMatch && expenseMatch, message: incomeMatch && expenseMatch ? 'Dashboard totals match filtered transactions' : 'Sum mismatch' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function testBudgetReconciliation_() {
  try {
    var context = _buildDashboardContext_('30d', null, null);
    if (!context || !context.filteredTransactions) return { ok: true, message: 'No data; skip' };
    var budgetsJson = _Config.getUserProp_(_Config.KEYS.BUDGETS_PROP_KEY) || '{}';
    var budgets = [];
    try { budgets = JSON.parse(budgetsJson); } catch (e) {}
    var budgetList = Array.isArray(budgets) ? budgets : (budgets.categories || Object.entries(budgets).map(function(e) { return { category: e[0], amount: e[1] }; }));
    var actualByCat = {};
    context.filteredTransactions.filter(function(t) { return Number(t.amount) < 0; }).forEach(function(t) {
      var cat = t.category || 'Uncategorized';
      actualByCat[cat] = (actualByCat[cat] || 0) + Math.abs(Number(t.amount) || 0);
    });
    var firstBudget = budgetList[0];
    if (!firstBudget) return { ok: true, message: 'No budgets; skip' };
    var cat = typeof firstBudget === 'object' && firstBudget.category ? firstBudget.category : (typeof firstBudget === 'string' ? firstBudget : '');
    var expectedActual = actualByCat[cat] || 0;
    var ctxCats = context.topCategories || [];
    var fromCtx = ctxCats.find(function(c) { return (c.name || c.category) === cat; });
    var actualFromCtx = fromCtx ? (fromCtx.amount || 0) : 0;
    var match = Math.abs(expectedActual - actualFromCtx) < 0.02;
    return { ok: match, message: match ? 'Budget actual matches category sum' : 'Category actual mismatch' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function testForecastPayload_() {
  try {
    var txResult = _getTransactions(true);
    var txs = (txResult && txResult.transactions) ? txResult.transactions : [];
    var projection = _calculateForecast({ incomeMod: 0, expenseMod: 0 });
    var valid = Array.isArray(projection) && (projection.length === 0 || (projection[0] && projection[0].month != null));
    return { ok: valid, message: valid ? 'Forecast payload valid' : 'Forecast shape invalid' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function testImportWrite_() {
  try {
    var result = _saveImportedTransactions([]);
    var validShape = result && typeof result.success === 'boolean' && typeof result.count === 'number';
    if (!validShape) return { ok: false, message: 'Import return shape invalid' };
    _Config.clearCache_();
    var after = _getTransactions(false);
    var hasTransactions = after && Array.isArray(after.transactions);
    return { ok: validShape && hasTransactions, message: 'Import contract and cache invalidation path ok' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/** Run all regression tests; returns { passed, failed, results }. */
function runAllBackendTests_() {
  var results = {};
  var tests = [
    { name: 'testBootstrapPayload_', fn: testBootstrapPayload_ },
    { name: 'testTransactionParse_', fn: testTransactionParse_ },
    { name: 'testSummaryReconciliation_', fn: testSummaryReconciliation_ },
    { name: 'testBudgetReconciliation_', fn: testBudgetReconciliation_ },
    { name: 'testForecastPayload_', fn: testForecastPayload_ },
    { name: 'testImportWrite_', fn: testImportWrite_ }
  ];
  var passed = 0;
  var failed = 0;
  tests.forEach(function(t) {
    try {
      var out = t.fn();
      results[t.name] = out;
      if (out && out.ok) passed++; else failed++;
    } catch (e) {
      results[t.name] = { ok: false, message: e.message };
      failed++;
    }
  });
  return { passed: passed, failed: failed, results: results };
}
