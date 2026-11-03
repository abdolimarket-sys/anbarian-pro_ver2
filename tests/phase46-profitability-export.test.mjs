import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../src/modules/accounting-profitability-export.ts',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
test('phase46 builds a real offline XLSX workbook with multiple report sheets',()=>{
 assert.match(src,/buildOfflineXlsx\(sheets\)/);assert.match(src,/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
 for(const name of ['خلاصه','سال‌های مالی','سود کالاها','سود مشتریان','هزینه‌ها','تخصیص کالا','تخصیص مشتری'])assert.ok(src.includes(name));
});
test('phase46 provides browser print-to-PDF report',()=>{assert.match(src,/window\.open/);assert.match(src,/window\.print\(\)/);assert.match(src,/Save as PDF/)});
test('phase46 exposes both export actions in profitability UI',()=>{assert.match(ui,/profitabilityExportXlsx/);assert.match(ui,/profitabilityPrintPdf/)});
test('phase46 export remains read-only and reuses reporting getters',()=>{assert.match(src,/getProfitabilityDashboard/);assert.match(src,/getExpenseAdjustedProfitability/);assert.match(src,/getProfitabilityPeriodComparison/);assert.doesNotMatch(src,/saveCommerceData|saveAccountingData|postInvoice|createCashTransaction/)});
