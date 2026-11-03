import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const module = fs.readFileSync(new URL('../src/modules/accounting.ts', import.meta.url), 'utf8');

test('phase 25 exposes fiscal closing preview and checks draft entries', () => {
  assert.match(module, /export function previewFiscalClosing/);
  assert.match(module, /draftEntryCount/);
  assert.match(module, /سند پیش‌نویس تعیین تکلیف نشده است/);
});

test('phase 25 creates idempotent closing and opening drafts', () => {
  assert.match(module, /export function buildFiscalClosingEntry/);
  assert.match(module, /year-close:\$\{periodId\}/);
  assert.match(module, /export function buildFiscalOpeningEntry/);
  assert.match(module, /year-opening:\$\{previousPeriodId\}:\$\{nextPeriodId\}/);
  assert.match(module, /قبلاً ایجاد شده است/);
});

test('phase 25 carries permanent account balances and closes temporary accounts', () => {
  assert.match(module, /isTemporaryAccount/);
  assert.match(module, /preview\.permanentAccounts\.map/);
  assert.match(module, /preview\.temporaryAccounts/);
  assert.match(module, /مانده حساب‌های دائمی تراز نیست/);
});

test('phase 25 only finalizes after both closing and opening entries are posted', () => {
  assert.match(module, /export function finalizeFiscalYearClose/);
  assert.match(module, /سند اختتامیه هنوز قطعی نشده است/);
  assert.match(module, /سند افتتاحیه هنوز قطعی نشده است/);
  assert.match(module, /status: 'closed', closedAt: now\(\)/);
});
