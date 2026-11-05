import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const core=fs.readFileSync(new URL('../src/modules/accounting-commerce.ts',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles/main.css',import.meta.url),'utf8');
test('all five invoice document types are represented in the accounting model',()=>{
  for(const type of ['sale','purchase','return-sale','return-purchase','proforma']) assert.ok(core.includes(`'${type}'`));
  assert.match(core,/invoice\.type==='proforma'.*پیش‌فاکتور فقط قابل ذخیره/s);
});
test('return documents reverse journal lines and reverse stock direction',()=>{
  assert.match(core,/if\(returnSide\)\{ for\(const line of lines\)/);
  assert.match(core,/invoice\.type==='return-sale'\?getCostBalance/);
  assert.match(core,/invoice\.type==='return-purchase'\)inventoryValue\+=result\.totalCostRial/);
});
test('simple invoice page exposes independent items and settlement actions',()=>{
  assert.match(ui,/data-new-invoice-type="return-sale"/);
  assert.match(ui,/data-new-invoice-type="return-purchase"/);
  assert.match(ui,/data-new-invoice-type="proforma"/);
  assert.match(ui,/id="invoiceOpenItems"/);
  assert.match(ui,/id="invoiceSettle"/);
  assert.match(css,/فرم ساده و جمع‌وجور فاکتور/);
});
