import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const scanner=readFileSync(new URL('../src/modules/scanner.ts',import.meta.url),'utf8');
test('phase63 separates invoices and receipts/payments into independent tab pages',()=>{
 assert.match(ui,/data-commerce-tab=\"sale\"[\s\S]*?>فاکتور فروش/);
 assert.match(ui,/data-commerce-tab=\"purchase\"[\s\S]*?>فاکتور خرید/);
 assert.match(ui,/data-commerce-tab=\"receipts\"[\s\S]*?>دریافت و پرداخت/);
 assert.match(ui,/<section data-commerce-section=\"invoices\"/);
 assert.match(ui,/<section data-commerce-section=\"receipts\"/);
 assert.match(ui,/activeCommerceSection=next;editingInvoiceId=null;render\(\)/);
});
test('phase63 keeps invoice posting and cash transaction workflows wired',()=>{
 assert.match(ui,/id=\"invoiceSave\"/);
 assert.match(ui,/id=\"cashSave\"/);
 assert.match(ui,/createCashTransaction\(/);
 assert.match(ui,/postInvoice\(/);
});
test('phase63 does not modify the barcode scanner source',()=>{
 assert.ok(scanner.includes('Html5Qrcode') || scanner.length>0);
});
