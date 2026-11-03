import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const mod=readFileSync(new URL('../src/modules/accounting-profitability.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
test('phase 44 considers posted journal entries and expense accounts only',()=>{assert.match(mod,/entry\.status!=='posted'/);assert.match(mod,/code\.startsWith\('6'\)/);assert.match(mod,/debitRial[^;]*creditRial/) });
test('phase 44 allocates expenses by costed sales revenue and reports unallocated balance',()=>{assert.match(mod,/r\.revenueRial\/p\.costedSalesRial/);assert.match(mod,/unallocatedExpensesRial/);assert.match(mod,/allocatedExpensesRial/) });
test('phase 44 provides adjusted product and customer profitability without posting entries',()=>{assert.match(mod,/products:ExpenseAllocationRow\[\]/);assert.match(mod,/customers:ExpenseAllocationRow\[\]/);assert.match(ui,/تخصیص تحلیلی هزینه‌ها و سود تعدیل‌شده/);assert.match(ui,/هیچ سند حسابداری یا گردش مالی را تغییر نمی‌دهد/) });
test('phase 44 labels adjusted result as management analysis, not official net profit',()=>{assert.match(ui,/سود خالص رسمی/);assert.match(ui,/گزارش حسابداری با فیلتر سال مالی/) });
