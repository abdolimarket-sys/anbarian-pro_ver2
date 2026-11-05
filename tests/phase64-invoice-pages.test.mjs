import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles/main.css',import.meta.url),'utf8');
test('phase 64 gives sales, purchase and receipts separate page navigation',()=>{
  assert.match(ui,/data-commerce-tab="sale"/);
  assert.match(ui,/data-commerce-tab="purchase"/);
  assert.match(ui,/data-commerce-tab="receipts"/);
  assert.match(ui,/invoiceRows\(activeInvoiceType\)/);
});
test('phase 64 removes fiscal year selection from invoices and derives period from invoice date',()=>{
  assert.doesNotMatch(ui,/id="invoicePeriod"/);
  assert.match(ui,/function invoicePeriodForDate\(date:string\)/);
  assert.match(ui,/const fiscalPeriodId=invoicePeriodForDate\(invoiceDate\)/);
  assert.match(ui,/status==='open'&&date>=p.startDate&&date<=p.endDate/);
});
test('phase 64 keeps separate purchase and sales party selection and adds responsive page styling',()=>{
  assert.match(ui,/partyOptions\(isSaleInvoiceType\(activeInvoiceType\)\?'customer':'supplier'\)/);
  assert.match(css,/commerce-page-header/);
  assert.match(css,/commerce-section-nav/);
});
