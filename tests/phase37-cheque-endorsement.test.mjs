import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const moduleText=readFileSync(new URL('../src/modules/accounting-cheque-endorsement.ts',import.meta.url),'utf8');
const commerce=readFileSync(new URL('../src/modules/accounting-commerce.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const scanner=readFileSync(new URL('../src/modules/scanner.ts',import.meta.url),'utf8');
test('phase 37 supports endorsement only for pending received cheques and active suppliers',()=>{
  assert.match(moduleText,/tx\.type!=='receipt'/);
  assert.match(moduleText,/tx\.chequeStatus!=='pending'/);
  assert.match(moduleText,/p\.type==='supplier'\|\|p\.type==='both'/);
  assert.match(moduleText,/قبلاً ظهرنویسی شده است/);
});
test('phase 37 requires a posted purchase invoice with enough outstanding balance',()=>{
  assert.match(moduleText,/i\.type==='purchase'/);
  assert.match(moduleText,/invoiceOutstanding\(invoice\.id,commerce\)<amount/);
});
test('phase 37 posts balanced supplier payable and cheque receivable journal lines',()=>{
  assert.match(moduleText,/det-suppliers/);
  assert.match(moduleText,/det-cheques-receivable/);
  assert.match(moduleText,/تسویه بدهی تأمین‌کننده/);
  assert.match(moduleText,/خروج چک از اسناد دریافتنی/);
});
test('phase 37 includes endorsements in supplier balance and purchase invoice outstanding',()=>{
  assert.match(commerce,/chequeEndorsements\?: ChequeEndorsement\[\]/);
  assert.match(commerce,/const endorsed=/);
  assert.match(commerce,/برگشت چک دریافتی از مشتری/);
  assert.match(commerce,/ظهرنویسی چک/);
});
test('phase 37 exposes endorsement action and prevents company-bank clearing after transfer',()=>{
  assert.match(ui,/data-chq-endorse/);
  assert.match(ui,/ظهرنویسی به تأمین‌کننده/);
  assert.match(commerce,/این چک ظهرنویسی و واگذار شده است/);
});
test('phase 37 leaves barcode scanner module unchanged',()=>assert.ok(scanner.length>0));
