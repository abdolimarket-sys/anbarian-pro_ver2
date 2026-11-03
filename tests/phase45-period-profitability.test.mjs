import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const moduleSource=fs.readFileSync(new URL('../src/modules/accounting-profitability.ts',import.meta.url),'utf8');
const uiSource=fs.readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
test('phase45 exposes fiscal-period profitability comparison',()=>{
 assert.match(moduleSource,/buildProfitabilityPeriodComparison/);
 assert.match(moduleSource,/getProfitabilityPeriodComparison/);
 assert.match(moduleSource,/fiscalPeriodId===period\.id/);
});
test('phase45 isolates posted accounting expenses by fiscal period',()=>{
 assert.match(moduleSource,/journalEntries\.filter\(x=>x\.fiscalPeriodId===period\.id\)/);
 assert.match(moduleSource,/buildExpenseAdjustedProfitability\(profit,periodAccounting\)/);
});
test('phase45 displays date range and profitability per fiscal period',()=>{
 assert.match(uiSource,/مقایسه عملکرد سال‌های مالی — فاز ۴۵/);
 assert.match(uiSource,/بازه شمسی/);
 assert.match(uiSource,/فروش بی‌بها\/موقت/);
});
