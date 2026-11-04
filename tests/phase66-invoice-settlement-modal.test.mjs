import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd();
const ui=fs.readFileSync(path.join(root,'src/modules/accounting-commerce-ui.ts'),'utf8');
const scanner=fs.readFileSync(path.join(root,'src/modules/scanner.ts'));
test('phase 66 adds invoice-level receive/pay actions for posted invoices',()=>{
  assert.match(ui,/data-settle-invoice/);
  assert.match(ui,/ثبت دریافت وجه/);
  assert.match(ui,/ثبت پرداخت وجه/);
});
test('phase 66 reuses the existing cash transaction engine and allocates to the source invoice',()=>{
  assert.match(ui,/createCashTransaction\(\{type,number:/);
  assert.match(ui,/allocations:\[\{invoiceId:invoice\.id,amountRial\}\]/);
  assert.match(ui,/fiscalPeriodId:settlementPeriodId/);
  assert.match(ui,/invoicePeriodForDate\(settlementDate\)/);
});
test('phase 66 provides a modal, partial settlement, payment method and per-invoice history',()=>{
  for(const marker of ['invoiceSettlementModal','settlementAmount','settlementMethod','invoice-settlement-history','invoiceOutstanding']) assert.ok(ui.includes(marker),`missing ${marker}`);
});
test('phase 66 does not modify the barcode scanner implementation',()=>{
  assert.equal(crypto.createHash('sha256').update(scanner).digest('hex'),'483979e3ec3ddc323a8e9d4efb3e002e095fada019093a78be25b6c57ab50b70');
});
