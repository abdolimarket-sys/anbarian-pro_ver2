import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const exp=readFileSync(new URL('../src/modules/management-dashboard-export.ts',import.meta.url),'utf8');
test('phase 50 adds fiscal year and Jalali date filters to the management dashboard',()=>{
 assert.match(ui,/id="managementPeriod"/);
 assert.match(ui,/id="managementFrom"/);
 assert.match(ui,/id="managementTo"/);
 assert.match(ui,/managementApplyFilter/);
 assert.match(ui,/managementClearFilter/);
 assert.match(ui,/managementFilter/);
});
test('phase 50 exports the selected dashboard period to offline XLSX and printable PDF',()=>{
 assert.match(ui,/exportManagementDashboardXlsx\(managementFilter\)/);
 assert.match(ui,/printManagementDashboardPdf\(managementFilter\)/);
 assert.match(exp,/buildOfflineXlsx/);
 assert.match(exp,/فروش‌های قطعی/);
 assert.match(exp,/پیش‌بینی نقدینگی/);
 assert.match(exp,/وضعیت موجودی/);
 assert.match(exp,/window\.print\(\)/);
});
test('phase 50 distinguishes period-filtered KPIs from current stock and bank balances',()=>{
 assert.match(ui,/وضعیت فعلی هستند/);
 assert.match(exp,/وضعیت فعلی/);
});
