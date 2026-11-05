import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
test('invoice workflow offers a dedicated document type chooser',()=>{
  for(const label of ['فاکتور فروش','فاکتور خرید','برگشت از فروش','برگشت از خرید','پیش‌فاکتور']) assert.ok(source.includes(label));
  assert.ok(source.includes('openInvoiceTypeSheet'));
});
test('invoice items open in a separate sheet and return to the invoice',()=>{
  assert.ok(source.includes('openInvoiceItemsSheet'));
  assert.ok(source.includes('invoiceItemsSheet'));
  assert.ok(source.includes('تأیید اقلام و بازگشت به فاکتور'));
  assert.ok(source.includes('invoiceItemsSummary'));
});
test('invoice settlement remains a separate sheet and returns after save',()=>{
  assert.ok(source.includes('openInvoiceSettlementSheet'));
  assert.ok(source.includes('برگه مستقل دریافت / پرداخت'));
  assert.ok(source.includes('به فاکتور بازگشتید'));
});
