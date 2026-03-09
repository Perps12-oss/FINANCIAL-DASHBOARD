/**
 * Bundle frontend source into JavaScript.html and Styles.html.
 * Run from repo root: npm run build  OR  node scripts/build-frontend.js
 *
 * CONCATENATION ORDER (fixed; do not change without updating docs):
 *   1. state.js   (Utils, ApiClient, AppState, PageMeta, ThemeOptions)
 *   2. charts.js  (ChartRenderer)
 *   3. app.js     (StateManager, Router, DataLoader, modules, bootstrap)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const OUT_JS_HTML = path.join(ROOT, 'JavaScript.html');
const OUT_STYLES_HTML = path.join(ROOT, 'Styles.html');

const JS_SOURCES = ['state.js', 'charts.js', 'app.js'];
const CSS_SOURCE = 'styles.css';

const BANNER_JS = `/* GENERATED FILE - DO NOT EDIT DIRECTLY
 * Source: frontend/state.js, frontend/charts.js, frontend/app.js
 * Build: npm run build  OR  node scripts/build-frontend.js
 */`;

const BANNER_CSS = `/* GENERATED FILE - DO NOT EDIT DIRECTLY
 * Source: frontend/styles.css
 * Build: npm run build  OR  node scripts/build-frontend.js
 */`;

function fail(msg) {
  console.error('Build failed:', msg);
  process.exit(1);
}

function read(name) {
  const p = path.join(FRONTEND, name);
  if (!fs.existsSync(p)) fail('Missing source: ' + p);
  return fs.readFileSync(p, 'utf8').trim();
}

function write(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
  } catch (e) {
    fail('Cannot write ' + filePath + ': ' + e.message);
  }
}

console.log('Building frontend...');
console.log('  Included:', JS_SOURCES.join(', '), '+', CSS_SOURCE);

// 1. Read all JS sources in fixed order
let stateJs, chartsJs, appJs, stylesCss;
try {
  stateJs = read('state.js');
  chartsJs = read('charts.js');
  appJs = read('app.js');
  stylesCss = read('styles.css');
} catch (e) {
  fail(e.message);
}

// 2. Build JavaScript.html (banner + IIFE wrapping the three files)
const scriptContent = [
  BANNER_JS,
  '',
  '(function() {',
  '  "use strict";',
  '',
  stateJs,
  '',
  chartsJs,
  '',
  appJs,
  '',
  '})();'
].join('\n');

const javascriptHtml = '<script>\n' + scriptContent + '\n</script>';
write(OUT_JS_HTML, javascriptHtml);
console.log('  Wrote:', OUT_JS_HTML);

// 3. Build Styles.html (banner + CSS)
const stylesHtml = '<style>\n' + BANNER_CSS + '\n\n' + stylesCss + '\n</style>';
write(OUT_STYLES_HTML, stylesHtml);
console.log('  Wrote:', OUT_STYLES_HTML);

console.log('Build succeeded.');
