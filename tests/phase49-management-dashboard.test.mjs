import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
test('phase 49 adds a unified management dashboard to the commerce workspace',()=>{
 assert.match(ui,/async function managementDashboardPanel\(/);
 assert.match(ui,/داشبورد مدیریتی یکپارچه/);
 assert.match(ui,/فروش قطعی در بازه انتخابی/);
 assert.match(ui,/مطالبات باز/);
 assert.match(ui,/بدهی‌های باز/);
 assert.match(ui,/مانده دفتری فعلی بانک و صندوق/);
 assert.match(ui,/خالص جریان نقد پیش‌بینی‌شده ۳۰ روز از تاریخ مبنا/);
 assert.match(ui,/کالاهای در حداقل موجودی/);
});
test('management analytics are separated from invoice entry into their own workspace tab',()=>{
 assert.match(ui,/data-commerce-tab=\"management\"/);
 assert.match(ui,/data-commerce-section=\"management\"/);
 assert.match(ui,/activeCommerceSection==='management'\?await managementDashboardPanel\(\):''/);
 assert.match(ui,/activeCommerceSection==='management'\?await profitabilityPanel\(\):''/);
 assert.doesNotMatch(ui,/activeCommerceSection==='sale'\?await managementDashboardPanel\(\):''/);
});
