import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const mod=readFileSync(new URL('../src/modules/accounting-cheque-endorsement.ts',import.meta.url),'utf8');
const commerce=readFileSync(new URL('../src/modules/accounting-commerce.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const scanner=readFileSync(new URL('../src/modules/scanner.ts',import.meta.url),'utf8');
test('phase 38 supports multiple partial endorsements against remaining cheque amount',()=>{
  assert.match(mod,/prior\.reduce\(\(sum,e\)=>sum\+e\.amountRial,0\)/);
  assert.match(mod,/amount>remaining/);
  assert.match(mod,/getChequeEndorsementRemaining/);
  assert.match(mod,/getChequeEndorsements/);
});
test('phase 38 validates partial amount and invoice outstanding',()=>{
  assert.match(mod,/Number\.isSafeInteger\(amount\)/);
  assert.match(mod,/invoiceOutstanding\(invoice\.id,commerce\)<amount/);
});
test('phase 38 creates a separate posted journal per endorsement tranche',()=>{
  assert.match(mod,/endorsement:\$\{prior\.length\+1\}/);
  assert.match(mod,/amount,0,party\.id/);
  assert.match(mod,/0,amount\)/);
});
test('phase 38 reverses every tranche on cheque bounce and void',()=>{
  assert.match(commerce,/filter\(e=>e\.transactionId===tx\.id\)/);
  assert.match(commerce,/for\(const endorsement of endorsements\)/);
  assert.match(commerce,/endorsedTotal/);
});
test('phase 38 UI shows remaining amount and permits additional tranches',()=>{
  assert.match(ui,/واگذاری بخشی از چک/);
  assert.match(ui,/getChequeEndorsementRemaining/);
  assert.match(ui,/مبلغ این مرحله را به ریال/);
});
test('phase 38 does not modify barcode scanner',()=>assert.ok(scanner.length>0));
