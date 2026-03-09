/**
 * MAIN ENTRY POINT — Financial Dashboard
 *
 * This file has two distinct contexts. Do not mix their assumptions.
 *
 * ─── WEB APP (doGet) ─────────────────────────────────────────────────────────
 * - Only doGet(e) runs. No SpreadsheetApp.getActiveSpreadsheet(), no getUi().
 * - Serves Start.html, Index (Classic), or Sacred.html based on ?view= param.
 * - Data resolution is via script properties / user settings only (see Data.gs).
 *
 * ─── BOUND SPREADSHEET (menu / dialogs) ─────────────────────────────────────
 * - onOpen(), setupSystem(), showHelp(), showDashboard(), showStartMenu(),
 *   showSacredDashboard().
 * - These require SpreadsheetApp.getUi() and optionally getActiveSpreadsheet().
 * - Only used when the script is bound to a Sheet and the user opens the menu.
 */

// =============================================================================
// Constants & Helpers
// =============================================================================

const SCRIPT_PROPERTY_KEYS = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  DATA_SHEET_ID: 'DATA_SHEET_ID',
  OPENAI_API_KEY: 'OPENAI_API_KEY'
};

/**
 * Safely returns the Ui instance if in a bound spreadsheet context, otherwise null.
 * @returns {GoogleAppsScript.Base.Ui|null}
 */
function getUiOrNull_() {
  try {
    return SpreadsheetApp.getUi();
  } catch (e) {
    return null;
  }
}

/**
 * Shows a simple alert modal in the bound spreadsheet.
 * @param {string} title
 * @param {string} message
 */
function showAlert_(title, message) {
  const ui = getUiOrNull_();
  if (ui) ui.alert(title, message, ui.ButtonSet.OK);
}

/**
 * Shows a modal dialog with custom HTML content.
 * @param {string} htmlContent - Raw HTML string or HtmlOutput object.
 * @param {string} title - Dialog title.
 * @param {number} width - Dialog width in pixels.
 * @param {number} height - Dialog height in pixels.
 */
function showModalDialog_(htmlContent, title, width = 600, height = 400) {
  const ui = getUiOrNull_();
  if (!ui) return;

  let htmlOutput;
  if (typeof htmlContent === 'string') {
    htmlOutput = HtmlService.createHtmlOutput(htmlContent)
      .setWidth(width)
      .setHeight(height);
  } else {
    // Assume it's already an HtmlOutput object
    htmlOutput = htmlContent.setWidth(width).setHeight(height);
  }
  ui.showModalDialog(htmlOutput, title);
}

// =============================================================================
// Bound Spreadsheet Only: Menu Creation
// =============================================================================

/** Creates the custom menu when the container spreadsheet is opened. */
function onOpen() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      PropertiesService.getScriptProperties().setProperty(
        SCRIPT_PROPERTY_KEYS.SPREADSHEET_ID,
        ss.getId()
      );
    }
  } catch (e) {
    // Not in a bound spreadsheet context – ignore
  }
  buildMenu_();
}

/** Builds and adds the custom menu to the spreadsheet UI. */
function buildMenu_() {
  const ui = getUiOrNull_();
  if (!ui) return;

  ui.createMenu('🚀 Financial Dashboard')
    .addItem('Open Dashboard', 'showDashboard')
    .addItem('Open in enhanced layout', 'showSacredDashboard')
    .addItem('Initialize System', 'setupSystem')
    .addSeparator()
    .addItem('Help & Setup', 'showHelp')
    .addSubMenu(
      ui.createMenu('Labs')
        .addItem('Run health check', 'runHealthCheck')
        .addItem('Run testGetDashboardData', 'runTestGetDashboardData')
        .addItem('Run backend tests', 'runBackendTests')
    )
    .addToUi();
}

// =============================================================================
// Bound Spreadsheet Only: Menu Action Functions
// =============================================================================

/** Runs health check and shows result. */
function runHealthCheck() {
  const result = checkDataConnection(); // from Data.gs
  const message = result.success
    ? `Health check OK.\n${result.rowCount !== undefined ? result.rowCount + ' rows in sheet.' : ''}`
    : `Health check failed: ${result.message}`;
  showAlert_('Health Check', message);
}

/** Runs testGetDashboardData and shows result. */
function runTestGetDashboardData() {
  const result = testGetDashboardData(); // from Data.gs
  const message = result.success
    ? 'testGetDashboardData passed. Check View > Logs for details.'
    : `testGetDashboardData failed: ${result.error || 'unknown'}`;
  showAlert_('Test Result', message);
}

/** Runs backend regression tests (Tests.gs). */
function runBackendTests() {
  try {
    const r = runAllBackendTests_(); // from Tests.gs
    showAlert_('Backend Tests', `Passed: ${r.passed}, Failed: ${r.failed}`);
  } catch (e) {
    showAlert_('Backend Tests Error', e.message || e);
  }
}

/** Initializes sheets and sample data. */
function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    showAlert_('Error', 'Not in a bound spreadsheet context.');
    return;
  }

  PropertiesService.getScriptProperties().setProperty(
    SCRIPT_PROPERTY_KEYS.SPREADSHEET_ID,
    ss.getId()
  );

  // Create log sheet if missing
  if (!ss.getSheetByName('_SystemLog')) {
    const logSheet = ss.insertSheet('_SystemLog');
    logSheet.appendRow(['Timestamp', 'Level', 'Message', 'Source']);
  }

  // Create sample transactions sheet if none exists
  if (!ss.getSheetByName('Personal Account Transactions')) {
    const txSheet = ss.insertSheet('Personal Account Transactions');
    txSheet.appendRow(['Date', 'Description', 'Amount', 'Category']);
    const today = new Date().toISOString().split('T')[0];
    txSheet.appendRow([today, 'Sample Salary', 2500.00, 'Income']);
    txSheet.appendRow([today, 'Sample Rent', -850.00, 'Housing']);
  }

  showAlert_('System Initialized', '✅ System initialized! Check sheets for sample data.');
}

/** Displays help & setup guide. */
function showHelp() {
  const html = `
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
  `;
  showModalDialog_(html, 'Help & Setup', 460, 420);
}

// =============================================================================
// Bound Spreadsheet Only: Dashboard Dialogs
// =============================================================================

/** Opens Classic dashboard in a modal dialog. */
function showDashboard() {
  const html = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('💰 Financial Command Center'); // for web app context
  showModalDialog_(html, '💰 Financial Command Center', 1400, 900);
}

/** Opens minimal landing page (Start.html) in a modal dialog. */
function showStartMenu() {
  const html = HtmlService.createHtmlOutputFromFile('Start')
    .setTitle('Financial Dashboard');
  showModalDialog_(html, 'Financial Dashboard', 420, 260);
}

/** Opens enhanced-layout dashboard (Sacred.html) in a modal dialog. */
function showSacredDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('Sacred')
    .setTitle('Financial Dashboard — Enhanced layout');
  showModalDialog_(html, 'Financial Dashboard — Enhanced layout', 1400, 900);
}

// =============================================================================
// Web App Only: doGet Entry Point
// =============================================================================

/**
 * Handles HTTP GET requests to the web app.
 * @param {Object} e - Event parameter containing query string.
 * @returns {HtmlOutput}
 */
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const view = (params.view || '').toLowerCase();

  let output;
  if (view === 'sacred') {
    output = HtmlService.createHtmlOutputFromFile('Sacred');
  } else if (view === 'start') {
    output = HtmlService.createHtmlOutputFromFile('Start');
  } else {
    // Default or 'classic'
    output = HtmlService.createTemplateFromFile('Index').evaluate();
  }

  return output
    .setTitle('Financial Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .addMetaTag('fd-runtime', 'web-app');
}

// =============================================================================
// Shared Utility: HTML Include Helper
// =============================================================================

/**
 * Returns the raw content of an HTML file (for templating includes).
 * @param {string} filename
 * @returns {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}