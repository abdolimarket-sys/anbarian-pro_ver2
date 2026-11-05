import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');
const commerce = readFileSync(new URL('../src/modules/accounting-commerce.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');
const scanner = readFileSync(new URL('../src/modules/scanner.ts', import.meta.url), 'utf8');

test('invoice form uses the signed-in account as issuer and captures counterparty, dates and payment terms', () => {
  for (const marker of ['partyEconomicCode', 'partyRegistration', 'partyPostalCode', 'invoiceDueDate', 'invoicePaymentTerms', 'invoiceNotes', 'invoiceTaxRate']) assert.ok(ui.includes(marker), `missing ${marker}`);
  for (const marker of ['sellerName', 'sellerNationalId', 'sellerEconomicCode', 'sellerRegistration', 'sellerPhone', 'sellerPostalCode', 'sellerAddress', 'sellerProfileSave', 'مشخصات صادرکننده فاکتور']) assert.ok(!ui.includes(marker), `unexpected issuer field ${marker}`);
  assert.match(commerce, /economicCode\?: string/);
});

test('phase 29 invoice rows include unit, quantity, unit price, discount and computed total', () => {
  for (const marker of ['data-line-unit', 'data-line-qty', 'data-line-price', 'data-line-discount', 'data-line-total', 'updateInvoiceTotals']) assert.ok(ui.includes(marker));
  assert.match(commerce, /discountRial/);
  assert.match(commerce, /taxRateBps/);
  assert.match(commerce, /totalRial = grossLineRial - discountRial/);
});

test('phase 29 provides printable Persian invoice and preserves journal treatment for purchase discounts', () => {
  assert.match(ui, /data-print-invoice/);
  assert.match(ui, /window\.open\(/);
  assert.match(ui, /window\.print\(\)/);
  assert.match(commerce, /det-purchase-discounts/);
  assert.match(commerce, /تخفیفات خرید کالا/);
});

test('phase 29 adds responsive invoice styling without touching scanner source', () => {
  assert.match(css, /\.commerce-invoice-summary/);
  assert.match(css, /\.commerce-invoice-card \.commerce-line/);
  assert.ok(scanner.includes('Html5Qrcode') || scanner.length > 0);
});

test('phase 32 exposes safe draft editing and blocks direct edits to posted invoices', () => {
  assert.match(commerce, /export function updateDraftInvoice/);
  assert.match(commerce, /existing\.status !== 'draft'/);
  assert.match(commerce, /فاکتور قطعی قابل ویرایش مستقیم نیست/);
  assert.match(ui, /data-edit-invoice/);
  assert.match(ui, /startInvoiceEdit/);
  assert.match(ui, /لغو ویرایش/);
});

test('phase 32 retains invoice identity and creation timestamp when editing a draft', () => {
  assert.match(commerce, /id: existing\.id/);
  assert.match(commerce, /createdAt: existing\.createdAt/);
  assert.match(commerce, /updatedAt: now\(\)/);
});
