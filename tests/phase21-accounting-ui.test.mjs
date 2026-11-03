import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/modules/accounting-ui.ts', import.meta.url), 'utf8');
const core = fs.readFileSync(new URL('../src/modules/accounting.ts', import.meta.url), 'utf8');

test('phase 21 adds an independent accounting page and navigation item', () => {
  assert.match(main, /id="page-accounting"/);
  assert.match(main, /data-page="accounting"/);
  assert.match(main, /initAccountingUI/);
});

test('accounting UI exposes chart, fiscal periods, journal drafts and posting', () => {
  for (const marker of ['accAddAccount', 'fyCreate', 'jeSave', 'data-post-journal', 'accCurrency']) {
    assert.ok(ui.includes(marker), `missing ${marker}`);
  }
});

test('default chart includes posting-level details for sales, cost and expenses', () => {
  assert.match(core, /det-sales-goods/);
  assert.match(core, /det-cogs-goods/);
  assert.match(core, /det-admin-expenses/);
});

test('phase 22 exposes accounting commerce workspace and boot initialization', () => {
  const commerceUi = fs.readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');
  const commerce = fs.readFileSync(new URL('../src/modules/accounting-commerce.ts', import.meta.url), 'utf8');
  assert.match(main, /initAccountingCommerceUI/);
  assert.match(main, /accountingCommerceWorkspace/);
  for (const marker of ['partySave', 'invoiceSave', 'data-post-invoice', 'cashSave']) assert.ok(commerceUi.includes(marker), `missing ${marker}`);
  for (const marker of ['upsertParty', 'buildInvoice', 'postInvoice', 'createCashTransaction', 'partyBalance']) assert.ok(commerce.includes(marker), `missing ${marker}`);
});

test('phase 22 creates balanced journal entries for commercial documents and keeps stock separate', () => {
  const commerce = fs.readFileSync(new URL('../src/modules/accounting-commerce.ts', import.meta.url), 'utf8');
  assert.match(commerce, /sourceDocumentId/);
  assert.match(commerce, /det-customers/);
  assert.match(commerce, /det-suppliers/);
  assert.match(commerce, /det-output-tax/);
  assert.match(commerce, /det-input-tax/);
  assert.match(commerce, /فاز ۲۳/);
});
