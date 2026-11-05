import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
test('phase 51 adds monthly management trends for sales, gross profit, expenses, receipts, payments and receivables',()=>{
 assert.match(ui,/getMonthlyProfitabilityTrend\(filter\)/);
 assert.match(ui,/روند ماهانه شاخص‌های مدیریتی/);
 assert.match(ui,/فروش/);
 assert.match(ui,/سود ناخالص/);
 assert.match(ui,/هزینه ثبت‌شده/);
 assert.match(ui,/دریافت قطعی/);
 assert.match(ui,/پرداخت قطعی/);
 assert.match(ui,/مانده فعلی مطالبات/);
});
test('phase 51 clearly distinguishes current receivables from historical month-end balances',()=>{
 assert.match(ui,/مانده فعلی فاکتورهای فروش/);
 assert.match(ui,/مانده تاریخی پایان هر ماه نیست/);
});
test('phase 51 excludes bounced, void and uncleared cheque transactions from realized cash trends',()=>{
 assert.match(ui,/tx\.chequeStatus==='bounced'/);
 assert.match(ui,/tx\.chequeStatus==='void'/);
 assert.match(ui,/tx\.method==='cheque'&&tx\.chequeStatus!=='cleared'/);
});
