import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
test('phase 52 adds per-month detail toggles to the management trend',()=>{
 assert.match(ui,/data-management-month/);
 assert.match(ui,/managementMonthDetail_/);
 assert.match(ui,/aria-expanded/);
});
test('phase 52 details include posted sales, settled receipts/payments and group six expenses',()=>{
 assert.match(ui,/فاکتورهای فروش قطعی/);
 assert.match(ui,/دریافت‌ها و پرداخت‌های قطعی/);
 assert.match(ui,/ریز هزینه‌های قطعی گروه ۶/);
 assert.match(ui,/accountingData\.journalEntries\.filter\(j=>j\.status==='posted'/);
 assert.match(ui,/code\.startsWith\('6'\)/);
});
test('phase 52 details respect the active date filter and exclude bounced or void cheques',()=>{
 assert.match(ui,/inRange\(i\.date\)/);
 assert.match(ui,/t\.chequeStatus!=='bounced'\&\&t\.chequeStatus!=='void'/);
 assert.match(ui,/inRange\(t\.date\)/);
});
