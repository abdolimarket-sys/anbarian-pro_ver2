import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
test('phase70 provides live partial-name, code and SKU suggestions with keyboard selection',()=>{
 assert.match(ui,/function invoiceProductMatches\(value:string\)/);
 assert.match(ui,/p\.name,p\.code\|\|''\,p\.sku\|\|''/);
 assert.match(ui,/renderInvoiceProductSuggestions\(searchInput\.value,suggestionIndex\)/);
 assert.match(ui,/ArrowDown/);
});
test('phase70 fills product unit, available stock and defined price on selection',()=>{
 assert.match(ui,/data-line-stock/);
 assert.match(ui,/product\.systemQty/);
 assert.match(ui,/product\.price/);
 assert.match(ui,/product\.unit\|\|'عدد'/);
});
test('phase70 unifies manual barcode and camera controls and adds each continuous scan directly',()=>{
 assert.match(ui,/invoice-barcode-entry/);
 assert.match(ui,/invoiceBarcodeInput/);
 assert.match(ui,/openScanner\(\{title:'اسکن پیوسته بارکد کالا برای فاکتور'\}\)/);
 assert.match(main,/if \(\(window as any\).__anbarinInvoiceScanActive\) \{\s*window\.dispatchEvent\(new CustomEvent\('anbarin:invoice-barcode-scan'/);
});
test('phase70 compact invoice item rows responsively for sales and purchases',()=>{
 assert.match(ui,/commerce-line/);
 const css=fs.readFileSync(new URL('../src/styles/main.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/Phase 70: live invoice product search/);
 assert.match(css,/@media\(max-width:560px\)/);
});
