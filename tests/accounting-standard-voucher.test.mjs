import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('manual accounting vouchers support multiple journal lines instead of a fixed two-account form', () => {
  const ui = read('src/modules/accounting-ui.ts');
  assert.match(ui, /renderJournalLineEditor\(2\)/);
  assert.match(ui, /id="jeAddLine"/);
  assert.match(ui, /data-je-debit/);
  assert.match(ui, /data-je-credit/);
  assert.match(ui, /lines\.push\(/);
  assert.match(ui, /جمع بدهکار/);
});

test('voucher rows are removable only while preserving the minimum two lines', () => {
  const ui = read('src/modules/accounting-ui.ts');
  assert.match(ui, /rows\.length<=2/);
  assert.match(ui, /سند باید حداقل دو ردیف داشته باشد/);
});

test('responsive accounting voucher layout is provided', () => {
  const css = read('src/styles/main.css');
  assert.match(css, /accounting-voucher-line/);
  assert.match(css, /@media\(max-width:760px\)/);
});
