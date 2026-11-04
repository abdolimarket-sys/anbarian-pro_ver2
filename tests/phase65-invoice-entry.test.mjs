import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles/main.css',import.meta.url),'utf8');
test('phase 65 invoice number is generated separately for sales and purchases but remains editable',()=>{
  assert.match(ui,/function nextInvoiceNumber\(type:InvoiceType\)/);
  assert.match(ui,/type==='sale'\?'S':'P'/);
  assert.match(ui,/id="invoiceNumber" value="\$\{esc\(nextInvoiceNumber/);
  assert.match(ui,/شماره فاکتور \(خودکار؛ قابل تغییر\)/);
});
test('phase 65 defaults invoice date to Jalali today and converts calendar selection to Jalali',()=>{
  assert.match(ui,/function todayJalali\(\)/);
  assert.match(ui,/id="invoiceDate" value="\$\{todayJalali\(\)\}"/);
  assert.match(ui,/id="invoiceDatePicker"/);
  assert.match(ui,/en-US-u-ca-persian-nu-latn/);
});
test('phase 65 supports manual barcode, product search and phone camera scanning in invoice rows',()=>{
  assert.match(ui,/id="invoiceProductSearch"/);
  assert.match(ui,/id="invoiceBarcodeInput"/);
  assert.match(ui,/id="invoiceBarcodeAdd"/);
  assert.match(ui,/id="invoiceScanOpen"/);
  assert.match(ui,/addProductToInvoice\(product\.id\)/);
  assert.match(main,/__anbarinInvoiceScanActive/);
  assert.match(main,/anbarin:invoice-barcode-scan/);
});
test('phase 65 includes all five requested payment terms and orderly responsive line rows',()=>{
  for(const method of ['نقدی','چکی','اعتباری','ترکیبی','کارت‌خوان']) assert.ok(ui.includes(`value="${method}"`));
  assert.match(css,/commerce-invoice-card \.commerce-line/);
  assert.match(css,/invoice-product-tools/);
});

test('phase 65 leaves the scanner implementation unchanged',()=>{
  const scanner=readFileSync(new URL('../src/modules/scanner.ts',import.meta.url));
  assert.equal(createHash('sha256').update(scanner).digest('hex'),'483979e3ec3ddc323a8e9d4efb3e002e095fada019093a78be25b6c57ab50b70');
});
