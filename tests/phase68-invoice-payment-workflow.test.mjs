import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const commerce=readFileSync(new URL('../src/modules/accounting-commerce.ts',import.meta.url),'utf8');
test('phase68 moves invoice due date into payment conditions and removes it from header print metadata',()=>{
 assert.match(ui,/تاریخ سررسید بدهی مدت‌دار/);
 assert.ok(ui.includes("تاریخ سررسید بدهی مدت‌دار"));
 assert.doesNotMatch(ui,/<div>سررسید<br>/);
});
test('phase68 supports split cash, card, cheque and credit payment rows with cheque metadata',()=>{
 for(const value of ['cash','card','cheque','credit'])assert.ok(ui.includes(`value="${value}"`));
 for(const field of ['data-pay-cheque-number','data-pay-cheque-bank','data-pay-cheque-account','data-pay-cheque-due','data-pay-cheque-note'])assert.ok(ui.includes(field));
 assert.match(commerce,/paymentParts\?:InvoicePaymentPart\[\]/);
});
test('phase68 caps payment sum and explicitly turns the residual into credit balance',()=>{
 assert.match(commerce,/جمع پرداخت‌ها نباید از مبلغ نهایی فاکتور بیشتر شود/);
 assert.match(commerce,/paymentParts\.push\(\{method:'credit',amountRial:grossRial-allocatedPayments/);
 assert.match(commerce,/برای مانده اعتباری\/مدت‌دار، تاریخ سررسید/);
});
test('phase68 posts cash/card/cheque as invoice allocations but leaves credit as outstanding balance',()=>{
 assert.match(ui,/parts\.filter\(x=>x\.method!=='credit'\)/);
 assert.match(ui,/allocations:\[\{invoiceId:target\.id,amountRial:part\.amountRial\}\]/);
 assert.match(commerce,/chequeAccount:\(input\.chequeAccount\|\|'\'\)\.trim\(\)/);
});
test('phase69 opens a dedicated settlement sheet and returns to the invoice after posting',()=>{
 assert.match(ui,/function openInvoiceSettlementSheet\(/);
 assert.match(ui,/برگه مستقل دریافت \/ پرداخت/);
 assert.match(ui,/data-settle-method/);
 assert.match(ui,/ثبت دریافت \/ پرداخت و قطعی‌سازی فاکتور/);
 assert.match(ui,/بازگشت به فاکتور/);
 assert.match(ui,/openInvoiceSettlementSheet\(b\.dataset\.postInvoice!\)/);
});
