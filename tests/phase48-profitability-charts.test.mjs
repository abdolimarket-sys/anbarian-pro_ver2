import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const mod=fs.readFileSync(new URL('../src/modules/accounting-profitability.ts',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
test('phase48 builds monthly trend from posted sales, linked inventory cost and posted journals',()=>{
 assert.match(mod,/interface ProfitabilityTrendRow/);
 assert.match(mod,/buildMonthlyProfitabilityTrend\(c:CommerceData,cost:InventoryCostData,a:AccountingData,filter:ProfitabilityFilter/);
 assert.match(mod,/invoice\.status==='posted'&&invoice\.type==='sale'/);
 assert.match(mod,/cost\.movements\.filter\(x=>ids\.has\(x\.sourceDocumentId\)\)/);
 assert.match(mod,/entry\.status==='posted'/);
});
test('phase48 exposes a filtered monthly trend loader',()=>assert.match(mod,/getMonthlyProfitabilityTrend\(filter:ProfitabilityFilter=\{\}\)/));
test('phase48 renders monthly and fiscal-period comparison charts in the filtered report',()=>{
 assert.match(ui,/روند ماهانه فروش، سود و هزینه‌ها/);
 assert.match(ui,/مقایسه نموداری سال‌های مالی/);
 assert.match(ui,/getMonthlyProfitabilityTrend\(profitabilityFilter\)/);
});
test('phase48 chart labels distinguish gross profit and allocated expense indicator',()=>{
 assert.match(ui,/سود ناخالص/);
 assert.match(ui,/هزینه گروه ۶/);
 assert.match(ui,/سود پس از هزینه ثبت‌شده/);
});
