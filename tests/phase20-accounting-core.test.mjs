import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const accounting = read('src/modules/accounting.ts');
const storage = read('src/modules/storage.ts');
const main = read('src/main.ts');
const scanner = read('src/modules/scanner.ts');

test('phase 20 accounting data is isolated in existing IndexedDB kv store', () => {
  assert.match(accounting, /accounting_phase20_data/);
  assert.match(accounting, /accounting_phase20_backup/);
  assert.match(accounting, /idbGet/);
  assert.match(accounting, /idbPut/);
  assert.match(storage, /const DB_VERSION = 1/);
  assert.match(storage, /createObjectStore\(STORE\)/);
});

test('all ledger amounts are stored as integer rial and currency display is selectable', () => {
  assert.match(accounting, /debitRial: number/);
  assert.match(accounting, /creditRial: number/);
  assert.match(accounting, /currencyDisplay: CurrencyDisplay/);
  assert.match(accounting, /parseMoneyToRial/);
  assert.match(accounting, /formatMoneyFromRial/);
  assert.match(accounting, /Number\.isSafeInteger/);
});

test('chart hierarchy and journal balancing validations exist', () => {
  assert.match(accounting, /SUGGESTED_CHART/);
  assert.match(accounting, /validateAccount/);
  assert.match(accounting, /validateJournalEntry/);
  assert.match(accounting, /جمع بدهکار و بستانکار باید برابر باشد/);
  assert.match(accounting, /حساب پایه سیستمی حذف نمی‌شود/);
});

test('Jalali fiscal periods reject overlap and closed periods reject posting', () => {
  assert.match(accounting, /YYYY\/MM\/DD شمسی/);
  assert.match(accounting, /بازه سال مالی با یک سال مالی دیگر هم‌پوشانی دارد/);
  assert.match(accounting, /سال مالی بسته است/);
  assert.match(accounting, /closeFiscalPeriod/);
});

test('phase 20 leaves scanner and current application entry untouched', () => {
  assert.ok(main.includes("from './modules/scanner'"));
  assert.ok(scanner.includes('html5-qrcode'));
  assert.ok(fs.existsSync(new URL('../src/modules/inventory-documents.ts', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../src/modules/team-sync.ts', import.meta.url)));
});
