import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const mod=readFileSync(new URL('../src/modules/management-month-export.ts',import.meta.url),'utf8');
test('phase 53 adds independent Excel and print/PDF actions inside each monthly detail',()=>{
 assert.match(ui,/data-management-month-xlsx/);
 assert.match(ui,/data-management-month-pdf/);
 assert.match(ui,/data-management-month-from/);
 assert.match(ui,/data-management-month-to/);
 assert.match(ui,/exportManagementMonthXlsx/);
 assert.match(ui,/printManagementMonthPdf/);
});
test('phase 53 exports month-specific posted sales, settled cash transactions and group-six expenses',()=>{
 assert.match(mod,/status==='posted'&&i\.type==='sale'/);
 assert.match(mod,/t\.chequeStatus!=='bounced'&&t\.chequeStatus!=='void'/);
 assert.match(mod,/t\.method!=='cheque'\|\|t\.chequeStatus==='cleared'/);
 assert.match(mod,/j\.status==='posted'/);
 assert.match(mod,/code\.startsWith\('6'\)/);
});
test('phase 53 creates a four-sheet offline workbook and print-ready report for the selected month',()=>{
 assert.match(mod,/buildOfflineXlsx\(sheets\)/);
 assert.match(mod,/name:'خلاصه ماه'/);
 assert.match(mod,/name:'فاکتورهای فروش'/);
 assert.match(mod,/name:'دریافت و پرداخت'/);
 assert.match(mod,/name:'هزینه‌های گروه ۶'/);
 assert.match(mod,/window\.print\(\)/);
 assert.match(mod,/monthValid/);
 assert.ok(mod.includes('(!fromDate||d>=norm(fromDate))&&(!toDate||d<=norm(toDate))'));
});
test('phase 53 is read-only and does not mutate accounting or commerce data',()=>{
 assert.doesNotMatch(mod,/saveCommerceData|saveAccountingData|postJournalEntry|createCashTransaction/);
});
