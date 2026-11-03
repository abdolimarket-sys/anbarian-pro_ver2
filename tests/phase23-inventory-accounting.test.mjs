import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('phase 23 links invoice lines to inventory products and warehouse', () => {
  const commerce = read('../src/modules/accounting-commerce.ts');
  const ui = read('../src/modules/accounting-commerce-ui.ts');
  assert.match(commerce, /productId\?: string; warehouse\?: string/);
  assert.match(commerce, /products\.find\(p=>p\.id===line\.productId\)/);
  assert.match(commerce, /movement\.beforeQtyMilli/);
  assert.match(commerce, /movement\.afterQtyMilli/);
  assert.match(ui, /data-line-product/);
  assert.match(ui, /setOpeningStockCost/);
});

test('phase 23 costing supports FIFO, moving average, and warehouse negative-stock policy', () => {
  const costing = read('../src/modules/inventory-costing.ts');
  const commerce = read('../src/modules/accounting-commerce.ts');
  assert.match(costing, /input\.method==='fifo'/);
  assert.match(costing, /averageUnitCostRial/);
  assert.match(commerce, /allowNegativeStockByWarehouse\[warehouse\]/);
  assert.match(costing, /if\(!input\.allowNegative&&b\.qtyMilli<input\.qtyMilli\)/);
});

test('phase 23 posts inventory and COGS accounts and protects unvalued opening stock', () => {
  const commerce = read('../src/modules/accounting-commerce.ts');
  const costing = read('../src/modules/inventory-costing.ts');
  assert.match(commerce, /det-inventory/);
  assert.match(commerce, /det-cogs-goods/);
  assert.match(commerce, /saveInventoryCostData\(costing\)/);
  assert.match(costing, /بهای واحد موجودی/);
  assert.match(costing, /setOpeningStockCost/);
});

test('phase 23 does not rewrite the barcode scanner module', () => {
  const scanner = read('../src/modules/scanner.ts');
  assert.match(scanner, /Html5Qrcode|ZXing|barcode/i);
});
