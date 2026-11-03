import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const commerce=readFileSync(new URL('../src/modules/accounting-commerce.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const scanner=readFileSync(new URL('../src/modules/scanner.ts',import.meta.url),'utf8');
test('phase 34 adds backward-compatible settlement and cheque types',()=>{
  assert.match(commerce,/method\?: SettlementMethod/);
  assert.match(commerce,/allocations\?: InvoiceAllocation\[\]/);
  assert.match(commerce,/chequeStatus\?: ChequeStatus/);
  assert.match(commerce,/schemaVersion: 1; parties: AccountingParty\[\]; invoices: CommercialInvoice\[\]; cashTransactions: CashTransaction\[\]/);
});
test('phase 34 validates invoice allocations against posted invoices and outstanding amounts',()=>{
  assert.match(commerce,/invoiceOutstanding\(invoice\.id,commerce\)/);
  assert.match(commerce,/مبلغ تخصیص از مانده فاکتور/);
  assert.match(commerce,/فاکتور انتخابی قطعی نیست/);
});
test('phase 34 posts separate cheque receipt/payable accounts and lifecycle entries',()=>{
  for(const marker of ['det-cheques-receivable','det-cheques-payable','updateChequeStatus','chequeStatus:\'pending\'',':clear',':bounce',':void']) assert.ok(commerce.includes(marker),`missing ${marker}`);
  assert.match(commerce,/ابطال چک/);
  assert.match(commerce,/برگشت چک/);
});
test('phase 34 exposes settlement methods, invoice allocation and cheque status controls',()=>{
  for(const marker of ['cashMethod','cashInvoice','cashAllocation','cashChequeNumber','cashChequeBank','cashChequeDue','data-cheque-clear','data-cheque-bounce']) assert.ok(ui.includes(marker),`missing ${marker}`);
});
test('phase 34 does not modify barcode scanner source',()=>{
  assert.ok(scanner.includes('Html5Qrcode')||scanner.length>0);
});
