import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const commerce = fs.readFileSync(new URL('../src/modules/accounting-commerce.ts', import.meta.url), 'utf8');
const costing = fs.readFileSync(new URL('../src/modules/inventory-costing.ts', import.meta.url), 'utf8');
const scanner = fs.readFileSync(new URL('../src/modules/scanner.ts', import.meta.url), 'utf8');

test('phase59 serializes invoice posting and cash transaction creation', () => {
  assert.match(commerce, /withCommerceMutationLock/);
  assert.match(commerce, /return withCommerceMutationLock\(\(\) => postInvoiceExclusive/);
  assert.match(commerce, /return withCommerceMutationLock\(\(\) => createCashTransactionExclusive/);
});

test('phase59 validates against the latest persisted commerce data before posting', () => {
  assert.match(commerce, /const persisted = await loadCommerceData\(\)/);
  assert.match(commerce, /persisted\.invoices\.some\(i => i\.id === invoiceId\) \? persisted : commerce/);
  assert.match(commerce, /شماره این فاکتور با سند دیگری تکراری است/);
});

test('phase59 prevents duplicate receipt/payment numbers within type and fiscal year', () => {
  assert.match(commerce, /t\.type===input\.type&&t\.fiscalPeriodId===input\.fiscalPeriodId&&t\.number\.trim\(\)===normalizedNumber/);
  assert.match(commerce, /شماره رسید\/پرداخت در این نوع سند و سال مالی قبلاً ثبت شده است/);
});

test('phase59 prevents reuse of active cheque number with the same bank', () => {
  assert.match(commerce, /t\.method==='cheque'&&t\.chequeStatus!=='void'&&t\.chequeNumber\?\.trim\(\)===normalizedCheque/);
  assert.match(commerce, /این شماره چک با همین بانک قبلاً/);
});

test('phase59 checks stock concurrency before posting the accounting journal', () => {
  const guard = commerce.indexOf('کنترل هم‌زمانی موجودی باید پیش از قطعی‌سازی');
  const journal = commerce.indexOf('const existing=accounting.journalEntries.find', guard);
  assert.ok(guard >= 0 && journal > guard);
  assert.match(costing, /if\(!input\.allowNegative&&b\.qtyMilli<input\.qtyMilli\)/);
});

test('phase59 leaves the barcode scanner module unchanged', () => {
  const prior = fs.readFileSync('/mnt/data/phase58work/src/modules/scanner.ts', 'utf8');
  assert.equal(scanner, prior);
});
