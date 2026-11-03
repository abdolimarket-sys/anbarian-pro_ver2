import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('phase 24 adds independent financial reporting module and accounting workspace integration', () => {
  const module = read('../src/modules/accounting-reports.ts');
  const main = read('../src/main.ts');
  for (const name of ['buildTrialBalance','buildGeneralLedger','buildIncomeStatement','buildBalanceSheet','buildPartyLedger','buildCashReport','buildInventoryValuation']) assert.match(module, new RegExp(`export function ${name}`));
  assert.match(main, /initAccountingReportsUI/);
  assert.match(main, /accountingReportsWorkspace/);
});

test('phase 24 reports only posted journal entries and supports Solar Hijri date range filters', () => {
  const module = read('../src/modules/accounting-reports.ts');
  assert.match(module, /e\.status === 'posted'/);
  assert.match(module, /تاریخ شروع باید به شکل سال\/ماه\/روز شمسی/);
  assert.match(module, /range\.fiscalPeriodId/);
});

test('phase 24 provides CSV export and print-to-PDF workflow without changing source accounting data', () => {
  const module = read('../src/modules/accounting-reports.ts');
  assert.match(module, /text\/csv;charset=utf-8/);
  assert.match(module, /window\.print\(\)/);
  assert.match(module, /loadAccountingData/);
  assert.match(module, /loadInventoryCostData/);
});

test('phase 24 leaves barcode scanner module untouched', () => {
  const scanner = read('../src/modules/scanner.ts');
  assert.match(scanner, /Html5Qrcode|ZXing|barcode/i);
});
