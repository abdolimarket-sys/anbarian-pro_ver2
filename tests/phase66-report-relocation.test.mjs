import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const scanner=readFileSync(new URL('../src/modules/scanner.ts',import.meta.url),'utf8');
test('phase66 puts management and profitability reports on a dedicated tab',()=>{
 assert.match(ui,/data-commerce-tab="management"/);
 assert.match(ui,/data-commerce-section="management"/);
 assert.match(ui,/activeCommerceSection==='management'\?await managementDashboardPanel\(\):''/);
 assert.match(ui,/activeCommerceSection==='management'\?await profitabilityPanel\(\):''/);
 assert.doesNotMatch(ui,/activeCommerceSection==='sale'\?await managementDashboardPanel\(\):''/);
});
test('phase66 puts inventory reconciliation on its own inventory/accounting tab',()=>{
 assert.match(ui,/data-commerce-tab="inventory"/);
 assert.match(ui,/data-commerce-section="inventory"/);
 assert.match(ui,/activeCommerceSection==='inventory'\?await inventoryReconciliationPanel\(\):''/);
});
test('phase66 preserves the invoice and receipts tabs and scanner module',()=>{
 for(const tab of ['sale','purchase','receipts']) assert.match(ui,new RegExp(`data-commerce-tab="${tab}"`));
 assert.ok(scanner.length>0);
});
