import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../src/modules/accounting.ts', import.meta.url), 'utf8');
test('standard chart of accounts includes fixed assets, long-term liabilities, equity, revenue and expenses', () => {
  for (const token of ['دارایی‌های غیرجاری','دارایی‌های ثابت مشهود','بدهی‌های غیرجاری','سرمایه ثبت‌شده','سود و زیان انباشته','برگشت از فروش','هزینه حقوق و دستمزد']) assert.ok(source.includes(token), `missing ${token}`);
});
test('chart initialization performs non-destructive additive migration for existing accounts', () => {
  assert.match(source, /const knownIds = new Set\(data\.accounts\.map/);
  assert.match(source, /data\.accounts = \[\.\.\.data\.accounts, \.\.\.missing\.map/);
  assert.match(source, /knownCodes\.has\(account\.code\)/);
});
test('journal validation enforces Jalali date shape and non-empty posting lines', () => {
  assert.match(source, /تاریخ سند باید به شکل سال\/ماه\/روز شمسی باشد/);
  assert.match(source, /ردیف سند باید مبلغ بدهکار یا بستانکار داشته باشد/);
});
test('release version is synchronized at 1.5.16', () => {
  assert.match(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'), /"version": "1\.5\.16"/);
  assert.match(fs.readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8'), /versionCode 27[\s\S]*versionName "1\.5\.16"/);
  assert.match(fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), /v1\.5\.16/);
});
