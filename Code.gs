/**
 * MAIN ENTRY POINT — Financial Dashboard
 *
 * This file has two distinct contexts. Do not mix their assumptions.
 *
 * ─── WEB APP (doGet) ───
 * - Only doGet(e) runs. No SpreadsheetApp.getActiveSpreadsheet(), no getUi().
 * - Serves Start.html, Index (Classic), or Sacred.html by ?view= param.
 * - Data resolution is via script properties / user settings only (see Data.gs).
 *
 * ─── BOUND SPREADSHEET (menu / dialogs) ───
 * - onOpen(), setupSystem(), showHelp(), showDashboard(), showStartMenu(), showSacredDashboard().
 * - These require SpreadsheetApp.getUi() and optionally getActiveSpreadsheet().
 * - Only used when the script is bound to a Sheet and the user opens the menu.
 */

/** BOUND SPREADSHEET ONLY: builds menu when the container spreadsheet is opened. */
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
      .addItem('Run testGetDashboardData', 'runTestGetDashboardData')
      .addItem('Run backend tests', 'runBackendTests'))
    .addToUi();
}

/** BOUND SPREADSHEET ONLY: runs health check and shows alert. */
function runHealthCheck() {
  var result = checkDataConnection();
  var ui = SpreadsheetApp.getUi();
  if (ui) ui.alert(result.success ? 'Health check OK.\n' + (result.rowCount !== undefined ? result.rowCount + ' rows in sheet.' : '') : 'Health check failed: ' + result.message);
}

/** BOUND SPREADSHEET ONLY: runs testGetDashboardData and shows alert. */
function runTestGetDashboardData() {
  var result = testGetDashboardData();
  var ui = SpreadsheetApp.getUi();
  if (ui) ui.alert(result.success ? 'testGetDashboardData passed. Check View > Logs for details.' : 'testGetDashboardData failed: ' + (result.error || 'unknown'));
}

/** BOUND SPREADSHEET ONLY: runs backend regression tests (Tests.gs). */
function runBackendTests() {
  try {
    var r = runAllBackendTests_();
    var ui = SpreadsheetApp.getUi();
    if (ui) ui.alert('Backend tests: ' + r.passed + ' passed, ' + r.failed + ' failed.');
  } catch (e) {
    var ui = SpreadsheetApp.getUi();
    if (ui) ui.alert('runBackendTests error: ' + (e.message || e));
  }
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

/** BOUND SPREADSHEET ONLY: opens Classic dashboard in a modal dialog. */
function showDashboard() {
  var html = HtmlService.createTemplateFromFile('Index')
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

/** BOUND SPREADSHEET ONLY: opens SACRED dashboard in a modal dialog. */
function showSacredDashboard() {
  var html = HtmlService.createHtmlOutputFromFile('Sacred')
    .setWidth(1400)
    .setHeight(900)
    .setTitle('SACRED Financial Dashboard');
  SpreadsheetApp.getUi().showModalDialog(html, 'SACRED Financial Dashboard - Enhanced Edition');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** BOUND SPREADSHEET ONLY: initializes sheets and sample data. Not used in web app. */
function setupSystem() {
  var ui = SpreadsheetApp.getUi();
  if (!ui) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
  var ui = SpreadsheetApp.getUi();
  if (!ui) return;
  var html = HtmlService.createHtmlOutput(`
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
  ui.showModalDialog(html, 'Help & Setup');
}