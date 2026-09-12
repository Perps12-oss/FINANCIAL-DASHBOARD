#!/usr/bin/env node
/**
 * CI gates for the Google Apps Script financial dashboard.
 * Cannot execute Tests.gs inside Apps Script from GitHub Actions, so this
 * enforces parseability, required files, and the backend test contract.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as acorn from "acorn";
import { Parser } from "htmlparser2";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED = [
  "appsscript.json",
  "Code.gs",
  "Config.gs",
  "Data.gs",
  "Api.gs",
  "AI.gs",
  "Tests.gs",
  "Index.html",
  "JavaScript.html",
  "Styles.html",
  "Start.html",
];
const TEST_FNS = [
  "testBootstrapPayload_",
  "testTransactionParse_",
  "testSummaryReconciliation_",
  "testBudgetReconciliation_",
  "testForecastPayload_",
  "testImportWrite_",
  "runAllBackendTests_",
];

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function parseJs(file, source) {
  try {
    acorn.parse(source, { ecmaVersion: 2022, sourceType: "script", allowReturnOutsideFunction: true });
  } catch (err) {
    fail(`${file}: ${err.message}`);
  }
}

function parseHtml(file, source) {
  let error = null;
  const parser = new Parser(
    {},
    { xmlMode: false, recognizeSelfClosing: true },
  );
  try {
    parser.write(source);
    parser.end();
  } catch (err) {
    error = err;
  }
  if (error) fail(`${file}: ${error.message}`);
  if (!source.includes("<") ) fail(`${file}: not HTML`);
}

for (const rel of REQUIRED) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) fail(`missing required file ${rel}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "appsscript.json"), "utf8"));
if (manifest.runtimeVersion !== "V8") fail("appsscript.json runtimeVersion must be V8");
if (!manifest.timeZone) fail("appsscript.json missing timeZone");

const files = fs.readdirSync(ROOT);
for (const name of files) {
  const full = path.join(ROOT, name);
  if (!fs.statSync(full).isFile()) continue;
  const source = fs.readFileSync(full, "utf8");
  if (name.endsWith(".gs")) parseJs(name, source);
  if (name.endsWith(".html")) parseHtml(name, source);
}

const tests = fs.readFileSync(path.join(ROOT, "Tests.gs"), "utf8");
for (const fn of TEST_FNS) {
  if (!tests.includes(`function ${fn}`)) fail(`Tests.gs missing ${fn}`);
}

if (process.exitCode) {
  console.error("Apps Script CI failed.");
  process.exit(process.exitCode);
}
console.log("Apps Script CI passed: manifest, required files, parse, test contract.");
