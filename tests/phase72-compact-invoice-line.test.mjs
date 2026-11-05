import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../src/styles/main.css',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
test('phase72 keeps product, quantity, price and discount in the first compact row',()=>{
 for (const selector of ['[data-line-product]','[data-line-qty]','[data-line-price]','[data-line-discount]']) assert.ok(css.includes(selector));
 for (const field of ['product','qty','price','discount']) assert.match(css,new RegExp('data-line-'+field+'.*grid-row:1'));
});
test('phase72 retains description, unit, stock, line total and row removal controls',()=>{
 for (const selector of ['[data-line-desc]','[data-line-unit]','[data-line-stock]','[data-line-total]','[data-remove-line]']) assert.ok(ui.includes(selector));
});
test('phase72 includes compact mobile layout',()=>{
 assert.ok(css.includes('@media(max-width:560px)') && css.includes('grid-template-columns:minmax(0,1.8fr)'));
});
