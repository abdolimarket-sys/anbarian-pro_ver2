import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui = readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');
test('invoice form does not ask for issuer profile; logged-in user is the issuer', () => {
  assert.doesNotMatch(ui, /مشخصات صادرکننده فاکتور|sellerProfileSave|sellerName|sellerNationalId/);
  assert.doesNotMatch(css, /commerce-seller-profile/);
});
test('invoice keeps customer/supplier, number and date fields', () => {
  assert.match(ui, /invoiceNumber/);
  assert.match(ui, /invoiceParty/);
  assert.match(ui, /invoiceDate/);
});
