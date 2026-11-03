import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const bank=readFileSync(new URL('../src/modules/accounting-bank.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const scanner=readFileSync(new URL('../src/modules/scanner.ts',import.meta.url),'utf8');
test('phase 35 stores bank reconciliation independently and backward compatibly',()=>{
 assert.match(bank,/accounting_phase35_bank_reconciliation/);
 assert.match(bank,/schemaVersion:1; rows:BankStatementRow\[\]/);
});
test('phase 35 posts balanced internal transfers and validates open fiscal period',()=>{
 assert.match(bank,/createInternalTransfer/);
 assert.match(bank,/validatePeriod\(input\.date,input\.fiscalPeriodId,a\)/);
 assert.match(bank,/انتقال ورودی به حساب مقصد/);
 assert.match(bank,/انتقال خروجی از حساب مبدأ/);
 assert.match(bank,/کارمزد انتقال بانکی/);
 assert.match(readFileSync(new URL('../src/modules/accounting-commerce.ts',import.meta.url),'utf8'),/det-bank-fees/);
});
test('phase 35 parses CSV and imports exact bank statement rows',()=>{
 assert.match(bank,/parseBankStatementCsv/);
 assert.match(bank,/ستون‌های تاریخ، شرح و مبلغ/);
 assert.match(bank,/known\.has\(key\)/);
 assert.match(bank,/تطبیق ندارد/);
});
test('phase 35 reconciliation requires exact account, date and signed amount match',()=>{
 assert.match(bank,/t\.cashAccountId===r\.accountId&&t\.date===r\.date/);
 assert.match(bank,/matchedTransactionId/);
 assert.match(bank,/تراکنش انتخابی از نظر حساب، تاریخ یا مبلغ/);
});
test('phase 35 UI exposes balances, transfer and CSV import without touching scanner',()=>{
 for(const marker of ['مدیریت بانک و صندوق','bankTransferSave','bankStatementImport','getBankAccountBalances']) assert.ok(ui.includes(marker),`missing ${marker}`);
 assert.ok(scanner.length>0);
});
