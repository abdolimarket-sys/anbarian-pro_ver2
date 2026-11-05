import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
test('phase73 keeps receipt/payment entry focused on recording and transaction history',()=>{
 assert.match(ui,/data-commerce-tab="receipts"[\s\S]*?>دریافت و پرداخت/);
 assert.match(ui,/<section data-commerce-section="receipts"/);
 assert.match(ui,/id="cashSave"/);
 assert.match(ui,/cashRows\(\)/);
 const receipts=ui.split('<section data-commerce-section="receipts"')[1].split('<section data-commerce-section="cheques"')[0];
 assert.ok(receipts);
 assert.doesNotMatch(receipts,/chequePanel\(\)|agingPanel\(\)|cashflowPanel\(\)|bankPanel\(\)/);
});
test('phase73 relocates cheque lifecycle and endorsement tools to cheque management',()=>{
 assert.match(ui,/data-commerce-tab="cheques"/);
 assert.match(ui,/data-commerce-section="cheques"[\s\S]*?chequePanel\(\)/);
 assert.match(ui,/دفتر چک‌ها و واگذاری چندمرحله‌ای/);
 assert.match(ui,/گردش زنجیره‌ای ظهرنویسی/);
});
test('phase73 relocates aging and cashflow reports to their relevant workspaces',()=>{
 assert.match(ui,/data-commerce-tab="aging"/);
 assert.match(ui,/data-commerce-section="aging"[\s\S]*?agingPanel\(\)/);
 assert.match(ui,/داشبورد مطالبات، بدهی‌ها و ریسک سررسید/);
 assert.match(ui,/data-commerce-section="management"[\s\S]*?cashflowPanel\(\)/);
 assert.match(ui,/پیش‌بینی جریان نقد و رفتار پرداخت/);
});
test('phase73 relocates bank accounts, transfers and reconciliation to banking workspace',()=>{
 assert.match(ui,/data-commerce-tab="banking"/);
 assert.match(ui,/data-commerce-section="banking"[\s\S]*?bankPanel\(\)/);
 assert.match(ui,/مدیریت بانک و صندوق/);
 assert.match(ui,/bankTransferSave/);
 assert.match(ui,/bankStatementImport/);
});
test('phase73 preserves all workspace navigation state types',()=>{
 assert.match(ui,/activeCommerceSection: 'sale'\|'purchase'\|'receipts'\|'cheques'\|'aging'\|'banking'\|'management'\|'inventory'/);
 assert.match(ui,/activeCommerceSection=next;editingInvoiceId=null;render\(\)/);
});
