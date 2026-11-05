/** تقویم یکپارچه برای تمام فیلدهای تاریخ شمسی در فرم‌ها و گزارش‌ها. */
const normalize = (value: string) => value.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const persianParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  return { year:Number(parts.find(x=>x.type==='year')?.value), month:Number(parts.find(x=>x.type==='month')?.value), day:Number(parts.find(x=>x.type==='day')?.value) };
};
function jalaliToGregorian(value: string): string {
  const match = normalize(value).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return '';
  const [, ys, ms, ds] = match; const jy=Number(ys), jm=Number(ms), jd=Number(ds);
  if (jm<1||jm>12||jd<1||jd>(jm<=6?31:jm<=11?30:30)) return '';
  const offset=(jm<=6?(jm-1)*31:186+(jm-7)*30)+(jd-1);
  // سال شمسی از حوالی ۲۰ مارس آغاز می‌شود؛ روز اول دقیق را با تقویم رسمی پیدا می‌کنیم.
  const probe=new Date(jy+621,2,18,12);
  let start:Date|undefined;
  for(let i=0;i<6;i++){const d=new Date(probe);d.setDate(probe.getDate()+i);const p=persianParts(d);if(p.year===jy&&p.month===1&&p.day===1){start=d;break;}}
  if(!start)return '';
  start.setDate(start.getDate()+offset);
  const check=persianParts(start);if(check.year!==jy||check.month!==jm||check.day!==jd)return '';
  return `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
}
function gregorianToJalali(value:string):string {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const [y,m,d]=value.split('-').map(Number);const date=new Date(y,m-1,d,12);const p=persianParts(date);
  return `${p.year}/${String(p.month).padStart(2,'0')}/${String(p.day).padStart(2,'0')}`;
}
function isDateField(input:HTMLInputElement):boolean {
  if(input.type==='date'||input.type==='datetime-local'||input.type==='month'||input.type==='time'||input.dataset.calendarEnhanced==='true'||input.id==='invoiceDate')return false;
  if(input.disabled||input.readOnly||input.closest('[hidden]'))return false;
  const id=input.id.toLowerCase(), placeholder=input.placeholder||'', label=input.closest('label')?.textContent||'';
  return /(^|[-_])(date|from|to|start|end|due|expiry|issued|period)([-_]|$)/i.test(id)
    || /۱۴۰\d\s*\/|\d{4}\s*\/\d{2}\s*\/\d{2}|yyyy\s*\/\s*mm\s*\/\s*dd/i.test(placeholder)
    || /تاریخ/.test(label);
}
function enhance(input:HTMLInputElement):void {
  if(!isDateField(input))return;
  input.dataset.calendarEnhanced='true';
  const picker=document.createElement('input');picker.type='date';picker.className='jalali-calendar-native';picker.setAttribute('aria-label','انتخاب تاریخ از تقویم');picker.title='انتخاب تاریخ از تقویم';
  picker.value=jalaliToGregorian(input.value);
  picker.addEventListener('change',()=>{if(!picker.value)return;input.value=gregorianToJalali(picker.value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
  input.addEventListener('change',()=>{const converted=jalaliToGregorian(input.value);if(converted)picker.value=converted;});
  input.insertAdjacentElement('afterend',picker);
  const wrapper=document.createElement('span');wrapper.className='jalali-calendar-wrap';picker.parentElement?.insertBefore(wrapper,picker);wrapper.appendChild(picker);
}
export function initUnifiedDatePickers():void {
  const scan=(root:ParentNode)=>{root.querySelectorAll<HTMLInputElement>('input').forEach(enhance);};
  scan(document);
  const observer=new MutationObserver(records=>{for(const record of records)for(const node of [...record.addedNodes])if(node instanceof HTMLElement){if(node instanceof HTMLInputElement)enhance(node);scan(node);}});
  observer.observe(document.body,{childList:true,subtree:true});
}
