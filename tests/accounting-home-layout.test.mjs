import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../src/modules/accounting-ui.ts',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles/main.css',import.meta.url),'utf8');
test('accounting home presents the requested two-column icon categories',()=>{
  for(const label of ['صورت‌حساب اشخاص','تعریف شخص','انبار','فاکتور','دریافت وجه','پرداخت وجه','مدیریت چک‌ها']) assert.ok(ui.includes(label),`missing ${label}`);
  assert.match(css,/\.accounting-home-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
});
test('accounting home tiles navigate to existing accounting workspaces',()=>{
  assert.match(ui,/data-acc-menu="party"/);
  assert.match(ui,/data-acc-menu="invoice"/);
  assert.match(ui,/data-acc-menu="receipt"/);
  assert.match(ui,/data-acc-menu="payment"/);
  assert.match(ui,/data-commerce-tab=\"\$\{target\}\"/);
  assert.match(ui,/if\(action==='party'\).*panel\.open=true/s);
});

test('overview does not duplicate destinations already available in the main accounting navigation',()=>{
  for(const action of ['messages','expense','income','reports','journals','accounts','fiscal']) assert.doesNotMatch(ui,new RegExp('data-acc-menu=\"'+action+'\"'));
  assert.match(ui,/گزارش‌ها، اسناد، کدینگ و سال مالی از نوار بالای حسابداری/);
});
