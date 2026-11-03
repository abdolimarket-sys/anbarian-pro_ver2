import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const report = fs.readFileSync(new URL('../src/modules/inventory-reconciliation.ts', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');
const scanner = fs.readFileSync(new URL('../src/modules/scanner.ts', import.meta.url), 'utf8');

test('phase60 compares operational quantity with costing quantity per product and warehouse', () => {
  assert.match(report, /systemQtyMilli/);
  assert.match(report, /costQtyMilli/);
  assert.match(report, /quantityDiffMilli/);
  assert.match(report, /new Set\(\[\.\.\.operational\.keys\(\),\.\.\.costMap\.keys\(\)\]\)/);
});

test('phase60 detects negative, orphaned, unvalued and quantity-mismatch rows', () => {
  for (const issue of ['negative-balance', 'orphan-cost-balance', 'quantity-mismatch', 'value-missing']) assert.ok(report.includes(issue));
});

test('phase60 compares inventory valuation with posted inventory ledger lines only', () => {
  assert.match(report, /j\.status==='posted'/);
  assert.match(report, /l\.accountId===inventoryAccount\.id/);
  assert.match(report, /debitRial-l\.creditRial/);
});

test('phase60 report is integrated into accounting commerce workspace', () => {
  assert.match(ui, /inventoryReconciliationPanel/);
  assert.match(ui, /buildInventoryReconciliation\(products,costing,accounting\)/);
  assert.match(ui, /تطبیق موجودی انبار و حسابداری/);
});

test('phase60 reconciliation is read-only and does not save inventory or accounting data', () => {
  assert.doesNotMatch(report, /saveInventoryCostData|saveAccountingData|idbPut/);
  assert.match(ui, /هیچ مقدار، سند یا مانده‌ای به‌صورت خودکار اصلاح نمی‌شود/);
});

test('phase60 preserves the barcode scanner source byte-for-byte', () => {
  const prior = fs.readFileSync('/mnt/data/phase58work/src/modules/scanner.ts', 'utf8');
  assert.equal(scanner, prior);
});
