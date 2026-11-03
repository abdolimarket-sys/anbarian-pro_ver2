import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/modules/accounting-commerce-ui.ts', import.meta.url), 'utf8');

test('phase 54 exposes two month selectors populated from the active filtered trend rows', () => {
  assert.match(ui, /id="managementCompareFirst"/);
  assert.match(ui, /id="managementCompareSecond"/);
  assert.match(ui, /const comparisonMonthOptions=trendRows\.map/);
  assert.match(ui, /مقایسه عملکرد دو ماه — فاز ۵۴/);
});

test('phase 54 compares six management indicators side by side', () => {
  for (const field of ['salesRial', 'grossProfitRial', 'expensesRial', 'receiptsRial', 'paymentsRial', 'receivableRial']) {
    assert.ok(ui.includes(`'${field}'`), `missing ${field}`);
  }
  assert.match(ui, /اختلاف \(ماه دوم − اول\)/);
  assert.match(ui, /تغییر درصدی/);
});

test('phase 54 computes absolute and percentage differences with a zero-baseline guard', () => {
  assert.match(ui, /delta=bv-av/);
  assert.match(ui, /pct=av===0\?null:delta\/Math\.abs\(av\)\*100/);
  assert.match(ui, /درصد تغییر قابل محاسبه نیست/);
});

test('phase 54 refreshes the comparison when either month selector changes', () => {
  assert.match(ui, /#managementCompareFirst,#managementCompareSecond/);
  assert.match(ui, /addEventListener\('change',updateMonthComparison\)/);
});

test('phase 54 comparison uses only the dashboard trend rows after active date and fiscal filters', () => {
  assert.match(ui, /getMonthlyProfitabilityTrend\(filter\)/);
  assert.match(ui, /const trendRows=\[\.\.\.monthly\.values\(\)\]/);
  assert.match(ui, /__anbarinManagementCompareRows=trendRows/);
});
