import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const picker=readFileSync(new URL('../src/modules/date-picker.ts',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
test('phase75 installs one delegated date picker across dynamically rendered forms',()=>{
 assert.match(main,/initUnifiedDatePickers/);
 assert.match(picker,/new MutationObserver/);
 assert.match(picker,/querySelectorAll<HTMLInputElement>\('input'\)/);
 assert.match(picker,/calendarEnhanced/);
});
test('phase75 keeps Jalali date values while choosing through native calendar',()=>{
 assert.match(picker,/jalaliToGregorian/);
 assert.match(picker,/gregorianToJalali/);
 assert.match(picker,/input\.value=gregorianToJalali\(picker\.value\)/);
 assert.match(picker,/dispatchEvent\(new Event\('change'/);
});
test('phase75 avoids duplicating existing native date controls',()=>{
 assert.match(picker,/input\.type==='date'/);
 assert.match(picker,/input\.id==='invoiceDate'/);
});
