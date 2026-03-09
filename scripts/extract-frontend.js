/**
 * One-time: extract from JavaScript.html and Styles.html into frontend/state.js, charts.js, app.js, styles.css
 * Run from repo root: node scripts/extract-frontend.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const JS_HTML = path.join(ROOT, 'JavaScript.html');
const STYLES_HTML = path.join(ROOT, 'Styles.html');

const jsRaw = fs.readFileSync(JS_HTML, 'utf8');
const styleRaw = fs.readFileSync(STYLES_HTML, 'utf8');

// Strip <script> and (function(){ "use strict"; ... })();
const scriptMatch = jsRaw.match(/<script>\s*\(function\(\)\s*\{\s*"use strict";\s*\n([\s\S]*)\}\s*\)\s*\(\s*\)\s*;\s*<\/script>/);
if (!scriptMatch) throw new Error('Could not parse JavaScript.html');
const lines = scriptMatch[1].split('\n');

// state.js: from start through end of ThemeOptions (last bit before "// 4. STATE PERSISTENCE")
let stateEnd = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('4. STATE PERSISTENCE')) { stateEnd = i; break; }
}
// Back up to include the blank line after ThemeOptions
while (stateEnd > 0 && lines[stateEnd - 1].trim() === '') stateEnd--;
const stateJs = lines.slice(0, stateEnd).join('\n');

// charts.js: from "    // 8. CHART RENDERER" through "    };" that closes ChartRenderer (before "    // 9. PAGE MODULES")
let chartsStart = 0, chartsEnd = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('8. CHART RENDERER')) chartsStart = i;
  if (chartsStart && lines[i].includes('9. PAGE MODULES')) { chartsEnd = i; break; }
}
const chartsJs = lines.slice(chartsStart, chartsEnd).join('\n');

// app.js: from "    // 4. STATE PERSISTENCE" through end (bootstrap)
let appStart = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('4. STATE PERSISTENCE')) { appStart = i; break; }
}
const appJs = lines.slice(appStart).join('\n');

if (!fs.existsSync(FRONTEND)) fs.mkdirSync(FRONTEND, { recursive: true });
fs.writeFileSync(path.join(FRONTEND, 'state.js'), stateJs, 'utf8');
fs.writeFileSync(path.join(FRONTEND, 'charts.js'), chartsJs, 'utf8');
fs.writeFileSync(path.join(FRONTEND, 'app.js'), appJs, 'utf8');
console.log('Wrote frontend/state.js, charts.js, app.js');

// styles.css: strip <style> and </style>
const styleMatch = styleRaw.match(/<style>\s*([\s\S]*)\s*<\/style>/);
if (!styleMatch) throw new Error('Could not parse Styles.html');
fs.writeFileSync(path.join(FRONTEND, 'styles.css'), styleMatch[1].trim(), 'utf8');
console.log('Wrote frontend/styles.css');
