import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui = readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');
const core = readFileSync(new URL('../src/modules/accounting-commerce.ts', import.meta.url), 'utf8');
test('changing product recalculates line totals immediately after auto-filling price', () => {
  assert.match(ui, /addEventListener\('change',event=>\{applyProduct\(\(event\.target as HTMLSelectElement\)\.value\);updateInvoiceTotals\(\);\}\)/);
});
test('line total uses zero discount when discount is empty or omitted', () => {
  assert.ok(ui.includes("[data-line-discount]')?.value||'0'"));
  assert.match(core, /const discountRial = l\.discountRial \|\| 0;/);
  assert.match(core, /const totalRial = grossLineRial - discountRial;/);
});
test('invoice line gross amount is based on quantity and unit price', () => {
  assert.match(ui, /const raw=Math\.round\(q\*price\); const total=Math\.max\(0,raw-discount\)/);
});
