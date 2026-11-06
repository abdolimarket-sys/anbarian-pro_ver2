/** رابط کاربری حسابداری */
import {
  initializeSuggestedChart, loadAccountingData, saveAccountingData,
  upsertAccount, removeAccount, createFiscalPeriod, upsertJournalEntry,
  postJournalEntry, parseMoneyToRial, formatMoneyFromRial,
  resolveActiveFiscalPeriod, withActiveFiscalPeriod,
  type AccountingData, type AccountLevel, type JournalEntry,
} from './accounting';
import { loadCommerceData, saveCommerceData } from './accounting-commerce';
import { loadInventoryCostData, saveInventoryCostData } from './inventory-costing';
import { downloadFile, dateStr } from '@/utils/helpers';
import { toast } from './ui';

let data: AccountingData | null = null;
let activeAccountingTab = 'commerce';
const accountingTabs = [
  {id:'commerce', icon:'⇄', label:'بازرگانی'},
  {id:'journals', icon:'▤', label:'اسناد حسابداری'},
  {id:'accounts', icon:'▦', label:'کدینگ'},
  {id:'fiscal', icon:'▣', label:'سال مالی'},
  {id:'reports', icon:'▥', label:'گزارش‌ها'},
  {id:'backup', icon:'💾', label:'ذخیره'},
  {id:'settings', icon:'⚙', label:'تنظیمات'},
] as const;
function applyAccountingTab(): void {
  document.querySelectorAll<HTMLElement>('[data-acc-section]').forEach(node => {
    node.hidden = node.dataset.accSection !== activeAccountingTab;
  });
  const commerce = el<HTMLElement>('#accountingCommerceWorkspace');
  const reports = el<HTMLElement>('#accountingReportsWorkspace');
  if (commerce) commerce.hidden = activeAccountingTab !== 'commerce';
  if (reports) reports.hidden = activeAccountingTab !== 'reports';
  document.querySelectorAll<HTMLButtonElement>('[data-acc-tab]').forEach(button => {
    const selected = button.dataset.accTab === activeAccountingTab;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}
const fa = (v: number) => new Intl.NumberFormat('fa-IR').format(v);
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const normalizeDigits = (value: string) => value.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const id = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
const el = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector);

function accountOptions(level?: AccountLevel): string {
  if (!data) return '';
  return data.accounts.filter(a => a.isActive && (!level || a.level === level))
    .map(a => `<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('');
}
function renderAccounts(): string {
  if (!data) return '';
  const ordered = [...data.accounts].sort((a,b) => a.code.localeCompare(b.code, 'en'));
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>کد</th><th>عنوان حساب</th><th>سطح</th><th>ماهیت</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${ordered.map(a => `<tr><td>${esc(a.code)}</td><td>${'　'.repeat(({group:0,general:1,subsidiary:2,detail:3} as Record<string,number>)[a.level])}${esc(a.title)}</td><td>${({group:'گروه',general:'کل',subsidiary:'معین',detail:'تفصیلی'})[a.level]}</td><td>${a.nature==='debit'?'بدهکار':'بستانکار'}</td><td>${a.isActive?'فعال':'غیرفعال'}</td><td><button class="btn btn-sm btn-secondary" data-edit-account="${a.id}">ویرایش</button> <button class="btn btn-sm btn-secondary" data-toggle-account="${a.id}">${a.isActive?'غیرفعال':'فعال'}</button></td></tr>`).join('')}</tbody></table></div>`;
}
function renderPeriods(): string {
  if (!data) return '';
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>سال مالی</th><th>شروع</th><th>پایان</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${data.fiscalPeriods.map(p=>`<tr><td>${esc(p.title)}</td><td>${esc(p.startDate)}</td><td>${esc(p.endDate)}</td><td>${p.status==='open'?'باز':'بسته'}</td><td>${p.status==='open'?`<button class="btn btn-sm btn-secondary" data-close-period="${p.id}">بستن سال</button>`:'—'}</td></tr>`).join('') || '<tr><td colspan="5">هنوز سال مالی تعریف نشده است.</td></tr>'}</tbody></table></div>`;
}
function renderJournals(): string {
  if (!data) return '';
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>شماره</th><th>تاریخ</th><th>شرح</th><th>بدهکار</th><th>بستانکار</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${data.journalEntries.map(j=>{const d=j.lines.reduce((s,l)=>s+l.debitRial,0),c=j.lines.reduce((s,l)=>s+l.creditRial,0);return `<tr><td>${esc(j.number)}</td><td>${esc(j.date)}</td><td>${esc(j.description)}</td><td>${fa(d)}</td><td>${fa(c)}</td><td>${j.status==='posted'?'قطعی':'پیش‌نویس'}</td><td>${j.status==='draft'?`<button class="btn btn-sm btn-primary" data-post-journal="${j.id}">قطعی‌سازی</button>`:'قفل‌شده'}</td></tr>`}).join('') || '<tr><td colspan="7">هنوز سندی ثبت نشده است.</td></tr>'}</tbody></table></div>`;
}
function renderJournalLineEditor(count: number): string {
  if (!data) return '';
  const currencyLabel = data.settings.currencyDisplay==='toman'?'تومان':'ریال';
  const opts = accountOptions('detail');
  return Array.from({length: count}, (_, i) => `<div class="accounting-voucher-line" data-je-line="${i}"><label class="field">حساب<select data-je-account><option value="">انتخاب حساب</option>${opts}</select></label><label class="field">شرح ردیف<input data-je-description placeholder="شرح آرتیکل"></label><label class="field">بدهکار (<span>${currencyLabel}</span>)<input data-je-debit inputmode="decimal" placeholder="۰"></label><label class="field">بستانکار (<span>${currencyLabel}</span>)<input data-je-credit inputmode="decimal" placeholder="۰"></label><button type="button" class="btn btn-sm btn-secondary" data-je-remove aria-label="حذف ردیف" ${i<2?'disabled':''}>حذف</button></div>`).join('');
}
function updateJournalTotals(): void {
  if (!data) return;
  let debit=0, credit=0;
  document.querySelectorAll<HTMLElement>('[data-je-line]').forEach(row=>{
    try { debit += parseMoneyToRial(normalizeDigits(row.querySelector<HTMLInputElement>('[data-je-debit]')?.value||'0')||'0',data!.settings.currencyDisplay); } catch {}
    try { credit += parseMoneyToRial(normalizeDigits(row.querySelector<HTMLInputElement>('[data-je-credit]')?.value||'0')||'0',data!.settings.currencyDisplay); } catch {}
  });
  const node=el<HTMLElement>('#jeTotals'); if(node) node.textContent=`جمع بدهکار: ${fa(debit)} | جمع بستانکار: ${fa(credit)} | ${debit===credit&&debit>0?'سند متوازن':'اختلاف: '+fa(Math.abs(debit-credit))}`;
}
function render(): void {
  const root = el<HTMLDivElement>('#accountingWorkspace'); if (!root || !data) return;
  root.setAttribute('dir','rtl');
  root.innerHTML = `
    <nav class="accounting-shortcuts" aria-label="بخش‌های حسابداری">${accountingTabs.map(t=>`<button type="button" class="accounting-shortcut" data-acc-tab="${t.id}" aria-pressed="false"><span class="accounting-shortcut-icon" aria-hidden="true">${t.icon}</span><span>${t.label}</span></button>`).join('')}</nav>
    <section class="acc-section" data-acc-section="backup"><div class="card accounting-inner-card" dir="rtl" style="text-align:right">
<h3>ذخیره و بازیابی</h3>
<p class="hint">پشتیبان کامل حسابداری، بازرگانی و بهای تمام‌شده را روی موبایل یا رایانه ذخیره، بازیابی یا اشتراک‌گذاری کنید.</p>
<div class="form-grid" style="margin-top:12px">
<button type="button" class="btn btn-primary" id="accBackupDownload">ذخیره فایل پشتیبان</button>
<button type="button" class="btn btn-secondary" id="accBackupShare">اشتراک‌گذاری</button>
<button type="button" class="btn btn-secondary" id="accBackupRestore">بازیابی از فایل</button>
<input type="file" id="accBackupFile" accept="application/json,.json" hidden>
</div>
<p class="hint" id="accBackupStatus" style="margin-top:12px"></p>
</div></section>
<section class="acc-section" data-acc-section="settings"><div class="card accounting-inner-card"><h3>تنظیمات</h3><label class="field">واحد نمایش مبالغ<select id="accCurrency"><option value="toman" ${data.settings.currencyDisplay==='toman'?'selected':''}>تومان</option><option value="rial" ${data.settings.currencyDisplay==='rial'?'selected':''}>ریال</option></select></label><button class="btn btn-primary" id="accSaveCurrency">ذخیره تنظیمات</button></div>
    </section><section class="acc-section" data-acc-section="accounts"><div class="card accounting-inner-card"><h3>کدینگ</h3><div class="form-grid"><label class="field">کد حساب<input id="accCode" placeholder="مثلاً 110103"></label><label class="field">عنوان حساب<input id="accTitle" placeholder="عنوان حساب"></label><label class="field">سطح حساب<select id="accLevel"><option value="group">گروه</option><option value="general">کل</option><option value="subsidiary">معین</option><option value="detail">تفصیلی</option></select></label><label class="field">حساب والد<select id="accParent"><option value="">بدون والد</option>${accountOptions()}</select></label><label class="field">ماهیت<select id="accNature"><option value="debit">بدهکار</option><option value="credit">بستانکار</option></select></label></div><div class="actions"><button class="btn btn-primary" id="accAddAccount">افزودن حساب</button><button class="btn btn-secondary" id="accCancelEdit" hidden>لغو ویرایش</button></div><input type="hidden" id="accEditId">${renderAccounts()}</div>
    </section><section class="acc-section" data-acc-section="fiscal"><div class="card accounting-inner-card"><h3>سال مالی</h3>
<label class="field">سال مالی فعال (برای تمام ثبت‌ها)<select id="fyActive">${data.fiscalPeriods.filter(p=>p.status==='open').map(p=>`<option value="${p.id}" ${data.settings.activeFiscalPeriodId===p.id?'selected':''}>${esc(p.title)}</option>`).join('')||'<option value="">سال باز تعریف نشده</option>'}</select></label>
<button class="btn btn-primary" id="fySetActive" type="button" style="margin-top:8px">اعمال سال فعال</button>
<hr style="margin:16px 0;border:0;border-top:1px solid var(--border-color,#e2e8f0)">
<div class="form-grid"><label class="field">عنوان<input id="fyTitle" placeholder="مثلاً سال مالی ۱۴۰۵"></label><label class="field">تاریخ شروع<input id="fyStart" placeholder="۱۴۰۵/۰۱/۰۱"></label><label class="field">تاریخ پایان<input id="fyEnd" placeholder="۱۴۰۵/۱۲/۲۹"></label></div><button class="btn btn-primary" id="fyCreate">ایجاد سال مالی</button>${renderPeriods()}</div>
    </div></section><section class="acc-section" data-acc-section="journals"><div class="card accounting-inner-card"><h3>سند حسابداری</h3><div class="form-grid"><label class="field">شماره سند<input id="jeNumber" placeholder="مثلاً ۱۰۰۱"></label><label class="field">تاریخ شمسی<input id="jeDate" placeholder="۱۴۰۵/۰۱/۰۱"></label><label class="field">شرح سند<input id="jeDescription" placeholder="شرح مختصر"></label></div><div class="accounting-voucher-head"><strong>آرتیکل‌های سند</strong><span class="hint">هر سند می‌تواند چندین ردیف بدهکار و بستانکار داشته باشد.</span></div><div id="jeLines" class="accounting-voucher-lines">${renderJournalLineEditor(2)}</div><div class="actions"><button type="button" class="btn btn-secondary" id="jeAddLine">افزودن ردیف</button><span id="jeTotals" class="hint">جمع بدهکار و بستانکار: ۰</span></div><button class="btn btn-primary" id="jeSave">ثبت پیش‌نویس سند</button>${renderJournals()}</div></section>`;
  applyAccountingTab();
  bind();
}
async function persist(next: AccountingData): Promise<void> { data = next; await saveAccountingData(next); render(); window.dispatchEvent(new Event('accounting:data-updated')); }
function bindJournalLineEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-je-line] [data-je-remove]').forEach(button=>button.addEventListener('click',()=>{const rows=document.querySelectorAll('[data-je-line]');if(rows.length<=2){toast('سند باید حداقل دو ردیف داشته باشد','error');return;}button.closest('[data-je-line]')?.remove();updateJournalTotals();}));
  document.querySelectorAll<HTMLInputElement>('[data-je-debit], [data-je-credit]').forEach(input=>input.addEventListener('input',updateJournalTotals));
}
function bind(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-acc-tab]').forEach(button => button.addEventListener('click',()=>{activeAccountingTab=button.dataset.accTab||'commerce';applyAccountingTab()}));
  el<HTMLButtonElement>('#accSaveCurrency')?.addEventListener('click', async()=>{if(!data)return;data.settings.currencyDisplay=el<HTMLSelectElement>('#accCurrency')!.value as 'rial'|'toman';await persist(data);toast('تنظیم واحد پول ذخیره شد','success')});
  const buildAccountingBackup=async()=>{
    const [accounting,commerce,costing]=await Promise.all([loadAccountingData(),loadCommerceData(),loadInventoryCostData()]);
    return {
      schema:'anbarin-accounting-backup',
      version:1,
      exportedAt:new Date().toISOString(),
      accounting,
      commerce,
      costing,
    };
  };
  const setBackupStatus=(msg:string)=>{const n=el<HTMLElement>('#accBackupStatus');if(n)n.textContent=msg;};
  el<HTMLButtonElement>('#accBackupDownload')?.addEventListener('click',async()=>{
    try{
      const payload=await buildAccountingBackup();
      const name=`anbarin-backup-${dateStr()}.json`;
      downloadFile(JSON.stringify(payload,null,2),name,'application/json;charset=utf-8');
      setBackupStatus('فایل پشتیبان ذخیره شد: '+name);
      toast('پشتیبان ذخیره شد','success');
    }catch(e){toast(e instanceof Error?e.message:'خطا در ذخیره پشتیبان','error')}
  });
  el<HTMLButtonElement>('#accBackupShare')?.addEventListener('click',async()=>{
    try{
      const payload=await buildAccountingBackup();
      const text=JSON.stringify(payload,null,2);
      const name=`anbarin-backup-${dateStr()}.json`;
      const file=new File([text],name,{type:'application/json'});
      if(navigator.share&&navigator.canShare?.({files:[file]})){
        await navigator.share({title:'پشتیبان انبارین',text:'فایل پشتیبان حسابداری',files:[file]});
        setBackupStatus('اشتراک‌گذاری انجام شد');
        toast('اشتراک‌گذاری شد','success');
        return;
      }
      if(navigator.share){
        await navigator.share({title:'پشتیبان انبارین',text:text.slice(0,500)+'\n…'});
        setBackupStatus('اشتراک‌گذاری متنی انجام شد');
        toast('اشتراک‌گذاری شد','success');
        return;
      }
      downloadFile(text,name,'application/json;charset=utf-8');
      setBackupStatus('اشتراک‌گذاری در دسترس نبود؛ فایل ذخیره شد');
      toast('فایل ذخیره شد','info');
    }catch(e){
      if(e instanceof Error&&e.name==='AbortError')return;
      toast(e instanceof Error?e.message:'خطا در اشتراک‌گذاری','error');
    }
  });
  el<HTMLButtonElement>('#accBackupRestore')?.addEventListener('click',()=>el<HTMLInputElement>('#accBackupFile')?.click());
  el<HTMLInputElement>('#accBackupFile')?.addEventListener('change',async()=>{
    const input=el<HTMLInputElement>('#accBackupFile');
    const file=input?.files?.[0];
    if(!file)return;
    try{
      const raw=await file.text();
      const parsed=JSON.parse(raw) as {schema?:string;version?:number;accounting?:AccountingData;commerce?:unknown;costing?:unknown};
      if(parsed.schema!=='anbarin-accounting-backup'||!parsed.accounting||!parsed.commerce||!parsed.costing)throw new Error('فایل پشتیبان معتبر نیست.');
      if(!confirm('بازیابی، داده‌های فعلی حسابداری را جایگزین می‌کند. ادامه می‌دهید؟')){input.value='';return;}
      await saveAccountingData(parsed.accounting);
      await saveCommerceData(parsed.commerce as Parameters<typeof saveCommerceData>[0]);
      await saveInventoryCostData(parsed.costing as Parameters<typeof saveInventoryCostData>[0]);
      data=await loadAccountingData();
      setBackupStatus('بازیابی از فایل انجام شد: '+file.name);
      toast('بازیابی انجام شد','success');
      window.dispatchEvent(new Event('accounting:data-updated'));
      render();
    }catch(e){toast(e instanceof Error?e.message:'خطا در بازیابی','error')}
    finally{if(input)input.value='';}
  });

  const level=el<HTMLSelectElement>('#accLevel')!; const parent=el<HTMLSelectElement>('#accParent')!;
  level.addEventListener('change',()=>{const lv=level.value as AccountLevel;const parentLevel: Record<string,AccountLevel|undefined>={group:undefined,general:'group',subsidiary:'general',detail:'subsidiary'};const opts=(data?.accounts||[]).filter(a=>a.level===parentLevel[lv]&&a.isActive);parent.innerHTML='<option value="">'+(lv==='group'?'بدون والد':'انتخاب والد')+'</option>'+opts.map(a=>`<option value="${a.id}">${esc(a.code)} — ${esc(a.title)}</option>`).join('')});
  el<HTMLButtonElement>('#accAddAccount')?.addEventListener('click',async()=>{if(!data)return;try{const editId=el<HTMLInputElement>('#accEditId')!.value||undefined;const next=upsertAccount(data,{id:editId,code:el<HTMLInputElement>('#accCode')!.value,title:el<HTMLInputElement>('#accTitle')!.value,level:level.value as AccountLevel,parentId:parent.value||null,nature:el<HTMLSelectElement>('#accNature')!.value as 'debit'|'credit',isActive:(data.accounts.find(a=>a.id===editId)?.isActive ?? true),isSystem:(data.accounts.find(a=>a.id===editId)?.isSystem ?? false)});await persist(next);toast('حساب ذخیره شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ذخیره حساب','error')}});
  el<HTMLButtonElement>('#accCancelEdit')?.addEventListener('click',()=>render());
  document.querySelectorAll<HTMLElement>('[data-edit-account]').forEach(b=>b.addEventListener('click',()=>{const a=data?.accounts.find(x=>x.id===b.dataset.editAccount);if(!a)return;el<HTMLInputElement>('#accEditId')!.value=a.id;el<HTMLInputElement>('#accCode')!.value=a.code;el<HTMLInputElement>('#accTitle')!.value=a.title;level.value=a.level;level.dispatchEvent(new Event('change'));parent.value=a.parentId||'';el<HTMLSelectElement>('#accNature')!.value=a.nature;el<HTMLButtonElement>('#accAddAccount')!.textContent='ذخیره تغییرات';el<HTMLButtonElement>('#accCancelEdit')!.hidden=false}));
  document.querySelectorAll<HTMLElement>('[data-toggle-account]').forEach(b=>b.addEventListener('click',async()=>{if(!data)return;const a=data.accounts.find(x=>x.id===b.dataset.toggleAccount);if(!a)return;try{await persist({...data,accounts:data.accounts.map(x=>x.id===a.id?{...x,isActive:!x.isActive,updatedAt:new Date().toISOString()}:x)});toast('وضعیت حساب تغییر کرد','success')}catch{toast('تغییر وضعیت انجام نشد','error')}}));
  el<HTMLButtonElement>('#fySetActive')?.addEventListener('click',async()=>{if(!data)return;try{const id=el<HTMLSelectElement>('#fyActive')!.value;if(!id)throw new Error('سال مالی باز انتخاب کنید.');await persist(withActiveFiscalPeriod(data,id));toast('سال مالی فعال تنظیم شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا','error')}});
  el<HTMLButtonElement>('#fyCreate')?.addEventListener('click',async()=>{if(!data)return;try{const p=createFiscalPeriod({title:el<HTMLInputElement>('#fyTitle')!.value,startDate:normalizeDigits(el<HTMLInputElement>('#fyStart')!.value),endDate:normalizeDigits(el<HTMLInputElement>('#fyEnd')!.value)},data.fiscalPeriods);const next={...data,fiscalPeriods:[...data.fiscalPeriods,p],settings:{...data.settings,activeFiscalPeriodId:data.settings.activeFiscalPeriodId||p.id}};await persist(next);toast('سال مالی ایجاد شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ایجاد سال مالی','error')}});
  document.querySelectorAll<HTMLElement>('[data-close-period]').forEach(b=>b.addEventListener('click',async()=>{if(!data)return;try{const {closeFiscalPeriod}=await import('./accounting');await persist(closeFiscalPeriod(data,b.dataset.closePeriod!));toast('سال مالی بسته شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا','error')}}));
  el<HTMLButtonElement>('#jeAddLine')?.addEventListener('click',()=>{const host=el<HTMLElement>('#jeLines');if(!host)return;host.insertAdjacentHTML('beforeend',renderJournalLineEditor(host.querySelectorAll('[data-je-line]').length+1));bindJournalLineEvents();});
  bindJournalLineEvents();
  el<HTMLButtonElement>('#jeSave')?.addEventListener('click',async()=>{if(!data)return;try{const number=el<HTMLInputElement>('#jeNumber')!.value.trim();if(!number)throw new Error('شماره سند الزامی است.');const lines:JournalEntry['lines']=[];document.querySelectorAll<HTMLElement>('[data-je-line]').forEach(row=>{const accountId=row.querySelector<HTMLSelectElement>('[data-je-account]')!.value;const debitText=normalizeDigits(row.querySelector<HTMLInputElement>('[data-je-debit]')!.value||'0');const creditText=normalizeDigits(row.querySelector<HTMLInputElement>('[data-je-credit]')!.value||'0');const debitRial=parseMoneyToRial(debitText,data!.settings.currencyDisplay);const creditRial=parseMoneyToRial(creditText,data!.settings.currencyDisplay);if(accountId||debitRial||creditRial)lines.push({id:id('line'),accountId,description:row.querySelector<HTMLInputElement>('[data-je-description]')!.value.trim(),debitRial,creditRial});});const entry:JournalEntry={id:id('je'),number,fiscalPeriodId:resolveActiveFiscalPeriod(data).id,date:normalizeDigits(el<HTMLInputElement>('#jeDate')!.value),description:el<HTMLInputElement>('#jeDescription')!.value.trim(),status:'draft',source:'manual',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),lines};await persist(upsertJournalEntry(data,entry));toast('پیش‌نویس سند ذخیره شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ثبت سند','error')}});
  document.querySelectorAll<HTMLElement>('[data-post-journal]').forEach(b=>b.addEventListener('click',async()=>{if(!data)return;try{await persist(postJournalEntry(data,b.dataset.postJournal!));toast('سند قطعی شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا','error')}}));
}
export async function initAccountingUI(): Promise<void> {
  try { data=await initializeSuggestedChart(); render();
    window.addEventListener('accounting:data-updated', async () => { data = await loadAccountingData(); render(); });
  }
  catch(error){console.error('[Anbarin] accounting UI init failed',error);toast('بارگذاری حسابداری انجام نشد','error')}
}
