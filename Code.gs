/**
 * MAIN ENTRY POINT
 * Financial Dashboard SaaS - Consolidated Version
 */

function onOpen() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
    }
  } catch (e) {}
  SpreadsheetApp.getUi()
    .createMenu('🚀 Financial Dashboard')
    .addItem('Start menu (choose dashboard)', 'showStartMenu')
    .addItem('Open Classic Dashboard', 'showDashboard')
    .addItem('Open SACRED Dashboard', 'showSacredDashboard')
    .addItem('Initialize System', 'setupSystem')
    .addSeparator()
    .addItem('Help & Setup', 'showHelp')
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Labs')
      .addItem('Run health check', 'runHealthCheck')
      .addItem('Run testGetDashboardData', 'runTestGetDashboardData'))
    .addToUi();
}

function runHealthCheck() {
  var result = checkDataConnection();
  SpreadsheetApp.getUi().alert(result.success ? 'Health check OK.\n' + (result.rowCount !== undefined ? result.rowCount + ' rows in sheet.' : '') : 'Health check failed: ' + result.message);
}

function runTestGetDashboardData() {
  var result = testGetDashboardData();
  SpreadsheetApp.getUi().alert(result.success ? 'testGetDashboardData passed. Check View > Logs for details.' : 'testGetDashboardData failed: ' + (result.error || 'unknown'));
}

function doGet(e) {
  var param = (e && e.parameter) ? e.parameter : {};
  var view = (param.view || '').toLowerCase();
  var output;
  if (view === 'sacred') {
    output = HtmlService.createHtmlOutputFromFile('Sacred')
      .setTitle('SACRED Financial Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (view === 'classic') {
    output = HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Financial Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else {
    output = HtmlService.createHtmlOutputFromFile('Start')
      .setTitle('Financial Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return output
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .addMetaTag('fd-runtime', 'web-app');
}

function showDashboard() {
  const html = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setWidth(1400)
    .setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, '💰 Financial Command Center');
}

function showStartMenu() {
  const html = HtmlService.createHtmlOutputFromFile('Start')
    .setWidth(500)
    .setHeight(380)
    .setTitle('Financial Dashboard');
  SpreadsheetApp.getUi().showModalDialog(html, 'Choose dashboard');
}

function showSacredDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('Sacred')
    .setWidth(1400)
    .setHeight(900)
    .setTitle('SACRED Financial Dashboard');
  SpreadsheetApp.getUi().showModalDialog(html, 'SACRED Financial Dashboard - Enhanced Edition');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function isWebAppRequest_(e) {
  return !!(e && e.parameter);
}

function getConfiguredSpreadsheetId_() {
  var settings = _Config.getEffectiveDataSettings_();
  if (settings && settings.source === 'external' && settings.externalId) return settings.externalId;
  var scriptId = PropertiesService.getScriptProperties().getProperty(_Config.SCRIPT_KEY_DATA_SHEET_ID);
  if (scriptId && scriptId.trim()) return scriptId.trim();
  var boundId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return boundId ? String(boundId).trim() : '';
}

function assertConfiguredDataSource_() {
  var id = getConfiguredSpreadsheetId_();
  if (!id) {
    return {
      ok: false,
      code: 'CONFIG_MISSING',
      message: 'No spreadsheet configured. Set DATA_SHEET_ID in Script Properties or run Initialize System in the bound spreadsheet.'
    };
  }
  return { ok: true, spreadsheetId: id };
}

function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  }
  // Create log sheet if missing
  if (!ss.getSheetByName('_SystemLog')) {
    const log = ss.insertSheet('_SystemLog');
    log.appendRow(['Timestamp', 'Level', 'Message', 'Source']);
  }
  
  // Create sample transactions sheet if none exists
  if (!ss.getSheetByName('Personal Account Transactions')) {
    const tx = ss.insertSheet('Personal Account Transactions');
    tx.appendRow(['Date', 'Description', 'Amount', 'Category']);
    tx.appendRow([new Date().toISOString().split('T')[0], 'Sample Salary', 2500.00, 'Income']);
    tx.appendRow([new Date().toISOString().split('T')[0], 'Sample Rent', -850.00, 'Housing']);
  }
  
  SpreadsheetApp.getUi().alert('✅ System initialized! Check sheets for sample data.');
}

function showHelp() {
  const html = HtmlService.createHtmlOutput(`
    <div style="padding:20px;font-family:sans-serif">
      <h2>📋 Quick Setup Guide</h2>
      <p><b>Default data source:</b> Data is pulled from an <b>external sheet</b> when you set <code>DATA_SHEET_ID</code> in <b>Script Properties</b> (Project settings → Script properties). Use your transaction spreadsheet’s ID (from its URL). If not set, the app uses the current (bound) sheet.</p>
      <p><b>Step 1:</b> In the script project: <b>Project Settings</b> → <b>Script properties</b> → add <code>DATA_SHEET_ID</code> = your spreadsheet ID (optional; makes that sheet the default source).</p>
      <p><b>Step 2:</b> In that spreadsheet, ensure a sheet named <code>Personal Account Transactions</code> exists with headers: Date, Description, Amount, Category (or run Initialize System from the bound sheet’s menu to create it there).</p>
      <p><b>Step 3:</b> In the Web App, click <b>Sync from source</b> to load data.</p>
      <p><b>Step 4:</b> To use a different sheet than the default, go to Settings in the app and choose External and paste a Sheet ID.</p>
      <p><b>Step 5:</b> For AI categorization, add <code>OPENAI_API_KEY</code> in Script Properties.</p>
      <hr>
      <p><b>📊 Features:</b> 3D Charts, Calendar, Forecast, Net Worth, Import</p>
    </div>
  `).setWidth(460).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, 'Help & Setup');
}