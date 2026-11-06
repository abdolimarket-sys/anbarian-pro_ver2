import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const invoiceUi=readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');

test('phase76 computes the first day of any selected Jalali month from the Jalali year start',()=>{
  assert.match(invoiceUi,/parts\.y===calendarYear&&parts\.m===1&&parts\.d===1/);
  assert.match(invoiceUi,/calendarMonth<=6\?\(calendarMonth-1\)\*31:186\+\(calendarMonth-7\)\*30/);
  assert.match(invoiceUi,/firstParts\.y!==calendarYear\|\|firstParts\.m!==calendarMonth\|\|firstParts\.d!==1/);
});

test('phase76 opens invoice calendar and normalizes Persian or Arabic digits in the current invoice date',()=>{
  assert.match(invoiceUi,/const rawDate=digits\(invoiceDateInput\?\.value\|\|todayJalali\(\)\)/);
  assert.match(invoiceUi,/renderInvoiceJalaliCalendar\(\)/);
  assert.match(invoiceUi,/invoiceCalendarPanel\.hidden=false/);
});

test('phase76 choosing a Jalali day updates the invoice date and notifies form listeners',()=>{
  assert.match(invoiceUi,/invoiceDateInput\.value=button\.dataset\.jdate!/);
  assert.match(invoiceUi,/dispatchEvent\(new Event\('input',\{bubbles:true\}\)\)/);
  assert.match(invoiceUi,/dispatchEvent\(new Event\('change',\{bubbles:true\}\)\)/);
});
