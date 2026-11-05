import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/modules/management-anomaly.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const helperUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { detectManagementMonthAnomalies } = await import(helperUrl);

const ui = readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');

test('phase 55 flags adverse and favorable month-over-month movements', () => {
  const alerts = detectManagementMonthAnomalies([
    { month: '1405/01', salesRial: 100, expensesRial: 100, grossProfitRial: 50 },
    { month: '1405/02', salesRial: 70, expensesRial: 140, grossProfitRial: 80 },
  ], 20);
  assert.equal(alerts.length, 3);
  assert.ok(alerts.some(x => x.key === 'salesRial' && x.severity === 'warning' && x.percentChange === -30));
  assert.ok(alerts.some(x => x.key === 'expensesRial' && x.severity === 'warning' && x.percentChange === 40));
  assert.ok(alerts.some(x => x.key === 'grossProfitRial' && x.severity === 'positive' && x.percentChange === 60));
});

test('phase 55 ignores zero baselines and changes below threshold', () => {
  const alerts = detectManagementMonthAnomalies([
    { month: '1405/01', salesRial: 0, expensesRial: 100 },
    { month: '1405/02', salesRial: 500, expensesRial: 115 },
  ], 20);
  assert.equal(alerts.length, 0);
});

test('phase 55 validates threshold bounds', () => {
  assert.throws(() => detectManagementMonthAnomalies([], 0));
  assert.throws(() => detectManagementMonthAnomalies([], 501));
});

test('phase 55 adds a threshold selector and read-only alerts to the filtered dashboard', () => {
  assert.match(ui, /هشدار تغییرات غیرعادی ماهانه/);
  assert.match(ui, /id="managementAnomalyThreshold"/);
  assert.match(ui, /detectManagementMonthAnomalies\(trendRows,threshold\)/);
  assert.match(ui, /__anbarinManagementCompareRows=trendRows/);
});
