/** رابط فاکتورها و دریافت/پرداخت */
import { loadAccountingData, parseMoneyToRial, formatMoneyFromRial, resolveActiveFiscalPeriod } from './accounting';
import {
  loadCommerceData, saveCommerceData, buildInvoice, updateDraftInvoice, postInvoice,
  createCashTransaction, ensureCommerceAccounts, updateChequeStatus, invoiceOutstanding,
  upsertParty, recordOperatingEntry, listOperatingEntries,
  type CommerceData, type AccountingParty, type InvoiceType, type InvoicePaymentPart, isSaleInvoiceType, isPurchaseInvoiceType,
} from './accounting-commerce';
import { toast } from './ui';
import { openProductModal, offerAddProduct } from './products-ui';
import { enhanceDateFields, attachJalaliCalendar, todayJalali as sharedTodayJalali } from './date-picker';
import { products, logAudit, findProductByCode } from './state';
import { openScanner } from './scanner';
import { loadInventoryCostData, saveInventoryCostData, setOpeningStockCost } from './inventory-costing';
import { buildInventoryReconciliation } from './inventory-reconciliation';
import {
  createInternalTransfer, getBankAccountBalances, importBankStatement, loadBankReconciliation, parseBankStatementCsv,
  createCashBankMove, createBankFee, getBankAccountLedger, getBankReconciliationSummary,
} from './accounting-bank';
import { extendChequeDueDate, getChequeDashboard, loadChequeBook, recordChequeEvent, replaceChequeDetails } from './accounting-cheques';
import { endorseCheque, getChequeEndorsement, getChequeEndorsements, getChequeEndorsementRemaining } from './accounting-cheque-endorsement';
import { loadChequeChain, getChainAvailable, transferEndorsedCheque } from './accounting-cheque-chain';
import { getChequeOutcomeReport, getOutcomeAvailable, loadChequeOutcomes, recordChequeHolderOutcome } from './accounting-cheque-outcomes';
import { getAgingDashboard, type AgingBucket } from './accounting-aging';
import { getCashflowDashboard } from './accounting-cashflow';
import { getProfitabilityDashboard, getExpenseAdjustedProfitability, getProfitabilityPeriodComparison, getMonthlyProfitabilityTrend, type ProfitabilityFilter } from './accounting-profitability';
import { exportProfitabilityXlsx, printProfitabilityPdf } from './accounting-profitability-export';
import { exportManagementDashboardXlsx, printManagementDashboardPdf } from './management-dashboard-export';
import { exportManagementMonthXlsx, printManagementMonthPdf } from './management-month-export';
import { detectManagementMonthAnomalies, type ManagementMonthRow } from './management-anomaly';

let commerce: CommerceData | null = null;
let editingInvoiceId: string | null = null;
let profitabilityFilter:ProfitabilityFilter={};
let managementFilter:ProfitabilityFilter={};
let currency: 'rial'|'toman' = 'toman';
type CommerceSection = 'home'|'sale'|'purchase'|'receipts'|'cheques'|'aging'|'banking'|'management'|'inventory'|'parties'|'operating';
type CommercePanelSection = Exclude<CommerceSection, 'home'>;
let activeCommerceSection: CommerceSection = 'home';
let activeInvoiceType: InvoiceType = 'sale';
let editingPartyId: string | null = null;
let suppressCommerceSheetReopen = false;
const invoiceTypeTitle=(t:InvoiceType)=>t==='sale'?'فاکتور فروش':t==='purchase'?'فاکتور خرید':t==='return-sale'?'برگشت از فروش':t==='return-purchase'?'برگشت از خرید':'پیش‌فاکتور';
let fiscalPeriodsCache: Array<{id:string;startDate:string;endDate:string;status:string}> = [];
const fa=(n:number)=>new Intl.NumberFormat('fa-IR').format(n);
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const digits=(s:string)=>s.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const el=<T extends HTMLElement>(s:string)=>document.querySelector<T>(s);
const id=(p:string)=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
function money(rial:number):string { try{return `${fa(Number(formatMoneyFromRial(rial,currency)))} ${currency==='toman'?'تومان':'ریال'}`;}catch{return fa(rial)} }
function partyOptions(type?:'customer'|'supplier'):string {
  return (commerce?.parties||[]).filter(p=>p.isActive&&(!type||p.type==='both'||p.type===type)).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
}
function partyTypeLabel(t:AccountingParty['type']):string {
  return t==='customer'?'مشتری':t==='supplier'?'تأمین‌کننده':'مشتری و تأمین‌کننده';
}
function partiesPanelHtml():string {
  const rows=(commerce?.parties||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'fa')).map(p=>`<tr class="${p.isActive?'':'party-inactive'}"><td>${esc(p.name)}</td><td>${partyTypeLabel(p.type)}</td><td>${esc(p.phone||'—')}</td><td>${esc(p.nationalId||'—')}</td><td>${esc(p.address||'—')}</td><td>${p.isActive?'فعال':'غیرفعال'}</td><td><button type="button" class="btn btn-sm btn-secondary" data-edit-party="${esc(p.id)}">ویرایش</button></td></tr>`).join('')||'<tr><td colspan="7">هنوز طرف حسابی ثبت نشده است.</td></tr>';
  const editing=editingPartyId?(commerce?.parties||[]).find(p=>p.id===editingPartyId):undefined;
  return `<div class="card" style="margin-top:12px" dir="rtl">
<h3>تعریف شخص / طرف حساب</h3>
<p class="hint">فیلدهای استاندارد: نام، موبایل، آدرس، شناسه ملی، کد اقتصادی، شماره ثبت، کد پستی و نوع طرف حساب. از همین فرم می‌توانید مشتری یا تأمین‌کننده جدید بسازید یا ویرایش کنید.</p>
<div class="form-grid" id="partyFormGrid">
<input type="hidden" id="partyEditId" value="${esc(editing?.id||'')}">
<label class="field">نام <span class="required">*</span><input id="partyName" value="${esc(editing?.name||'')}" placeholder="نام شخص یا شرکت" autocomplete="name"></label>
<label class="field">نوع طرف حساب
<select id="partyType">
<option value="customer"${!editing||editing.type==='customer'?' selected':''}>مشتری</option>
<option value="supplier"${editing?.type==='supplier'?' selected':''}>تأمین‌کننده</option>
<option value="both"${editing?.type==='both'?' selected':''}>مشتری و تأمین‌کننده</option>
</select></label>
<label class="field">موبایل / تلفن<input id="partyPhone" value="${esc(editing?.phone||'')}" placeholder="۰۹۱۲..." inputmode="tel" autocomplete="tel"></label>
<label class="field">شناسه ملی / کد ملی<input id="partyNationalId" value="${esc(editing?.nationalId||'')}" placeholder="۱۰ تا ۱۴ رقم" inputmode="numeric"></label>
<label class="field">کد اقتصادی<input id="partyEconomicCode" value="${esc(editing?.economicCode||'')}" placeholder="اختیاری"></label>
<label class="field">شماره ثبت<input id="partyRegistrationNumber" value="${esc(editing?.registrationNumber||'')}" placeholder="اختیاری"></label>
<label class="field">کد پستی<input id="partyPostalCode" value="${esc(editing?.postalCode||'')}" placeholder="۱۰ رقم" inputmode="numeric"></label>
<label class="field" style="grid-column:1/-1">آدرس<textarea id="partyAddress" rows="2" placeholder="نشانی کامل">${esc(editing?.address||'')}</textarea></label>
<label class="field"><span>وضعیت</span><select id="partyIsActive"><option value="1"${!editing||editing.isActive?' selected':''}>فعال</option><option value="0"${editing&&!editing.isActive?' selected':''}>غیرفعال</option></select></label>
</div>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
<button type="button" class="btn btn-primary" id="partySaveBtn">${editing?'ذخیره تغییرات':'ثبت شخص جدید'}</button>
<button type="button" class="btn btn-secondary" id="partyResetBtn" ${editing?'':'hidden'}>انصراف از ویرایش</button>
</div>
<h4 style="margin-top:22px">فهرست طرف حساب‌ها</h4>
<div class="table-wrap"><table class="data-table"><thead><tr><th>نام</th><th>نوع</th><th>موبایل</th><th>شناسه ملی</th><th>آدرس</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${rows}</tbody></table></div>
</div>`;
}
function collectPartyForm():Omit<AccountingParty,'id'|'createdAt'|'updatedAt'> & {id?:string} {
  const idVal=el<HTMLInputElement>('#partyEditId')?.value.trim()||undefined;
  return {
    id:idVal||undefined,
    name:(el<HTMLInputElement>('#partyName')?.value||'').trim(),
    type:(el<HTMLSelectElement>('#partyType')?.value||'customer') as AccountingParty['type'],
    phone:(el<HTMLInputElement>('#partyPhone')?.value||'').trim(),
    nationalId:digits((el<HTMLInputElement>('#partyNationalId')?.value||'').trim()),
    economicCode:(el<HTMLInputElement>('#partyEconomicCode')?.value||'').trim(),
    registrationNumber:(el<HTMLInputElement>('#partyRegistrationNumber')?.value||'').trim(),
    postalCode:digits((el<HTMLInputElement>('#partyPostalCode')?.value||'').trim()),
    address:(el<HTMLTextAreaElement>('#partyAddress')?.value||'').trim(),
    isActive:(el<HTMLSelectElement>('#partyIsActive')?.value||'1')==='1',
  };
}
async function savePartyFromForm(selectInInvoice=false):Promise<AccountingParty|null> {
  if(!commerce)return null;
  try{
    const input=collectPartyForm();
    const beforeIds=new Set(commerce.parties.map(p=>p.id));
    const next=upsertParty(commerce,input);
    const saved=input.id
      ? next.parties.find(p=>p.id===input.id)
      : next.parties.find(p=>!beforeIds.has(p.id))||next.parties.find(p=>p.name===input.name);
    if(!saved)throw new Error('ثبت طرف حساب ناموفق بود.');
    await saveCommerceData(next);
    commerce=next;
    editingPartyId=null;
    logAudit('party_upsert',{partyId:saved.id,name:input.name,type:input.type});
    toast(input.id?'طرف حساب به‌روزرسانی شد.':'شخص جدید ثبت شد.','success');
    if(selectInInvoice){
      const sel=el<HTMLSelectElement>('#invoiceParty');
      if(sel){
        sel.innerHTML='<option value="">انتخاب طرف حساب</option>'+partyOptions(isSaleInvoiceType(activeInvoiceType)?'customer':'supplier');
        sel.value=saved.id;
        if(sel.value!==saved.id){
          const option=document.createElement('option'); option.value=saved.id; option.textContent=saved.name; sel.appendChild(option); sel.value=saved.id;
        }
        sel.dispatchEvent(new Event('change',{bubbles:true}));
      }
      const cashSel=el<HTMLSelectElement>('#cashParty');
      if(cashSel){
        const t=el<HTMLSelectElement>('#cashType')?.value;
        cashSel.innerHTML='<option value="">انتخاب</option>'+partyOptions(t==='payment'?'supplier':'customer');
        cashSel.value=saved.id;
      }
    }
    return saved;
  }catch(e){
    toast(e instanceof Error?e.message:'خطا در ثبت طرف حساب','error');
    return null;
  }
}
function openPartyFormSheet(opts?:{preferType?:'customer'|'supplier'|'both'; selectAfterSave?:boolean; prefillName?:string}):void {
  document.getElementById('partyFormSheet')?.remove();
  const prefer=opts?.preferType||(isSaleInvoiceType(activeInvoiceType)?'customer':'supplier');
  editingPartyId=null;
  const overlay=document.createElement('div');
  overlay.id='partyFormSheet';
  overlay.dir='rtl';
  overlay.style.cssText='position:fixed;inset:0;z-index:10120;background:var(--surface,#fff);color:var(--text,#222);overflow:auto;padding:clamp(12px,3vw,28px)';
  overlay.innerHTML=`<div style="max-width:900px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px"><h2 style="margin:0">تعریف شخص جدید</h2><button type="button" class="btn btn-secondary" id="partySheetClose">بستن</button></div>${partiesPanelHtml()}</div>`;
  document.body.appendChild(overlay);
  const typeSel=overlay.querySelector<HTMLSelectElement>('#partyType');
  if(typeSel&&!editingPartyId)typeSel.value=prefer;
  if(opts?.prefillName){const n=overlay.querySelector<HTMLInputElement>('#partyName');if(n)n.value=opts.prefillName;}
  const close=(clearEdit=true)=>{overlay.remove();if(clearEdit)editingPartyId=null;};
  overlay.querySelector('#partySheetClose')?.addEventListener('click',()=>close(true));
  overlay.querySelector<HTMLButtonElement>('#partySaveBtn')?.addEventListener('click',async()=>{
    const saveButton=overlay.querySelector<HTMLButtonElement>('#partySaveBtn');
    if(saveButton){saveButton.disabled=true;saveButton.textContent='در حال ذخیره…';}
    const saved=await savePartyFromForm(!!opts?.selectAfterSave);
    if(saveButton){saveButton.disabled=false;saveButton.textContent=editingPartyId?'ذخیره تغییرات':'ثبت شخص جدید';}
    if(!saved)return;
    close(true);
    // هنگام ایجاد شخص از داخل فاکتور، DOM فاکتور را بازسازی نکن؛ انتخاب تازه حفظ شود.
    if(!opts?.selectAfterSave) await render();
  });
  overlay.querySelector('#partyResetBtn')?.addEventListener('click',()=>{editingPartyId=null;close(true);openPartyFormSheet(opts);});
  overlay.querySelectorAll<HTMLButtonElement>('[data-edit-party]').forEach(btn=>btn.addEventListener('click',()=>{
    editingPartyId=btn.dataset.editParty||null;
    close(false);
    openPartyFormSheet({preferType:prefer,selectAfterSave:opts?.selectAfterSave});
  }));
}
function periodOptions():string {
  return loadPeriodOptions;
}
async function activeFiscalPeriodId():Promise<string> {
  const d=await loadAccountingData();
  return resolveActiveFiscalPeriod(d).id;
}
let loadPeriodOptions='';
function accountOptions():string {
  return accountOptionsCache;
}
let accountOptionsCache='';
async function operatingPanelHtml():Promise<string>{
  const acc=await loadAccountingData();
  const expenseOpts=acc.accounts.filter(a=>a.isActive&&a.level==='detail'&&a.code.startsWith('6'))
    .map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('');
  const incomeOpts=acc.accounts.filter(a=>a.isActive&&a.level==='detail'&&a.code.startsWith('4'))
    .map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('');
  const cashOpts=acc.accounts.filter(a=>a.isActive&&a.level==='detail'&&(a.code.startsWith('1101')||a.id==='det-cash'||a.id==='det-bank'||/صندوق|بانک|تنخواه/.test(a.title)))
    .map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('')||accountOptionsCache;
  const periodOpts=periodOptions()||acc.fiscalPeriods.filter(p=>p.status==='open').map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
  const recent=listOperatingEntries(acc,undefined,40);
  const recentRows=recent.map(x=>`<tr><td>${esc(x.date)}</td><td>${x.kind==='expense'?'هزینه':'درآمد'}</td><td>${esc(x.number)}</td><td>${esc(x.accountCode)} ${esc(x.accountTitle)}</td><td>${esc(x.description)}</td><td>${money(x.amountRial)}</td></tr>`).join('')
    ||'<tr><td colspan="6">هنوز هزینه یا درآمدی از این بخش ثبت نشده است.</td></tr>';
  return `<div class="card" dir="rtl">
<h3>ثبت هزینه و درآمد</h3>
<p class="hint">برای هزینه‌های متفرقه (اجاره، حقوق، ملزومات و …) و درآمدهای غیر از فاکتور فروش. با ثبت، سند حسابداری قطعی ساخته می‌شود.</p>
<div class="form-grid">
<label class="field">نوع ثبت<select id="opKind"><option value="expense">هزینه</option><option value="income">درآمد</option></select></label>
<label class="field">تاریخ شمسی<input id="opDate" value="${todayJalali()}" placeholder="1405/01/01" inputmode="numeric"></label>
<label class="field">سال مالی<select id="opPeriod">${periodOpts||'<option value="">سال مالی باز تعریف نشده</option>'}</select></label>
<label class="field">مبلغ (${currency==='toman'?'تومان':'ریال'})<input id="opAmount" inputmode="decimal" placeholder="۰"></label>
<label class="field" id="opAccountExpenseWrap">حساب هزینه<select id="opExpenseAccount"><option value="">انتخاب حساب هزینه</option>${expenseOpts}</select></label>
<label class="field" id="opAccountIncomeWrap" hidden>حساب درآمد<select id="opIncomeAccount"><option value="">انتخاب حساب درآمد</option>${incomeOpts}</select></label>
<label class="field">از / به صندوق یا بانک<select id="opCashAccount"><option value="">انتخاب حساب</option>${cashOpts}</select></label>
<label class="field">طرف حساب (اختیاری)<select id="opParty"><option value="">بدون طرف حساب</option>${partyOptions()}</select></label>
<label class="field" style="grid-column:1/-1">شرح<input id="opDescription" placeholder="مثلاً اجاره فروردین / درآمد اجاره انبار"></label>
</div>
<div class="actions"><button type="button" class="btn btn-primary" id="opSave">ثبت و صدور سند</button></div>
<h4 style="margin-top:20px">آخرین ثبت‌ها</h4>
<div class="table-wrap"><table class="data-table"><thead><tr><th>تاریخ</th><th>نوع</th><th>شماره سند</th><th>حساب</th><th>شرح</th><th>مبلغ</th></tr></thead><tbody>${recentRows}</tbody></table></div>
</div>`;
}
function invoicePeriodForDate(date:string):string {
  if(!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) throw new Error('تاریخ فاکتور باید به شکل سال/ماه/روز شمسی باشد.');
  const period=fiscalPeriodsCache.find(p=>p.status==='open'&&date>=p.startDate&&date<=p.endDate);
  if(!period) throw new Error('برای تاریخ فاکتور، سال مالی باز و معتبری پیدا نشد. ابتدا سال مالی متناسب را تعریف یا باز کنید.');
  return period.id;
}
function todayJalali():string {
  const parts=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  return `${parts.find(x=>x.type==='year')?.value}/${parts.find(x=>x.type==='month')?.value}/${parts.find(x=>x.type==='day')?.value}`;
}
function nextInvoiceNumber(type:InvoiceType):string {
  const prefix=type==='sale'?'S':type==='purchase'?'P':type==='return-sale'?'RS':type==='return-purchase'?'RP':'PF';
  const numbers=(commerce?.invoices||[]).filter(i=>i.type===type).map(i=>{const m=i.number.match(new RegExp(`^${prefix}-(\\d+)$`));return m?Number(m[1]):0;});
  return `${prefix}-${String(Math.max(0,...numbers)+1).padStart(6,'0')}`;
}
function invoiceRows(type:InvoiceType):string {
  return (commerce?.invoices||[]).filter(i=>i.type===type).slice().reverse().map(i=>{
    const p=commerce?.parties.find(x=>x.id===i.partyId);
    return `<tr><td>${esc(i.number)}</td><td>${esc(p?.name||'—')}</td><td>${esc(i.date)}</td><td>${money(i.grossRial)}</td><td>${i.status==='posted'?'قطعی':'پیش‌نویس'}</td><td><button class="btn btn-sm btn-secondary" data-print-invoice="${i.id}">چاپ / ارسال</button> ${i.status==='draft'?`<button class="btn btn-sm btn-secondary" data-edit-invoice="${i.id}">ویرایش</button>${i.type==='proforma'?'پیش‌فاکتور؛ بدون سند':`<button class="btn btn-sm btn-primary" data-post-invoice="${i.id}">تسویه</button>`}`:'قطعی؛ ویرایش مستقیم غیرفعال'}</td></tr>`;
  }).join('')||'<tr><td colspan="6">برای این بخش هنوز فاکتوری ثبت نشده است.</td></tr>';
}
function cashRows():string {
  return (commerce?.cashTransactions||[]).slice().reverse().map(t=>{const p=commerce?.parties.find(x=>x.id===t.partyId);const method=t.method==='cheque'?'چک':t.method==='bank'?'بانک':t.method==='card'?'کارت‌خوان':t.method==='transfer'?'حواله':'نقد';const status=t.chequeStatus==='pending'?'در انتظار وصول':t.chequeStatus==='cleared'?'وصول/تسویه‌شده':t.chequeStatus==='bounced'?'برگشتی':t.chequeStatus==='void'?'باطل':'قطعی';const endorsed=!!getChequeEndorsement(t.id,commerce!);const actions=t.chequeStatus==='pending'?`${endorsed?'چک ظهرنویسی شده؛ ':''}${!endorsed?`<button class="btn btn-sm btn-secondary" data-cheque-clear="${t.id}">وصول/تسویه</button> `:''}<button class="btn btn-sm btn-secondary" data-cheque-bounce="${t.id}">برگشتی</button>`:'—';return `<tr><td>${esc(t.number)}</td><td>${t.type==='receipt'?'دریافت':'پرداخت'} (${method})</td><td>${esc(p?.name||'—')}</td><td>${esc(t.date)}</td><td>${money(t.amountRial)}</td><td>${status}${t.chequeNumber?`<br>چک ${esc(t.chequeNumber)} · ${esc(t.chequeDueDate||'')}`:''}</td><td>${actions}</td></tr>`}).join('')||'<tr><td colspan="7">هنوز دریافت یا پرداختی ثبت نشده است.</td></tr>';
}
function addInvoicePaymentRow(part?:InvoicePaymentPart):void {
 const host=el<HTMLDivElement>('#invoicePaymentRows');if(!host)return;
 const row=document.createElement('div');row.className='form-grid invoice-payment-row';row.style.cssText='border:1px solid var(--border-color,#ddd);border-radius:8px;padding:10px;margin:8px 0;align-items:end';
 row.innerHTML=`<label class="field">روش پرداخت<select data-pay-method><option value="cash">نقدی</option><option value="card">کارت</option><option value="cheque">چک</option><option value="credit">اعتباری (مانده بدهی)</option></select></label><label class="field">مبلغ (${currency==='toman'?'تومان':'ریال'})<input data-pay-amount inputmode="numeric" placeholder="مبلغ این مرحله"></label><label class="field" data-pay-cheque hidden>شماره چک<input data-pay-cheque-number></label><label class="field" data-pay-cheque hidden>سریال چک<input data-pay-cheque-serial></label><label class="field" data-pay-cheque hidden>شناسه صیادی *<input data-pay-cheque-sayadi inputmode="numeric" placeholder="شناسه صیادی"></label><label class="field" data-pay-cheque hidden>بانک<input data-pay-cheque-bank></label><label class="field" data-pay-cheque hidden>سررسید چک<input data-pay-cheque-due placeholder="1405/01/30"></label><label class="field" data-pay-cheque hidden>توضیحات<input data-pay-cheque-note></label><button type="button" class="btn btn-sm btn-secondary" data-pay-remove>حذف</button>`;
 host.appendChild(row);const method=row.querySelector<HTMLSelectElement>('[data-pay-method]')!;method.value=part?.method||'cash';row.querySelector<HTMLInputElement>('[data-pay-amount]')!.value=part?formatMoneyFromRial(part.amountRial,currency):'';row.querySelector<HTMLInputElement>('[data-pay-cheque-number]')!.value=part?.chequeNumber||'';row.querySelector<HTMLInputElement>('[data-pay-cheque-bank]')!.value=part?.chequeBank||'';row.querySelector<HTMLInputElement>('[data-pay-cheque-account]')!.value=part?.chequeAccount||'';row.querySelector<HTMLInputElement>('[data-pay-cheque-due]')!.value=part?.chequeDueDate||'';row.querySelector<HTMLInputElement>('[data-pay-cheque-note]')!.value=part?.note||'';
 const toggle=()=>row.querySelectorAll<HTMLElement>('[data-pay-cheque]').forEach(x=>x.hidden=method.value!=='cheque');method.addEventListener('change',toggle);toggle();row.querySelector('[data-pay-remove]')!.addEventListener('click',()=>row.remove());
}
function readInvoicePaymentParts():InvoicePaymentPart[]{return [...document.querySelectorAll<HTMLElement>('.invoice-payment-row')].map(row=>{const method=row.querySelector<HTMLSelectElement>('[data-pay-method]')!.value as InvoicePaymentPart['method'];return {method,amountRial:parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-pay-amount]')!.value||'0'),currency),...(method==='cheque'?{chequeNumber:row.querySelector<HTMLInputElement>('[data-pay-cheque-number]')!.value,chequeBank:row.querySelector<HTMLInputElement>('[data-pay-cheque-bank]')!.value,chequeAccount:row.querySelector<HTMLInputElement>('[data-pay-cheque-account]')!.value,chequeDueDate:digits(row.querySelector<HTMLInputElement>('[data-pay-cheque-due]')!.value),note:row.querySelector<HTMLInputElement>('[data-pay-cheque-note]')!.value}:{})};}).filter(x=>x.amountRial>0);}
function productOptions():string{return products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — ${esc(p.code||p.sku||p.id)} (${esc(p.warehouse||'انبار اصلی')})</option>`).join('')}
function addInvoiceLine(productId?:string):void {
  const host=el<HTMLDivElement>('#commerceInvoiceLines'); if(!host)return;
  const row=document.createElement('div'); row.className='form-grid commerce-line invoice-line-card'; row.setAttribute('dir','rtl');
  row.innerHTML=`<div class="invoice-line-heading"><span class="invoice-line-number"></span><span>قلم</span></div><input type="hidden" data-line-product value=""><div class="field invoice-line-product-name" data-line-product-label hidden><span class="invoice-product-badge">کالای انبار</span> <strong data-line-product-title></strong></div><label class="field">شرح ردیف فاکتور<input data-line-desc placeholder="مثلاً اجرت نصب، مشاوره یا نام کالا"></label><label class="field">واحد اندازه‌گیری<input data-line-unit value="عدد" placeholder="عدد، کیلو، بسته..."></label><label class="field invoice-stock-field">موجودی فعلی<output data-line-stock class="invoice-line-stock">—</output></label><label class="field">تعداد<input data-line-qty data-recalc inputmode="decimal" value="1"></label><label class="field">قیمت واحد (${currency==='toman'?'تومان':'ریال'})<input data-line-price data-recalc inputmode="numeric" placeholder="۰"></label><label class="field">تخفیف (${currency==='toman'?'تومان':'ریال'})<input data-line-discount data-recalc inputmode="numeric" value="0"></label><label class="field invoice-line-total-field">مبلغ این ردیف<input data-line-total readonly value="۰"></label><button type="button" class="btn btn-sm btn-secondary invoice-line-remove" data-remove-line>حذف ردیف</button>`;
  const productInput=row.querySelector<HTMLInputElement>('[data-line-product]')!;
  productInput.value=productId||'';
  const descField=row.querySelector<HTMLInputElement>('[data-line-desc]')!;
  const descLabel=descField.closest('label') as HTMLElement|null;
  const unitField=row.querySelector<HTMLInputElement>('[data-line-unit]')!;
  const stockOut=row.querySelector<HTMLOutputElement>('[data-line-stock]');
  const stockField=row.querySelector<HTMLElement>('.invoice-stock-field');
  const productLabel=row.querySelector<HTMLElement>('[data-line-product-label]');
  const productTitle=row.querySelector<HTMLElement>('[data-line-product-title]');
  const applyProduct=(id:string)=>{
    productInput.value=id||'';
    const product=products.find(p=>p.id===id);
    if(product){
      descField.value=product.name;
      if(descLabel)descLabel.hidden=true;
      if(productLabel)productLabel.hidden=false;
      if(productTitle)productTitle.textContent=product.name;
      unitField.value=product.unit||'عدد';
      if(stockOut)stockOut.textContent=`${fa(Number(product.systemQty)||0)} ${product.unit||'عدد'}`;
      if(stockField)stockField.hidden=false;
      const price=row.querySelector<HTMLInputElement>('[data-line-price]')!;
      if(product.price&&(!price.value.trim()||price.dataset.autoFilled==='true')){
        price.value=formatMoneyFromRial(Number(product.price)||0,currency);
        price.dataset.autoFilled='true';
      }
    }else{
      if(descLabel)descLabel.hidden=false;
      if(productLabel)productLabel.hidden=true;
      if(productTitle)productTitle.textContent='';
      descField.readOnly=false;
      descField.placeholder='مثلاً اجرت نصب، مشاوره یا نام کالا';
      if(!descField.value.trim())descField.value='';
      if(stockOut)stockOut.textContent='—';
      if(stockField)stockField.hidden=true;
    }
    updateInvoiceTotals();
  };
  if(productId)applyProduct(productId); else { if(stockField)stockField.hidden=true; if(descLabel)descLabel.hidden=false; if(productLabel)productLabel.hidden=true; }
  row.querySelector('[data-remove-line]')?.addEventListener('click',()=>{if(host.children.length>1)row.remove();else toast('فاکتور باید حداقل یک ردیف داشته باشد.','error');updateInvoiceTotals()});
  row.querySelector<HTMLInputElement>('[data-line-price]')?.addEventListener('input',event=>{(event.target as HTMLInputElement).dataset.autoFilled='false'});
  host.appendChild(row);
  row.querySelectorAll<HTMLInputElement>('[data-recalc]').forEach(input=>input.addEventListener('input',()=>updateInvoiceTotals()));
  updateInvoiceTotals();
}
function addProductToInvoice(productId:string, keepScanReady=false):void {
  if(!products.some(p=>p.id===productId)){toast('کالای انتخاب‌شده پیدا نشد.','error');return;}
  const linesHost=el<HTMLDivElement>('#commerceInvoiceLines');
  if(linesHost?.children.length===1){const first=linesHost.firstElementChild as HTMLElement;const hasData=!!(first.querySelector<HTMLInputElement>('[data-line-desc]')?.value.trim()||first.querySelector<HTMLInputElement>('[data-line-price]')?.value.trim()||first.querySelector<HTMLInputElement>('[data-line-product]')?.value);if(!hasData)first.remove();}
  addInvoiceLine(productId);
  const host=el<HTMLInputElement>('#invoiceProductSearch');if(host){host.value='';}
  const barcode=el<HTMLInputElement>('#invoiceBarcodeInput');if(barcode)barcode.value='';
  if(keepScanReady){
    host?.focus({preventScroll:true});
  }else{
    el<HTMLElement>('#commerceInvoiceLines')?.lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
}
/** نرمال‌سازی متن فارسی برای جستجو (ی/ك، فاصله، ارقام) */
function normalizeSearchText(value:string):string{
  return digits(value||'')
    .toLocaleLowerCase()
    .replace(/[يى]/g,'ی')
    .replace(/[ك]/g,'ک')
    .replace(/[\u200c\u200f\u202a-\u202e]/g,' ')
    .replace(/[\s‌]+/g,' ')
    .trim();
}
/** کلمات نام کالا برای جستجو در کلمهٔ اول، دوم، … */
function searchTokens(value:string):string[]{
  return normalizeSearchText(value).split(/[\s\-_/\\.,،؛:]+/).filter(Boolean);
}
/**
 * جستجوی هوشمند کالا:
 * - فقط اولِ نام نیست؛ داخل نام و شروع هر کلمه هم چک می‌شود
 * - مثال: «ن» → «شیر نبات»، «نان»، «پنیر» (اگر شامل ن باشد)
 * اولویت: تطبیق دقیق > شروع نام > شروع یکی از کلمات > شامل در نام > کد/بارکد
 */
function invoiceProductMatches(value:string){
  const raw=(value||'').trim();if(!raw)return [];
  const q=normalizeSearchText(raw);
  if(!q)return [];
  const scored:Array<{p:typeof products[0];score:number}>=[];
  for(const p of products){
    const name=normalizeSearchText(p.name||'');
    const code=normalizeSearchText(p.code||'');
    const sku=normalizeSearchText(p.sku||'');
    const words=searchTokens(p.name||'');
    let score=0;
    if(name===q||code===q||sku===q)score=100;
    else if(name.startsWith(q))score=80;
    else if(words.some(w=>w.startsWith(q)))score=70; // کلمه دوم، سوم، …
    else if(name.includes(q))score=50; // هر جای نام
    else if(words.some(w=>w.includes(q)))score=45;
    else if(code.includes(q)||sku.includes(q))score=40;
    else continue;
    // ترجیح نام کوتاه‌تر در امتیاز مساوی
    score+=Math.max(0,10-Math.min(10,name.length/4));
    scored.push({p,score});
  }
  scored.sort((a,b)=>b.score-a.score||(a.p.name||'').localeCompare(b.p.name||'','fa'));
  return scored.slice(0,20).map(x=>x.p);
}
function resolveInvoiceProduct(value:string){
  const raw=(value||'').trim();if(!raw)return null;
  const q=normalizeSearchText(raw);
  const matches=invoiceProductMatches(value);
  return matches.find(p=>{
    const name=normalizeSearchText(p.name||'');
    const code=normalizeSearchText(p.code||'');
    const sku=normalizeSearchText(p.sku||'');
    return name===q||code===q||sku===q;
  })||(matches.length===1?matches[0]:null);
}
function renderInvoiceProductSuggestions(value:string,activeIndex=0):void{
 const host=el<HTMLDivElement>('#invoiceProductSuggestions');if(!host)return;const matches=invoiceProductMatches(value);if(!matches.length){host.innerHTML='';host.hidden=true;return;}
 host.innerHTML=matches.map((p,i)=>`<button type="button" class="invoice-product-suggestion ${i===activeIndex?'active':''}" role="option" aria-selected="${i===activeIndex}" data-invoice-product-choice="${esc(p.id)}"><span><b>${esc(p.name)}</b><small>${esc(p.code||p.sku||'بدون کد')} · ${esc(p.unit||'عدد')}</small></span><span class="suggestion-stock">موجودی ${fa(Number(p.systemQty)||0)}</span></button>`).join('');host.hidden=false;
 host.querySelectorAll<HTMLButtonElement>('[data-invoice-product-choice]').forEach(b=>b.addEventListener('click',()=>{addProductToInvoice(b.dataset.invoiceProductChoice!);host.hidden=true;}));
}
function invoicePaymentTermsLabel(parts:InvoicePaymentPart[]):string {const labels:Record<InvoicePaymentPart['method'],string>={cash:'نقدی',card:'کارت',cheque:'چکی',credit:'اعتباری'};const unique=[...new Set(parts.map(x=>labels[x.method]))];return unique.length>1?'ترکیبی: '+unique.join('، '):(unique[0]||'اعتباری');}
function readInvoicePaymentPartsSafe():InvoicePaymentPart[]{try{return readInvoicePaymentParts()}catch{return []}}
function settlementRow(part?:InvoicePaymentPart):string {
 const method=part?.method||'cash';
 return `<div class="settlement-payment-row form-grid" style="border:1px solid var(--border-color,#ddd);border-radius:8px;padding:12px;margin:8px 0;align-items:end">
 <label class="field">روش<select data-settle-method><option value="cash" ${method==='cash'?'selected':''}>نقدی</option><option value="card" ${method==='card'?'selected':''}>کارت‌خوان</option><option value="cheque" ${method==='cheque'?'selected':''}>چک</option><option value="credit" ${method==='credit'?'selected':''}>اعتباری (مانده حساب)</option></select></label>
 <label class="field">مبلغ (${currency==='toman'?'تومان':'ریال'})<input data-settle-amount inputmode="numeric" value="${part?esc(formatMoneyFromRial(part.amountRial,currency)):''}" placeholder="مبلغ"></label>
 <label class="field" data-settle-cheque ${method==='cheque'?'':'hidden'}>شماره چک<input data-settle-cheque-number value="${esc(part?.chequeNumber||'')}" placeholder="شماره روی چک"></label>
 <label class="field" data-settle-cheque ${method==='cheque'?'':'hidden'}>سریال چک<input data-settle-cheque-serial value="${esc(part?.chequeSerial||'')}" placeholder="سریال / سری برگه"></label>
 <label class="field" data-settle-cheque ${method==='cheque'?'':'hidden'}>شناسه صیادی *<input data-settle-cheque-sayadi value="${esc(part?.chequeSayadi||part?.chequeAccount||'')}" inputmode="numeric" placeholder="شناسه ۱۶ رقمی صیادی" required></label>
 <label class="field" data-settle-cheque ${method==='cheque'?'':'hidden'}>بانک<input data-settle-cheque-bank value="${esc(part?.chequeBank||'')}" placeholder="نام بانک"></label>
 <label class="field" data-settle-cheque ${method==='cheque'?'':'hidden'}>تاریخ سررسید چک<input data-settle-cheque-due value="${esc(part?.chequeDueDate||'')}" placeholder="1405/01/30" inputmode="numeric"></label>
 <label class="field" data-settle-cheque ${method==='cheque'?'':'hidden'}>توضیحات چک<input data-settle-cheque-note value="${esc(part?.note||'')}"></label>
 <button type="button" class="btn btn-sm btn-secondary" data-settle-remove>حذف مرحله</button></div>`;
}
function openInvoiceSettlementSheet(invoiceId:string):void {
 const target=commerce?.invoices.find(i=>i.id===invoiceId);if(!target||!commerce){toast('فاکتور پیدا نشد.','error');return;}
 if(target.status==='posted'){toast('این فاکتور قبلاً قطعی شده است.','info');return;}
 if(target.type==='proforma'){toast('پیش‌فاکتور قابل تسویه حسابداری نیست.','error');return;}
 document.getElementById('invoiceSettlementSheet')?.remove();
 const party=commerce.parties.find(p=>p.id===target.partyId);
 const overlay=document.createElement('div');overlay.id='invoiceSettlementSheet';overlay.dir='rtl';
 overlay.style.cssText='position:fixed;inset:0;z-index:10120;background:var(--surface,#fff);color:var(--text,#222);overflow:auto;padding:clamp(12px,3vw,28px)';
 const isSale=isSaleInvoiceType(target.type);
 const actionLabel=isSale?'دریافت':'پرداخت';
 const defaultAmount=Math.max(0,target.grossRial);
 overlay.innerHTML=`<div style="max-width:1000px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h2 style="margin:0 0 6px">تسویه فاکتور — ${actionLabel}</h2><p class="hint" style="margin:0">شماره ${esc(target.number)} · ${esc(party?.name||'—')} · مبلغ نهایی ${money(target.grossRial)}</p></div><button type="button" class="btn btn-secondary" id="settlementBack">بازگشت</button></div>
 <div class="card" style="margin-top:16px"><h3>نوع ${actionLabel}</h3><p class="hint">روش و مبلغ را مشخص کنید. می‌توانید چند روش را ترکیب کنید (مثلاً بخشی نقد و بخشی چک). مانده به‌صورت اعتباری ثبت می‌شود.</p><div id="settlementRows">${((target.paymentParts||[]).filter(x=>x.method!=='credit').length?(target.paymentParts||[]).filter(x=>x.method!=='credit'):[{method:'cash' as const,amountRial:defaultAmount}]).map(x=>settlementRow(x)).join('')}</div><button type="button" class="btn btn-secondary" id="settlementAdd">افزودن روش ${actionLabel}</button>
 <div class="form-grid" style="margin-top:12px"><label class="field">سررسید مانده اعتباری (شمسی)<input id="settlementDueDate" value="${esc(target.dueDate||target.date||'')}" placeholder="1405/01/30" inputmode="numeric" autocomplete="off"></label></div><div class="card" style="margin-top:12px"><div id="settlementTotals">در حال محاسبه...</div><div id="settlementCredit" class="hint" style="margin-top:8px"></div></div>
 <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px"><button type="button" class="btn btn-primary" id="settlementConfirm">تأیید ${actionLabel} و ثبت قطعی</button><button type="button" class="btn btn-secondary" id="settlementCancel">انصراف</button></div></div></div>`;
 document.body.appendChild(overlay);
 queueMicrotask(()=>enhanceDateFields(overlay));

 const host=overlay.querySelector<HTMLDivElement>('#settlementRows')!;
 const normalizeJalali=(raw:string):string=>{
   const v=digits(raw||'').trim().replace(/-/g,'/');
   const m=v.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
   if(!m)return v;
   return `${m[1]}/${m[2].padStart(2,'0')}/${m[3].padStart(2,'0')}`;
 };
 const read=():InvoicePaymentPart[]=>[...host.querySelectorAll<HTMLElement>('.settlement-payment-row')].map(row=>{
   const method=row.querySelector<HTMLSelectElement>('[data-settle-method]')!.value as InvoicePaymentPart['method'];
   const amountRial=parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-settle-amount]')!.value||'0'),currency);
   if(method==='cheque'){
     const sayadi=digits(row.querySelector<HTMLInputElement>('[data-settle-cheque-sayadi]')?.value||'').replace(/\D/g,'');
     return {
       method,
       amountRial,
       chequeNumber:row.querySelector<HTMLInputElement>('[data-settle-cheque-number]')!.value.trim(),
       chequeSerial:row.querySelector<HTMLInputElement>('[data-settle-cheque-serial]')?.value.trim()||'',
       chequeSayadi:sayadi,
       chequeAccount:sayadi,
       chequeBank:row.querySelector<HTMLInputElement>('[data-settle-cheque-bank]')!.value.trim(),
       chequeDueDate:normalizeJalali(row.querySelector<HTMLInputElement>('[data-settle-cheque-due]')!.value),
       note:row.querySelector<HTMLInputElement>('[data-settle-cheque-note]')!.value.trim(),
     };
   }
   return {method,amountRial};
 }).filter(x=>x.amountRial>0);

 const update=()=>{
   const parts=read();
   const paid=parts.reduce((n,x)=>n+x.amountRial,0);
   const credit=Math.max(0,target.grossRial-paid);
   overlay.querySelector<HTMLElement>('#settlementTotals')!.textContent=`مبلغ فاکتور: ${money(target.grossRial)} · دریافت/پرداخت واقعی: ${money(paid)} · مانده اعتباری: ${money(credit)}`;
   const creditNode=overlay.querySelector<HTMLElement>('#settlementCredit');
   if(creditNode)creditNode.textContent=credit>0?`مبلغ اعتباری فاکتور (مانده حساب): ${money(credit)} — این مبلغ دریافت نقدی یا بانکی نیست.`:'مبلغ اعتباری: ۰ — تسویه کامل نقدی/کارتی/چکی';
 };

 const bind=(row:HTMLElement)=>{
   row.querySelector<HTMLSelectElement>('[data-settle-method]')!.addEventListener('change',()=>{
     const cheque=row.querySelector<HTMLSelectElement>('[data-settle-method]')!.value==='cheque';
     row.querySelectorAll<HTMLElement>('[data-settle-cheque]').forEach(x=>x.hidden=!cheque);
     update();
   });
   row.querySelectorAll('input').forEach(x=>x.addEventListener('input',update));
   row.querySelector('[data-settle-remove]')!.addEventListener('click',()=>{row.remove();update();});
 };
 host.querySelectorAll<HTMLElement>('.settlement-payment-row').forEach(bind);
 const add=()=>{const wrap=document.createElement('div');wrap.innerHTML=settlementRow();const row=wrap.firstElementChild as HTMLElement;host.appendChild(row);bind(row);update();};
 overlay.querySelector('#settlementAdd')!.addEventListener('click',add);
 overlay.querySelector('#settlementBack')!.addEventListener('click',()=>overlay.remove());
 overlay.querySelector('#settlementCancel')!.addEventListener('click',()=>overlay.remove());
 host.addEventListener('input',update);host.addEventListener('change',update);update();

 const resolveCashAccountId=async():Promise<string>=>{
   // از کش گزینه‌ها
   const fromCache=accountOptionsCache.match(/value="([^"]+)"/)?.[1];
   if(fromCache)return fromCache;
   const acc=await loadAccountingData();
   const preferred=acc.accounts.find(a=>a.isActive&&a.level==='detail'&&(a.id==='det-cash'||a.id==='det-bank'));
   if(preferred)return preferred.id;
   const anyCash=acc.accounts.find(a=>a.isActive&&a.level==='detail'&&(/صندوق|بانک|تنخواه/.test(a.title)||a.code.startsWith('1101')||a.code.startsWith('111')));
   if(anyCash)return anyCash.id;
   throw new Error('حساب صندوق یا بانک فعال پیدا نشد. از بخش کدینگ حساب صندوق/بانک را فعال کنید.');
 };

 overlay.querySelector<HTMLButtonElement>('#settlementConfirm')!.addEventListener('click',async()=>{
   const btn=overlay.querySelector<HTMLButtonElement>('#settlementConfirm');
   if(btn){btn.disabled=true;btn.textContent='در حال ثبت...';}
   try{
     const activeCommerce=commerce;
     if(!activeCommerce)throw new Error('اطلاعات فاکتور در دسترس نیست.');
     const live=activeCommerce.invoices.find(i=>i.id===target.id);
     if(!live)throw new Error('فاکتور پیدا نشد.');
     if(live.status==='posted')throw new Error('این فاکتور قبلاً قطعی شده است.');

     const realParts=read().filter(x=>x.method!=='credit');
     const total=realParts.reduce((n,x)=>n+x.amountRial,0);
     if(total>live.grossRial+1)throw new Error('جمع دریافت/پرداخت نباید از مبلغ فاکتور بیشتر شود.');
     const creditAmount=Math.max(0,live.grossRial-total);
     const parts:InvoicePaymentPart[]=[
       ...realParts,
       ...(creditAmount>0?[{method:'credit' as const,amountRial:creditAmount,note:'مانده اعتباری فاکتور'}]:[]),
     ];
     let dueDate=normalizeJalali(overlay.querySelector<HTMLInputElement>('#settlementDueDate')!.value);
     if(creditAmount>0&&!dueDate){
       dueDate=normalizeJalali(live.date||'')||normalizeJalali(todayJalali());
     }
     if(creditAmount>0&&!/^\d{4}\/\d{2}\/\d{2}$/.test(dueDate)){
       throw new Error('برای مانده اعتباری، تاریخ سررسید معتبر شمسی وارد کنید (مثال 1405/01/30).');
     }

     const chequeParts=parts.filter(x=>x.method==='cheque');
     for(const x of chequeParts){
       if(!x.chequeNumber?.trim()||!x.chequeBank?.trim()||!x.chequeDueDate||!/^\d{4}\/\d{2}\/\d{2}$/.test(x.chequeDueDate||'')){
         throw new Error('برای هر چک، شماره چک، بانک و تاریخ سررسید معتبر الزامی است.');
       }
       const sayadi=(x.chequeSayadi||x.chequeAccount||'').replace(/\D/g,'');
       if(!sayadi||sayadi.length<6) throw new Error('شناسه صیادی برای هر چک الزامی است (حداقل ۶ رقم).');
       x.chequeSayadi=sayadi;
       x.chequeAccount=x.chequeAccount||sayadi;
     }
     const chequeKeys=chequeParts.map(x=>`${(x.chequeNumber||'').trim()}|${(x.chequeBank||'').trim().toLocaleLowerCase()}`);
     if(new Set(chequeKeys).size!==chequeKeys.length)throw new Error('شماره چک تکراری در همین تسویه وجود دارد.');
     if(chequeKeys.some(k=>activeCommerce.cashTransactions.some(t=>t.method==='cheque'&&t.chequeStatus!=='void'&&`${(t.chequeNumber||'').trim()}|${(t.chequeBank||'').trim().toLocaleLowerCase()}`===k))){
       throw new Error('شماره چک با همین بانک قبلاً ثبت شده است.');
     }

     // ذخیره شرایط پرداخت روی پیش‌نویس
     live.paymentParts=parts;
     live.paymentTerms=invoicePaymentTermsLabel(parts);
     live.dueDate=dueDate||live.dueDate||'';
     live.updatedAt=new Date().toISOString();
     await saveCommerceData(activeCommerce);

     // قطعی‌سازی فاکتور (سند حسابداری + انبار)
     const result=await postInvoice(live.id,activeCommerce);
     commerce=result.commerce;

     // ثبت دریافت/پرداخت‌های واقعی
     if(realParts.length){
       const cashAccountId=await resolveCashAccountId();
       for(let n=0;n<realParts.length;n++){
         const part=realParts[n];
         const period=invoicePeriodForDate(live.date);
         const isReceipt=live.type==='sale'||live.type==='return-purchase';
         const tx=await createCashTransaction({
           type:isReceipt?'receipt':'payment',
           number:`${isReceipt?'IR':'IP'}-${live.number}-${n+1}`,
           date:live.date,
           fiscalPeriodId:period,
           partyId:live.partyId,
           cashAccountId,
           amountRial:part.amountRial,
           description:`تسویه فاکتور ${live.number} (${part.method==='cash'?'نقدی':part.method==='card'?'کارت':'چک'})`,
           method:part.method==='cash'?'cash':part.method==='card'?'card':'cheque',
           allocations:[{invoiceId:live.id,amountRial:part.amountRial}],
           chequeNumber:part.chequeNumber,
           chequeBank:part.chequeBank,
           chequeAccount:part.chequeAccount,
           chequeNote:part.note,
           chequeDueDate:part.chequeDueDate,
         },commerce);
         commerce=tx.commerce;
       }
       await saveCommerceData(commerce);
     }

     overlay.remove();
     await render();
     refreshAccounting();
     toast(creditAmount>0
       ?`فاکتور قطعی شد. ${actionLabel} واقعی ثبت شد و مانده اعتباری ${money(creditAmount)} روی حساب طرف ماند.`
       :`فاکتور قطعی شد و ${actionLabel} کامل ثبت شد.`,
       'success');
   }catch(e){
     console.error('[settlement]',e);
     toast(e instanceof Error?e.message:'خطا در ثبت تسویه فاکتور','error');
   }finally{
     if(btn && document.body.contains(btn)){btn.disabled=false;btn.textContent=`تأیید ${actionLabel} و ثبت قطعی`;}
   }
 });
}

function updateInvoiceTotals():void {
  let net=0;
  document.querySelectorAll<HTMLElement>('.commerce-line').forEach(row=>{
    const q=Number(digits(row.querySelector<HTMLInputElement>('[data-line-qty]')?.value||'0').replace(',','.'))||0;
    const price=parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-line-price]')?.value||'0'),currency);
    const discount=parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-line-discount]')?.value||'0'),currency);
    const raw=Math.round(q*price); const total=Math.max(0,raw-discount); net+=total;
    const out=row.querySelector<HTMLInputElement>('[data-line-total]'); if(out)out.value=fa(currency==='toman'?Math.round(total/10):total);
  });
  const rate=Number(digits(el<HTMLInputElement>('#invoiceTaxRate')?.value||'0').replace(',','.'));
  if(Number.isFinite(rate)&&rate>0&&rate<=100){const taxInput=el<HTMLInputElement>('#invoiceTax');if(taxInput)taxInput.value=formatMoneyFromRial(Math.round(net*rate/100),currency);}
  const tax=parseMoneyToRial(digits(el<HTMLInputElement>('#invoiceTax')?.value||'0'),currency);
  const netOut=el<HTMLElement>('#invoiceNetPreview'); if(netOut)netOut.textContent=money(net);
  const taxOut=el<HTMLElement>('#invoiceTaxPreview'); if(taxOut)taxOut.textContent=money(tax);
  const grossOut=el<HTMLElement>('#invoiceGrossPreview'); if(grossOut)grossOut.textContent=money(net+tax);const payParts=readInvoicePaymentPartsSafe();const paid=payParts.reduce((sum,x)=>sum+x.amountRial,0);const summary=el<HTMLElement>('#invoicePaymentSummary');if(summary)summary.textContent=`جمع پرداخت‌ها: ${money(paid)} · مانده اعتباری/بدهی: ${money(Math.max(0,net+tax-paid))}`;
}
function applyInvoiceTaxRate():void {
  let net=0;
  document.querySelectorAll<HTMLElement>('.commerce-line').forEach(row=>{
    const q=Number(digits(row.querySelector<HTMLInputElement>('[data-line-qty]')?.value||'0').replace(',','.'))||0;
    const price=parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-line-price]')?.value||'0'),currency);
    const discount=parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-line-discount]')?.value||'0'),currency);
    net+=Math.max(0,Math.round(q*price)-discount);
  });
  const rate=Number(digits(el<HTMLInputElement>('#invoiceTaxRate')?.value||'0').replace(',','.'));
  if(!Number.isFinite(rate)||rate<0||rate>100){toast('نرخ مالیات باید بین صفر تا ۱۰۰ درصد باشد.','error');return;}
  const tax=Math.round(net*rate/100);
  const taxInput=el<HTMLInputElement>('#invoiceTax'); if(taxInput)taxInput.value=formatMoneyFromRial(tax,currency);
  updateInvoiceTotals();
}
type InvoicePaperSize = 'a4'|'a5'|'roll80';

function companyHeaderHtml():string{
  const c=commerce?.companyProfile;
  const name=c?.name?.trim()||'انبارین پرو';
  const lines=[
    c?.nationalId?`شناسه/ملی: ${esc(c.nationalId)}`:'',
    c?.economicCode?`کد اقتصادی: ${esc(c.economicCode)}`:'',
    c?.phone?`تلفن: ${esc(c.phone)}`:'',
    c?.address?`نشانی: ${esc(c.address)}`:'',
  ].filter(Boolean);
  return `<div class="company"><div class="company-name">${esc(name)}</div>${lines.length?`<div class="muted">${lines.join(' | ')}</div>`:''}</div>`;
}

function buildInvoiceShareText(invoice:NonNullable<CommerceData['invoices'][0]>, party:{name:string;phone?:string}):string{
  const lines:string[]=[];
  lines.push(`فاکتور ${invoiceTypeTitle(invoice.type)} شماره ${invoice.number}`);
  lines.push(`تاریخ: ${invoice.date}`);
  lines.push(`طرف حساب: ${party.name}`);
  lines.push('— اقلام —');
  invoice.lines.forEach((l,i)=>{
    lines.push(`${i+1}) ${l.description} | ${fa(l.quantityMilli/1000)} ${l.unit||'عدد'} | ${money(l.totalRial)}`);
  });
  lines.push('— جمع —');
  lines.push(`خالص: ${money(invoice.netRial)}`);
  if(invoice.taxRial)lines.push(`مالیات: ${money(invoice.taxRial)}`);
  lines.push(`مبلغ نهایی: ${money(invoice.grossRial)}`);
  lines.push(`وضعیت: ${invoice.status==='posted'?'قطعی':'پیش‌نویس'}`);
  if(invoice.notes?.trim())lines.push(`یادداشت: ${invoice.notes.trim()}`);
  lines.push('ارسال‌شده از انبارین پرو');
  return lines.join('\n');
}

function invoicePrintStyles(paper:InvoicePaperSize):string{
  if(paper==='roll80'){
    return `
@page{size:80mm auto;margin:2mm}
*{box-sizing:border-box}
body{font-family:Tahoma,"Segoe UI",Arial,sans-serif;color:#111;margin:0;padding:4px;font-size:11px;width:72mm;max-width:72mm}
h1{font-size:14px;text-align:center;margin:4px 0}
.company{text-align:center;margin-bottom:6px}
.company-name{font-weight:700;font-size:13px}
.muted{color:#444;font-size:10px}
.panel{border:none;padding:2px 0;margin:4px 0}
.meta{display:block}
.meta div{padding:2px 0;background:transparent;border-bottom:1px dashed #999}
table{width:100%;border-collapse:collapse;margin:6px 0;font-size:10px}
th,td{border-top:1px dashed #999;border-bottom:1px dashed #999;border-left:none;border-right:none;padding:3px 2px;text-align:right}
th{background:transparent}
.sum{max-width:100%;margin:6px 0}
.sum div{display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px dashed #bbb}
.note{border:1px dashed #999;padding:4px;font-size:10px}
.sign{display:none}
.head{display:block}
.noprint{margin:8px 0}
button{margin:2px;padding:6px 10px}
@media print{.noprint{display:none!important}body{width:72mm}}
`;
  }
  const page = paper==='a5' ? 'A5' : 'A4';
  const baseFont = paper==='a5' ? '11px' : '12px';
  const h1 = paper==='a5' ? '16px' : '20px';
  return `
@page{size:${page};margin:${paper==='a5'?'8mm':'12mm'}}
*{box-sizing:border-box}
body{font-family:Tahoma,"Segoe UI",Arial,sans-serif;color:#172033;margin:0;padding:12px;font-size:${baseFont}}
h1{font-size:${h1};text-align:center;margin:0 0 6px}
.company{text-align:center;margin-bottom:10px}
.company-name{font-weight:700;font-size:1.1em}
.muted{color:#667085}
.head{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
.panel{border:1px solid #cbd5e1;border-radius:8px;padding:10px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.meta div{padding:6px;background:#f8fafc;border-radius:5px}
table{width:100%;border-collapse:collapse;margin:12px 0}
th,td{border:1px solid #cbd5e1;padding:6px 7px;text-align:right}
th{background:#f1f5f9}
.sum{max-width:360px;margin-right:auto}
.sum div{display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid #e2e8f0}
.note{white-space:pre-wrap;border:1px dashed #cbd5e1;padding:8px;min-height:28px}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:40px;text-align:center}
.sign div{border-top:1px solid #94a3b8;padding-top:6px}
.noprint{margin:10px 0;display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
button{padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer}
button.primary{background:#0f766e;color:#fff;border-color:#0f766e}
@media print{.noprint{display:none!important}body{padding:0}}
`;
}

function buildInvoicePrintHtml(invoice:NonNullable<CommerceData['invoices'][0]>, party:{name:string;nationalId?:string;economicCode?:string;registrationNumber?:string;phone?:string;postalCode?:string;address?:string}, paper:InvoicePaperSize):string{
  const compact=paper==='roll80';
  const rows=invoice.lines.map((l,n)=>compact
    ? `<tr><td colspan="2"><b>${n+1}. ${esc(l.description)}</b><br>${fa(l.quantityMilli/1000)} ${esc(l.unit||'عدد')} × ${money(l.unitPriceRial)}${(l.discountRial||0)?` − تخفیف ${money(l.discountRial||0)}`:''}<br><b>${money(l.totalRial)}</b></td></tr>`
    : `<tr><td>${n+1}</td><td>${esc(l.description)}</td><td>${esc(l.unit||'عدد')}</td><td>${fa(l.quantityMilli/1000)}</td><td>${money(l.unitPriceRial)}</td><td>${money(l.discountRial||0)}</td><td>${money(l.totalRial)}</td></tr>`
  ).join('');
  const tableHead=compact
    ? '<thead><tr><th colspan="2">اقلام</th></tr></thead>'
    : '<thead><tr><th>ردیف</th><th>شرح</th><th>واحد</th><th>تعداد</th><th>فی</th><th>تخفیف</th><th>جمع</th></tr></thead>';
  const partyBlock=compact
    ? `<div class="panel"><b>${isSaleInvoiceType(invoice.type)?'خریدار':'فروشنده'}:</b> ${esc(party.name)}<br>${party.phone?`تلفن: ${esc(party.phone)}`:''}</div>
       <div class="meta"><div>شماره: <b>${esc(invoice.number)}</b></div><div>تاریخ: <b>${esc(invoice.date)}</b></div><div>وضعیت: <b>${invoice.status==='posted'?'قطعی':'پیش‌نویس'}</b></div></div>`
    : `<div class="head"><div class="panel"><b>مشخصات ${isSaleInvoiceType(invoice.type)?'خریدار':'فروشنده'}</b>
        <p>${esc(party.name)}</p>
        <p>شناسه ملی: ${esc(party.nationalId||'—')} | کد اقتصادی: ${esc(party.economicCode||'—')}</p>
        <p>شماره ثبت: ${esc(party.registrationNumber||'—')}</p>
        <p>تلفن: ${esc(party.phone||'—')} | کد پستی: ${esc(party.postalCode||'—')}</p>
        <p>نشانی: ${esc(party.address||'—')}</p></div>
        <div class="panel meta">
          <div>شماره فاکتور<br><b>${esc(invoice.number)}</b></div>
          <div>تاریخ<br><b>${esc(invoice.date)}</b></div>
          <div>نوع<br><b>${invoiceTypeTitle(invoice.type)}</b></div>
          <div>وضعیت<br><b>${invoice.status==='posted'?'قطعی':'پیش‌نویس'}</b></div>
        </div></div>`;
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>فاکتور ${esc(invoice.number)}</title>
<style>${invoicePrintStyles(paper)}</style></head><body>
${companyHeaderHtml()}
<h1>فاکتور ${invoiceTypeTitle(invoice.type)}</h1>
${partyBlock}
<table>${tableHead}<tbody>${rows}</tbody></table>
<div class="sum">
  <div><span>جمع خالص</span><b>${money(invoice.netRial)}</b></div>
  <div><span>مالیات</span><b>${money(invoice.taxRial)}</b></div>
  <div><span>مبلغ نهایی</span><b>${money(invoice.grossRial)}</b></div>
</div>
${invoice.notes?.trim()?`<div class="note">${esc(invoice.notes)}</div>`:''}
${compact?'':`<div class="sign"><div>امضای فروشنده</div><div>امضای خریدار</div></div>`}
<div class="noprint">
  <button class="primary" type="button" onclick="window.print()">چاپ</button>
  <button type="button" onclick="window.close()">بستن</button>
</div>
<script>window.addEventListener('load',()=>{try{window.focus();}catch(e){}});</script>
</body></html>`;
}

function openInvoicePrintWindow(html:string, paper:InvoicePaperSize):void{
  const w=window.open('','_blank',paper==='roll80'?'width=420,height=720':'width=1000,height=800');
  if(!w){toast('اجازه بازشدن پنجره چاپ را در مرورگر فعال کنید.','error');return;}
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // چاپ خودکار با کمی تأخیر برای بارگذاری فونت
  setTimeout(()=>{try{w.print();}catch{/* ignore */}},350);
}

function shareInvoiceText(text:string, channel:'whatsapp'|'telegram'|'rubika'|'copy'|'system', phone?:string):void{
  const encoded=encodeURIComponent(text);
  if(channel==='copy'){
    void navigator.clipboard.writeText(text).then(
      ()=>toast('متن فاکتور کپی شد. می‌توانید در هر پیام‌رسان بچسبانید.','success'),
      ()=>toast('کپی متن ممکن نشد.','error'),
    );
    return;
  }
  if(channel==='system' && typeof navigator.share==='function'){
    void navigator.share({title:'فاکتور',text}).then(
      ()=>toast('اشتراک‌گذاری انجام شد.','success'),
      ()=>{/* کاربر لغو کرد */},
    );
    return;
  }
  if(channel==='whatsapp'){
    const digitsPhone=(phone||'').replace(/\D/g,'');
    const url=digitsPhone
      ? `https://wa.me/${digitsPhone.startsWith('0')?`98${digitsPhone.slice(1)}`:digitsPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url,'_blank','noopener,noreferrer');
    return;
  }
  if(channel==='telegram'){
    window.open(`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encoded}`,'_blank','noopener,noreferrer');
    return;
  }
  if(channel==='rubika'){
    // روبیکا API وب عمومی استاندارد ندارد؛ متن کپی می‌شود تا در اپ بچسبانید
    void navigator.clipboard.writeText(text).then(
      ()=>toast('متن فاکتور کپی شد. اپ روبیکا را باز کنید و بچسبانید.','success'),
      ()=>toast('کپی برای روبیکا ممکن نشد.','error'),
    );
    return;
  }
}

function openInvoicePrintShareSheet(invoiceId:string):void{
  const invoice=commerce?.invoices.find(i=>i.id===invoiceId);
  if(!invoice||!commerce){toast('فاکتور پیدا نشد.','error');return;}
  const party=commerce.parties.find(p=>p.id===invoice.partyId);
  if(!party){toast('طرف حساب فاکتور پیدا نشد.','error');return;}
  document.getElementById('invoicePrintShareSheet')?.remove();
  const overlay=document.createElement('div');
  overlay.id='invoicePrintShareSheet';
  overlay.dir='rtl';
  overlay.style.cssText='position:fixed;inset:0;z-index:10200;background:rgba(15,23,42,.45);display:flex;align-items:flex-end;justify-content:center;padding:12px';
  overlay.innerHTML=`<div class="card" style="width:min(560px,100%);max-height:92vh;overflow:auto;margin:0;border-radius:16px 16px 12px 12px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div>
        <h3 style="margin:0 0 4px">چاپ و ارسال فاکتور</h3>
        <p class="hint" style="margin:0">شماره ${esc(invoice.number)} · ${esc(party.name)} · ${money(invoice.grossRial)}</p>
      </div>
      <button type="button" class="btn btn-secondary" id="invoicePrintShareClose">بستن</button>
    </div>
    <h4 style="margin:16px 0 8px">اندازه کاغذ چاپ</h4>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
      <button type="button" class="btn btn-primary" data-print-paper="a4">A4</button>
      <button type="button" class="btn btn-primary" data-print-paper="a5">A5</button>
      <button type="button" class="btn btn-primary" data-print-paper="roll80">۸ سانتی‌متری</button>
    </div>
    <p class="hint" style="margin:8px 0 0">کاغذ ۸ سانتی برای فیش‌پرینتر حرارتی فروشگاهی است.</p>
    <h4 style="margin:18px 0 8px">ارسال به پیام‌رسان</h4>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
      <button type="button" class="btn btn-secondary" data-share-channel="whatsapp">واتساپ</button>
      <button type="button" class="btn btn-secondary" data-share-channel="telegram">تلگرام</button>
      <button type="button" class="btn btn-secondary" data-share-channel="rubika">روبیکا (کپی)</button>
      <button type="button" class="btn btn-secondary" data-share-channel="copy">کپی متن</button>
      <button type="button" class="btn btn-secondary" data-share-channel="system" style="grid-column:1/-1">اشتراک سیستم (اگر پشتیبانی شود)</button>
    </div>
    <p class="hint" style="margin-top:10px">متن خلاصه فاکتور (اقلام و مبلغ نهایی) ارسال می‌شود. برای روبیکا و بعضی اپ‌ها متن کپی می‌شود تا در گفتگو بچسبانید.</p>
  </div>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  overlay.addEventListener('click',ev=>{if(ev.target===overlay)close();});
  overlay.querySelector('#invoicePrintShareClose')?.addEventListener('click',close);
  overlay.querySelectorAll<HTMLButtonElement>('[data-print-paper]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const paper=(btn.dataset.printPaper||'a4') as InvoicePaperSize;
      const html=buildInvoicePrintHtml(invoice,party,paper);
      openInvoicePrintWindow(html,paper);
    });
  });
  const text=buildInvoiceShareText(invoice,party);
  overlay.querySelectorAll<HTMLButtonElement>('[data-share-channel]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const ch=(btn.dataset.shareChannel||'copy') as 'whatsapp'|'telegram'|'rubika'|'copy'|'system';
      shareInvoiceText(text,ch,party.phone);
    });
  });
}

function printInvoice(invoiceId:string):void {
  openInvoicePrintShareSheet(invoiceId);
}
async function bankPanel():Promise<string>{
  const [balances,recon,accData,reconSum]=await Promise.all([
    getBankAccountBalances(),loadBankReconciliation(),loadAccountingData(),getBankReconciliationSummary()
  ]);
  const opts=balances.map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('');
  const feeOpts=accData.accounts.filter(a=>a.isActive&&a.level==='detail'&&(a.code.startsWith('6')||/(هزینه|کارمزد)/.test(a.title)))
    .map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('');
  const txs=(commerce?.cashTransactions||[]).slice().reverse();
  const partyName=(id?:string)=>esc(commerce?.parties.find(p=>p.id===id)?.name||'—');
  const chequeSt=(s?:string)=>s==='pending'?'در جریان':s==='cleared'?'وصول':s==='bounced'?'برگشتی':s==='void'?'باطل':(s||'—');
  const recvCheques=txs.filter(t=>t.method==='cheque'&&t.type==='receipt');
  const payCheques=txs.filter(t=>t.method==='cheque'&&t.type==='payment');
  const defaultLedgerId=balances[0]?.id||'';
  const ledger=defaultLedgerId?await getBankAccountLedger(defaultLedgerId):[];
  const ledgerRows=ledger.slice(-80).reverse().map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.number)}</td><td>${esc(r.description)}</td><td>${money(r.debitRial)}</td><td>${money(r.creditRial)}</td><td>${money(r.balanceRial)}</td></tr>`).join('')
    ||'<tr><td colspan="6">گردشی برای این حساب ثبت نشده است.</td></tr>';
  const reconRows=recon.rows.slice().reverse().slice(0,100).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.reference||'—')}</td><td>${esc(r.description)}</td><td>${money(Math.abs(r.amountRial))} ${r.amountRial>0?'واریز':'برداشت'}</td><td>${r.matched?'تطبیق‌شده':'تطبیق‌نشده'}</td></tr>`).join('')
    ||'<tr><td colspan="5">صورت‌حساب بانکی وارد نشده است.</td></tr>';
  const chequeRow=(t:typeof txs[0],showActions:boolean)=>{
    const pending=t.chequeStatus==='pending';
    const actions=showActions&&pending
      ?`<button type="button" class="btn btn-sm btn-primary" data-cheque-clear="${t.id}">وصول</button> <button type="button" class="btn btn-sm btn-secondary" data-cheque-bounce="${t.id}">برگشت</button>`
      :chequeSt(t.chequeStatus);
    return `<tr><td>${esc(t.date)}</td><td>${esc(t.number)}</td><td>${partyName(t.partyId)}</td><td>${money(t.amountRial)}</td><td>${esc(t.chequeNumber||'—')}</td><td>${esc(t.chequeDueDate||'—')}</td><td>${actions}</td></tr>`;
  };
  const totalBalance=balances.reduce((s,a)=>s+a.balanceRial,0);
  return `<div class="card bank-panel-card" dir="rtl">
<h3>بانک و صندوق</h3>
<p class="hint">زیرمجموعه‌های استاندارد: مانده حساب‌ها، دفتر بانک، واریز/برداشت، انتقال، کارمزد، چک و مغایرت‌گیری صورت‌حساب.</p>
<div class="form-grid" style="margin:12px 0">
  <div class="stat-card"><b>${money(totalBalance)}</b><span>جمع مانده نقد و بانک</span></div>
  <div class="stat-card"><b>${fa(reconSum.matched)} / ${fa(reconSum.totalRows)}</b><span>ردیف‌های تطبیق‌شده صورت‌حساب</span></div>
  <div class="stat-card"><b>${money(reconSum.unmatchedBankRial)}</b><span>مانده ردیف‌های تطبیق‌نشده</span></div>
</div>
<div class="table-wrap"><table class="data-table"><thead><tr><th>کد</th><th>حساب</th><th>مانده دفتری</th></tr></thead><tbody>${balances.map(a=>`<tr><td>${esc(a.code)}</td><td>${esc(a.title)}</td><td>${money(a.balanceRial)}</td></tr>`).join('')||'<tr><td colspan="3">حساب صندوق/بانک تعریف نشده</td></tr>'}</tbody></table></div>

<details class="card bank-sub" open><summary>۱) دفتر بانک / صندوق</summary>
<p class="hint">گردش از اسناد حسابداری قطعی حساب انتخاب‌شده.</p>
<div class="form-grid bank-entry-grid">
<label class="field">حساب<select id="bankLedgerAccount">${opts}</select></label>
<button type="button" class="btn btn-secondary" id="bankLedgerLoad">نمایش گردش</button>
</div>
<div class="table-wrap" style="margin-top:10px"><table class="data-table"><thead><tr><th>تاریخ</th><th>شماره سند</th><th>شرح</th><th>بدهکار</th><th>بستانکار</th><th>مانده</th></tr></thead><tbody id="bankLedgerBody">${ledgerRows}</tbody></table></div>
</details>

<details class="card bank-sub"><summary>۲) واریز نقد به بانک / برداشت به صندوق</summary>
<p class="hint">جابه‌جایی وجه بین صندوق و بانک با صدور سند حسابداری.</p>
<div class="form-grid bank-entry-grid">
<label class="field">نوع<select id="bankMoveKind"><option value="deposit">واریز نقد به بانک</option><option value="withdraw">برداشت از بانک به صندوق</option></select></label>
<label class="field">شماره<input id="bankMoveNo" placeholder="خودکار یا دستی"></label>
<label class="field">تاریخ<input id="bankMoveDate" placeholder="1405/01/01" value="${todayJalali()}"></label>
<label class="field">صندوق / تنخواه<select id="bankMoveCash">${opts}</select></label>
<label class="field">بانک<select id="bankMoveBank">${opts}</select></label>
<label class="field">مبلغ<input id="bankMoveAmount" inputmode="numeric" placeholder="۰"></label>
<label class="field" style="grid-column:1/-1">شرح<input id="bankMoveDesc" placeholder="اختیاری"></label>
</div>
<button type="button" class="btn btn-primary" id="bankMoveSave">ثبت واریز / برداشت</button>
</details>

<details class="card bank-sub"><summary>۳) انتقال بین حساب‌ها</summary>
<div class="form-grid bank-entry-grid">
<label class="field">شماره<input id="bankTransferNo"></label>
<label class="field">تاریخ<input id="bankTransferDate" placeholder="1405/01/01" value="${todayJalali()}"></label>
<label class="field">از حساب<select id="bankTransferFrom">${opts}</select></label>
<label class="field">به حساب<select id="bankTransferTo">${opts}</select></label>
<label class="field">مبلغ<input id="bankTransferAmount" inputmode="numeric" placeholder="۰"></label>
<label class="field">کارمزد<input id="bankTransferFee" inputmode="numeric" value="0"></label>
<label class="field">حساب کارمزد<select id="bankTransferFeeAccount"><option value="">اختیاری</option>${feeOpts}</select></label>
<input type="hidden" id="bankTransferDescription" value="">
</div>
<button class="btn btn-primary" id="bankTransferSave" type="button">ثبت انتقال</button>
</details>

<details class="card bank-sub"><summary>۴) کارمزد بانکی</summary>
<p class="hint">ثبت کارمزد مستقل (خدمات بانکی، دسته چک و …).</p>
<div class="form-grid bank-entry-grid">
<label class="field">شماره<input id="bankFeeNo"></label>
<label class="field">تاریخ<input id="bankFeeDate" placeholder="1405/01/01" value="${todayJalali()}"></label>
<label class="field">حساب بانک<select id="bankFeeBank">${opts}</select></label>
<label class="field">حساب هزینه کارمزد<select id="bankFeeExpense"><option value="">انتخاب</option>${feeOpts}</select></label>
<label class="field">مبلغ<input id="bankFeeAmount" inputmode="numeric" placeholder="۰"></label>
<label class="field" style="grid-column:1/-1">شرح<input id="bankFeeDesc" placeholder="کارمزد خدمات بانکی"></label>
</div>
<button type="button" class="btn btn-primary" id="bankFeeSave">ثبت کارمزد</button>
</details>

<details class="card bank-sub"><summary>۵) چک‌های دریافتی (وصول)</summary>
<div class="table-wrap"><table class="data-table"><thead><tr><th>تاریخ</th><th>شماره</th><th>طرف</th><th>مبلغ</th><th>شماره چک</th><th>سررسید</th><th>عملیات</th></tr></thead><tbody>${recvCheques.map(t=>chequeRow(t,true)).join('')||'<tr><td colspan="7">چک دریافتی نیست</td></tr>'}</tbody></table></div>
</details>

<details class="card bank-sub"><summary>۶) چک‌های پرداختی</summary>
<div class="table-wrap"><table class="data-table"><thead><tr><th>تاریخ</th><th>شماره</th><th>طرف</th><th>مبلغ</th><th>شماره چک</th><th>سررسید</th><th>وضعیت</th></tr></thead><tbody>${payCheques.map(t=>chequeRow(t,true)).join('')||'<tr><td colspan="7">چک پرداختی نیست</td></tr>'}</tbody></table></div>
</details>

<details class="card bank-sub"><summary>۷) مغایرت‌گیری صورت‌حساب بانکی</summary>
<p class="hint">ورود فایل CSV بانک (ستون‌ها: date, description, reference, amount, balance) و تطبیق خودکار با دریافت/پرداخت‌ها.</p>
<div class="form-grid" style="margin:8px 0">
  <div class="stat-card"><b>${fa(reconSum.totalRows)}</b><span>کل ردیف‌ها</span></div>
  <div class="stat-card"><b>${fa(reconSum.matched)}</b><span>تطبیق‌شده</span></div>
  <div class="stat-card"><b>${fa(reconSum.unmatched)}</b><span>تطبیق‌نشده</span></div>
  <div class="stat-card"><b>${money(reconSum.bookBalanceRial)}</b><span>مانده دفتری</span></div>
</div>
<div class="form-grid bank-entry-grid">
<label class="field">حساب بانک<select id="bankStatementAccount">${opts}</select></label>
<label class="field">فایل CSV<input id="bankStatementFile" type="file" accept=".csv,text/csv"></label>
</div>
<button class="btn btn-secondary" id="bankStatementImport" type="button">ورود و تطبیق خودکار</button>
<div class="table-wrap" style="margin-top:12px"><table class="data-table"><thead><tr><th>تاریخ</th><th>پیگیری</th><th>شرح</th><th>مبلغ</th><th>وضعیت</th></tr></thead><tbody>${reconRows}</tbody></table></div>
</details>
</div>`;
}
async function chequePanel():Promise<string>{
  const all=(commerce?.cashTransactions||[]).filter(t=>t.method==='cheque').slice().reverse();
  const parts=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const today=`${parts.find(x=>x.type==='year')?.value}/${parts.find(x=>x.type==='month')?.value}/${parts.find(x=>x.type==='day')?.value}`;
  const dash=await getChequeDashboard(today);
  const rows=all.map(t=>{const party=commerce?.parties.find(p=>p.id===t.partyId);const endorsements=getChequeEndorsements(t.id,commerce!);const endorsement=endorsements[0];const holder=endorsement?commerce?.parties.find(p=>p.id===endorsement.toPartyId):undefined;const remaining=getChequeEndorsementRemaining(t.id,commerce!);const holderNames=endorsements.map(e=>commerce?.parties.find(p=>p.id===e.toPartyId)?.name||'ذی‌نفع').join('، ');const status=t.chequeStatus==='pending'?(endorsement?'واگذار شده به '+holderNames:'در جریان'):t.chequeStatus==='cleared'?'وصول/تسویه‌شده':t.chequeStatus==='bounced'?'برگشتی':'باطل';const actions=t.chequeStatus==='pending'?`<button class="btn btn-sm btn-secondary" data-chq-extend="${t.id}">تمدید سررسید</button> <button class="btn btn-sm btn-secondary" data-chq-replace="${t.id}">جایگزینی چک</button> ${t.type==='receipt'&&remaining>0?`<button class="btn btn-sm btn-primary" data-chq-endorse="${t.id}">ظهرنویسی به تأمین‌کننده · واگذاری بخشی از چک (${money(remaining)} مانده)</button>`:''} ${t.type==='receipt'&&!endorsement?`<button class="btn btn-sm btn-secondary" data-chq-deposit="${t.id}">واگذاری به بانک</button>`:''}`:'—';return `<tr><td>${esc(t.chequeNumber||'—')}</td><td>${esc(t.chequeBank||'—')}</td><td>${esc(party?.name||'—')}${endorsement?`<br><small>ذی‌نفعان: ${esc(holderNames)} · واگذارشده: ${money(t.amountRial-remaining)}</small>`:''}</td><td>${esc(t.chequeDueDate||'—')}</td><td>${money(t.amountRial)}</td><td>${status}</td><td>${actions}</td></tr>`}).join('')||'<tr><td colspan="7">چکی ثبت نشده است.</td></tr>';
  const book=await loadChequeBook();const events=book.events.slice().reverse().slice(0,30).map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(e.type==='extended'?'تمدید سررسید':e.type==='replaced'?'جایگزینی':e.type==='deposited'?'واگذاری به بانک':e.type==='bounced_note'?'یادداشت برگشت':e.type==='cleared_note'?'یادداشت وصول':'یادداشت ابطال')}</td><td>${esc(e.note)}</td><td>${esc(e.oldValue||'—')}</td><td>${esc(e.newValue||'—')}</td></tr>`).join('')||'<tr><td colspan="5">رویدادی ثبت نشده است.</td></tr>';
  const chain=await loadChequeChain();const outcomeData=await loadChequeOutcomes();const chainRows=(commerce?.chequeEndorsements||[]).flatMap(e=>{const tx=commerce!.cashTransactions.find(t=>t.id===e.transactionId);const transfers=chain.transfers.filter(t=>t.endorsementId===e.id);const nodes=[{id:undefined as string|undefined,holderId:e.toPartyId,amount:e.amountRial,label:'دارنده اولیه پس از ظهرنویسی',parent:undefined as string|undefined},...transfers.map(t=>({id:t.id,holderId:t.toPartyId,amount:t.amountRial,label:`انتقال از ${commerce!.parties.find(p=>p.id===t.fromPartyId)?.name||'—'}`,parent:t.id}))];return nodes.map(n=>{const available=Math.max(0,getChainAvailable(e.id,commerce!,chain,n.parent)-outcomeData.outcomes.filter(x=>x.endorsementId===e.id&&x.parentTransferId===n.parent).reduce((sum,x)=>sum+x.amountRial,0));const outcomeAvailable=getOutcomeAvailable(e.id,n.parent,commerce!,chain,outcomeData);const holder=commerce!.parties.find(p=>p.id===n.holderId);const transferAction=available>0?`<button class="btn btn-sm btn-secondary" data-chain-endorsement="${e.id}" data-chain-parent="${n.id||''}" data-chain-from="${n.holderId}" data-chain-available="${available}">انتقال به ذی‌نفع بعدی</button>`:'';const outcomeAction=outcomeAvailable>0?`<button class="btn btn-sm btn-primary" data-chain-outcome="${e.id}" data-outcome-parent="${n.id||''}" data-outcome-holder="${n.holderId}" data-outcome-available="${outcomeAvailable}">ثبت وصول / برگشت / اختلاف</button>`:'';return `<tr><td>${esc(tx?.chequeNumber||tx?.number||'—')}</td><td>${esc(holder?.name||'—')}</td><td>${esc(n.label)}</td><td>${money(n.amount)}</td><td>${money(outcomeAvailable)}</td><td>${transferAction} ${outcomeAction||'—'}</td></tr>`})}).join('')||'<tr><td colspan="6">هنوز انتقال زنجیره‌ای ثبت نشده است.</td></tr>';
  const outcomeReport=await getChequeOutcomeReport();const outcomeRows=outcomeReport.records.slice(0,50).map(o=>{const endorsement=(commerce?.chequeEndorsements||[]).find(e=>e.id===o.endorsementId);const tx=commerce?.cashTransactions.find(t=>t.id===endorsement?.transactionId);const holder=commerce?.parties.find(p=>p.id===o.holderPartyId);const label=o.type==='collected'?'وصول‌شده':o.type==='returned'?'برگشتی':'مورد اختلاف';return `<tr><td>${esc(o.date)}</td><td>${esc(tx?.chequeNumber||tx?.number||'—')}</td><td>${esc(holder?.name||'—')}</td><td>${label}</td><td>${money(o.amountRial)}</td><td>${esc(o.reference||'—')}</td><td>${esc(o.note||'—')}</td></tr>`}).join('')||'<tr><td colspan="7">هنوز نتیجه‌ای برای چک‌های واگذارشده ثبت نشده است.</td></tr>';
  return `<div class="card" style="margin-top:12px"><h3>دفتر چک‌ها و واگذاری چندمرحله‌ای</h3><div class="form-grid"><div class="stat-card"><b>${fa(dash.pending)}</b><span>چک در جریان</span></div><div class="stat-card"><b>${fa(dash.overdue.length)}</b><span>چک سررسیدگذشته</span></div><div class="stat-card"><b>${fa(dash.dueSoon.length)}</b><span>سررسید تا ۷ روز آینده</span></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>شماره چک</th><th>بانک</th><th>طرف حساب</th><th>سررسید</th><th>مبلغ</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${rows}</tbody></table></div><h4>گردش زنجیره‌ای ظهرنویسی</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>شماره چک</th><th>دارنده فعلی</th><th>مرحله</th><th>مبلغ مرحله</th><th>مانده تعیین‌تکلیف</th><th>عملیات</th></tr></thead><tbody>${chainRows}</tbody></table></div><div class="form-grid"><div class="stat-card"><b>${money(outcomeReport.collectedRial)}</b><span>وصول نهایی نزد دارندگان</span></div><div class="stat-card"><b>${money(outcomeReport.returnedRial)}</b><span>چک‌های برگشتی</span></div><div class="stat-card"><b>${money(outcomeReport.disputedRial)}</b><span>مبالغ مورد اختلاف</span></div></div><h4>گزارش وصول، برگشت و اختلاف نزد دارنده نهایی</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>تاریخ</th><th>شماره چک</th><th>دارنده</th><th>نتیجه</th><th>مبلغ</th><th>مرجع</th><th>شرح</th></tr></thead><tbody>${outcomeRows}</tbody></table></div><p class="hint">انتقال‌های بعدی پس از خروج چک به‌صورت دفتر عملیاتی و زنجیره تحویل ثبت می‌شوند و سند حسابداری جدید در دفاتر شرکت ایجاد نمی‌کنند؛ ثبت ظهرنویسی اولیه شرکت همچنان سند حسابداری دارد.</p><h4>سوابق دفتر چک</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>تاریخ</th><th>رویداد</th><th>شرح</th><th>مقدار قبلی</th><th>مقدار جدید</th></tr></thead><tbody>${events}</tbody></table></div><p class="hint">ظهرنویسی چک دریافتی به تأمین‌کننده، با انتخاب فاکتور خرید قطعی و ثبت سند حسابداری انجام می‌شود. هر چک می‌تواند در چند مرحله و به مبالغ جزئی به تأمین‌کنندگان مختلف واگذار شود؛ مجموع واگذاری‌ها از مبلغ چک بیشتر نمی‌شود. انتقال‌های بعدی میان دارندگان در دفتر زنجیره‌ای ثبت می‌شوند؛ چون پس از واگذاری اولیه خارج از مالکیت شرکت هستند، سند حسابداری جدیدی در دفاتر شرکت ایجاد نمی‌کنند. پس از ظهرنویسی، وصول در حساب بانکی شرکت غیرفعال است؛ برگشت یا ابطال، سندهای مرتبط را معکوس می‌کند. واگذاری ساده به بانک همچنان فقط یادداشت عملیاتی است.</p></div>`;
}

async function agingPanel():Promise<string>{
  const parts=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const today=`${parts.find(x=>x.type==='year')?.value}/${parts.find(x=>x.type==='month')?.value}/${parts.find(x=>x.type==='day')?.value}`;
  const d=await getAgingDashboard(today);
  const bucketLabels:Record<AgingBucket,string>={current:'سررسیدنشده', '1_30':'۱ تا ۳۰ روز', '31_60':'۳۱ تا ۶۰ روز', '61_90':'۶۱ تا ۹۰ روز', over_90:'بیش از ۹۰ روز'};
  const bucketRows=(Object.keys(bucketLabels) as AgingBucket[]).map(k=>`<tr><td>${bucketLabels[k]}</td><td>${money(d.buckets[k])}</td></tr>`).join('');
  const invoiceRows=d.invoices.slice(0,100).map(i=>`<tr><td>${esc(i.number)}</td><td>${i.type==='sale'?'مطالبه از مشتری':'بدهی به تأمین‌کننده'}</td><td>${esc(i.partyName)}</td><td>${esc(i.dueDate)}</td><td>${i.overdueDays?fa(i.overdueDays)+' روز':'—'}</td><td>${money(i.outstandingRial)}</td></tr>`).join('')||'<tr><td colspan="6">فاکتور قطعی دارای مانده وجود ندارد.</td></tr>';
  const chequeRows=[...d.overdueCheques,...d.dueSoonCheques].map(c=>`<tr><td>${esc(c.chequeNumber||c.number)}</td><td>${c.type==='receipt'?'دریافتنی':'پرداختنی'}</td><td>${esc(c.partyName)}</td><td>${esc(c.dueDate)}</td><td>${c.risk==='overdue'?`معوق · ${fa(c.overdueDays)} روز`:'سررسید تا ۷ روز'}</td><td>${money(c.amountRial)}</td></tr>`).join('')||'<tr><td colspan="6">چک معوق یا نزدیک سررسید وجود ندارد.</td></tr>';
  return `<div class="card" style="margin-top:12px"><h3>داشبورد مطالبات، بدهی‌ها و ریسک سررسید</h3><p class="hint">تاریخ مبنای گزارش: ${esc(today)} · فقط فاکتورهای قطعی و مانده پس از تخصیص دریافت‌ها/پرداخت‌ها محاسبه شده‌اند.</p><div class="form-grid"><div class="stat-card"><b>${money(d.receivableRial)}</b><span>مطالبات باز از مشتریان</span></div><div class="stat-card"><b>${money(d.payableRial)}</b><span>بدهی باز به تأمین‌کنندگان</span></div><div class="stat-card"><b>${money(d.netPositionRial)}</b><span>خالص مطالبات منهای بدهی‌ها</span></div><div class="stat-card"><b>${money(d.overdueReceivableRial)}</b><span>مطالبات سررسیدگذشته</span></div><div class="stat-card"><b>${money(d.overduePayableRial)}</b><span>بدهی سررسیدگذشته</span></div><div class="stat-card"><b>${money(d.chequesReceivableRial+d.chequesPayableRial)}</b><span>چک‌های در جریان</span></div></div><h4>سن مطالبات و بدهی‌ها</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>بازه</th><th>مجموع مانده</th></tr></thead><tbody>${bucketRows}</tbody></table></div><h4>فاکتورهای دارای مانده</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>شماره</th><th>نوع</th><th>طرف حساب</th><th>سررسید</th><th>تأخیر</th><th>مانده</th></tr></thead><tbody>${invoiceRows}</tbody></table></div><h4>چک‌های معوق و نزدیک سررسید</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>شماره چک</th><th>نوع</th><th>طرف حساب</th><th>سررسید</th><th>ریسک</th><th>مبلغ</th></tr></thead><tbody>${chequeRows}</tbody></table></div><p class="hint">این داشبورد گزارش مدیریتی است و هیچ سند حسابداری، فاکتور یا وضعیت چکی را تغییر نمی‌دهد. چک‌های ظهرنویسی‌شده پس از خروج از مالکیت شرکت در گردش زنجیره‌ای مراحل قبلی گزارش می‌شوند.</p></div>`;
}

async function cashflowPanel():Promise<string>{
  const parts=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const today=`${parts.find(x=>x.type==='year')?.value}/${parts.find(x=>x.type==='month')?.value}/${parts.find(x=>x.type==='day')?.value}`;
  const d=await getCashflowDashboard(today);
  const forecastRows=d.forecast.slice(0,100).map(x=>`<tr><td>${esc(x.date)}</td><td>${x.source==='invoice'?'مانده فاکتور':'چک در جریان'}</td><td>${esc(x.reference)}</td><td>${esc(x.partyName)}</td><td>${x.inflowRial?money(x.inflowRial):'—'}</td><td>${x.outflowRial?money(x.outflowRial):'—'}</td></tr>`).join('')||'<tr><td colspan="6">در بازه آینده، مورد سررسیدداری ثبت نشده است.</td></tr>';
  const partyRows=d.parties.slice(0,50).map(x=>`<tr><td>${esc(x.partyName)}</td><td>${x.role==='customer'?'مشتری':'تأمین‌کننده'}</td><td>${money(x.invoicedRial)}</td><td>${money(x.allocatedRial)}</td><td>${money(x.outstandingRial)}</td><td>${fa(Math.round(x.collectionPercent))}٪</td></tr>`).join('')||'<tr><td colspan="6">برای رتبه‌بندی، فاکتور قطعی و تخصیص پرداخت ثبت نشده است.</td></tr>';
  return `<div class="card" style="margin-top:12px"><h3>پیش‌بینی جریان نقد و رفتار پرداخت</h3><p class="hint">مبنای گزارش: ${esc(today)} · پیش‌بینی بر اساس سررسید فاکتورهای قطعی و چک‌های در جریان است؛ ارقام قطعیِ آینده نیستند.</p><div class="form-grid"><div class="stat-card"><b>${money(d.next7InRial)}</b><span>ورودی پیش‌بینی‌شده تا ۷ روز</span></div><div class="stat-card"><b>${money(d.next7OutRial)}</b><span>خروجی پیش‌بینی‌شده تا ۷ روز</span></div><div class="stat-card"><b>${money(d.next30InRial)}</b><span>ورودی پیش‌بینی‌شده تا ۳۰ روز</span></div><div class="stat-card"><b>${money(d.next30OutRial)}</b><span>خروجی پیش‌بینی‌شده تا ۳۰ روز</span></div><div class="stat-card"><b>${money(d.next60InRial)}</b><span>ورودی پیش‌بینی‌شده تا ۶۰ روز</span></div><div class="stat-card"><b>${money(d.next60OutRial)}</b><span>خروجی پیش‌بینی‌شده تا ۶۰ روز</span></div></div><h4>تقویم سررسیدهای پیش‌رو</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>تاریخ</th><th>منبع</th><th>شماره</th><th>طرف حساب</th><th>ورودی</th><th>خروجی</th></tr></thead><tbody>${forecastRows}</tbody></table></div><h4>رتبه‌بندی رفتار پرداخت طرف‌حساب‌ها</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>طرف حساب</th><th>نقش</th><th>فاکتور قطعی</th><th>پرداخت تخصیص‌یافته</th><th>مانده باز</th><th>نسبت تخصیص</th></tr></thead><tbody>${partyRows}</tbody></table></div><p class="hint">نسبت پرداخت فقط از مبالغ تخصیص‌یافته به فاکتورهای قطعی محاسبه می‌شود؛ پرداخت‌های علی‌الحساب در این نسبت منظور نمی‌شوند. این گزارش سود خالص یا توان اعتباری قطعی اشخاص را ادعا نمی‌کند و هیچ سند یا داده‌ای را تغییر نمی‌دهد.</p></div>`;
}

async function profitabilityPanel():Promise<string>{
  const d=await getProfitabilityDashboard(profitabilityFilter);
  const adjusted=await getExpenseAdjustedProfitability(d,profitabilityFilter);
  const periodRows=await getProfitabilityPeriodComparison(profitabilityFilter);
  const trendRows=await getMonthlyProfitabilityTrend(profitabilityFilter);
  const trendMax=Math.max(1,...trendRows.map(x=>Math.max(x.salesRial,x.grossProfitRial,x.expensesRial)));
  const trendBars=trendRows.map(x=>`<div style="padding:9px 0;border-bottom:1px solid var(--border-color,#ddd)"><b>${esc(x.month)}</b><div style="display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center;margin-top:5px"><span>فروش</span><div style="height:9px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${Math.max(0,Math.min(100,x.salesRial/trendMax*100))}%;background:#2878bd"></div></div><small>${money(x.salesRial)}</small><span>سود ناخالص</span><div style="height:9px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${Math.max(0,Math.min(100,x.grossProfitRial/trendMax*100))}%;background:#26945e"></div></div><small>${money(x.grossProfitRial)}</small><span>هزینه گروه ۶</span><div style="height:9px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${Math.max(0,Math.min(100,x.expensesRial/trendMax*100))}%;background:#c58a27"></div></div><small>${money(x.expensesRial)}</small></div><p class="hint" style="margin:4px 0 0">سود پس از هزینه ثبت‌شده: ${money(x.adjustedProfitRial)}</p></div>`).join('')||'<p class="hint">برای نمایش روند، فاکتور فروش قطعی یا سند هزینه تاریخ‌دار در بازه انتخاب‌شده لازم است.</p>';
  const periodComparisonRows=periodRows.map(x=>`<tr><td>${esc(x.periodTitle)}</td><td>${esc(x.startDate)} تا ${esc(x.endDate)}</td><td>${money(x.salesRial)}</td><td>${money(x.costedSalesRial)}</td><td>${money(x.cogsRial)}</td><td>${money(x.grossProfitRial)}</td><td>${money(x.postedExpensesRial)}</td><td>${money(x.adjustedProfitRial)}</td><td>${fa(Math.round(x.marginPercent*10)/10)}٪</td><td>${money(x.uncostedRevenueRial)}</td></tr>`).join('')||'<tr><td colspan="10">سال مالی تعریف‌شده‌ای برای مقایسه وجود ندارد.</td></tr>';

  const productRows=d.products.slice(0,50).map(x=>`<tr><td>${esc(x.name)}</td><td>${fa(x.quantityMilli/1000)}</td><td>${money(x.revenueRial)}</td><td>${money(x.costRial)}</td><td>${money(x.grossProfitRial)}</td><td>${fa(Math.round(x.marginPercent*10)/10)}٪</td></tr>`).join('')||'<tr><td colspan="6">برای محاسبه، فروش قطعی دارای بهای تمام‌شده ثبت‌شده لازم است.</td></tr>';
  const customerRows=d.customers.slice(0,50).map(x=>`<tr><td>${esc(x.name)}</td><td>${money(x.revenueRial)}</td><td>${money(x.costRial)}</td><td>${money(x.grossProfitRial)}</td><td>${fa(Math.round(x.marginPercent*10)/10)}٪</td></tr>`).join('')||'<tr><td colspan="5">اطلاعات سودآوری قابل محاسبه وجود ندارد.</td></tr>';
  const expenseRows=adjusted.expenseAccounts.map(x=>`<tr><td>${esc(x.code)}</td><td>${esc(x.title)}</td><td>${money(x.amountRial)}</td></tr>`).join('')||'<tr><td colspan="3">هزینه قطعی در حساب‌های گروه ۶ ثبت نشده است.</td></tr>';
  const adjustedProductRows=adjusted.products.slice(0,50).map(x=>`<tr><td>${esc(x.name)}</td><td>${money(x.revenueRial)}</td><td>${money(x.allocatedExpenseRial)}</td><td>${money(x.adjustedProfitRial)}</td><td>${fa(Math.round(x.adjustedMarginPercent*10)/10)}٪</td></tr>`).join('')||'<tr><td colspan="5">داده کافی برای تخصیص هزینه وجود ندارد.</td></tr>';
  const adjustedCustomerRows=adjusted.customers.slice(0,50).map(x=>`<tr><td>${esc(x.name)}</td><td>${money(x.revenueRial)}</td><td>${money(x.allocatedExpenseRial)}</td><td>${money(x.adjustedProfitRial)}</td><td>${fa(Math.round(x.adjustedMarginPercent*10)/10)}٪</td></tr>`).join('')||'<tr><td colspan="5">داده کافی برای تخصیص هزینه وجود ندارد.</td></tr>';
  return `<div class="card" style="margin-top:12px"><h3>تحلیل سود ناخالص کالا و مشتری</h3><div class="form-grid" style="margin:10px 0"><label class="field">سال مالی<select id="profitabilityPeriod"><option value="">همه سال‌های مالی</option>${(await getProfitabilityPeriodComparison()).map(x=>`<option value="${esc(x.periodId)}" ${profitabilityFilter.fiscalPeriodId===x.periodId?'selected':''}>${esc(x.periodTitle)}</option>`).join('')}</select></label><label class="field">از تاریخ شمسی<input id="profitabilityFrom" placeholder="1405/01/01" value="${esc(profitabilityFilter.fromDate||'')}"></label><label class="field">تا تاریخ شمسی<input id="profitabilityTo" placeholder="1405/12/29" value="${esc(profitabilityFilter.toDate||'')}"></label><button class="btn btn-primary" id="profitabilityApplyFilter" type="button">اعمال فیلتر</button><button class="btn btn-secondary" id="profitabilityClearFilter" type="button">پاک‌کردن فیلتر</button><button class="btn btn-secondary" id="profitabilityExportXlsx" type="button">خروجی Excel همین بازه</button><button class="btn btn-secondary" id="profitabilityPrintPdf" type="button">چاپ / PDF همین بازه</button></div><p class="hint">گزارش فقط‌خواندنی بر اساس فاکتورهای فروش قطعی و گردش بهای تمام‌شده انبار؛ هزینه‌های عملیاتی، مالیات و هزینه‌های سربار در سود خالص لحاظ نشده‌اند.</p><div class="form-grid"><div class="stat-card"><b>${money(d.salesRial)}</b><span>کل فروش قطعی</span></div><div class="stat-card"><b>${money(d.costedSalesRial)}</b><span>فروش دارای بهای معتبر</span></div><div class="stat-card"><b>${money(d.cogsRial)}</b><span>بهای تمام‌شده کالای فروش‌رفته</span></div><div class="stat-card"><b>${money(d.grossProfitRial)}</b><span>سود ناخالص قابل محاسبه</span></div><div class="stat-card"><b>${fa(Math.round(d.marginPercent*10)/10)}٪</b><span>حاشیه سود ناخالص</span></div></div><p class="hint">فروش فاقد بهای قابل اتکا: ${money(d.uncostedRevenueRial)} · فروش با بهای موقت ناشی از کسری موجودی: ${money(d.provisionalRevenueRial)}. این مبالغ از محاسبه سود کنار گذاشته شده‌اند.</p><h4>روند ماهانه فروش، سود و هزینه‌ها</h4><p class="hint">طول میله‌ها نسبت به بیشترین مقدار همین نمودار مقیاس شده است؛ سود پس از هزینه، شاخص مدیریتی است و سود خالص رسمی محسوب نمی‌شود.</p><div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-bottom:8px"><span>■ فروش</span><span>■ سود ناخالص</span><span>■ هزینه گروه ۶</span></div><div>${trendBars}</div><h4>سودآوری کالاها</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>کالا</th><th>مقدار</th><th>فروش</th><th>بهای تمام‌شده</th><th>سود ناخالص</th><th>حاشیه</th></tr></thead><tbody>${productRows}</tbody></table></div><h4>سودآوری مشتریان</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>مشتری</th><th>فروش</th><th>بهای تمام‌شده</th><th>سود ناخالص</th><th>حاشیه</th></tr></thead><tbody>${customerRows}</tbody></table></div><p class="hint">فاکتورهای پیش‌نویس، ردیف‌های خدماتی بدون بهای انبار، و فروش‌های دارای بهای موقت در سود محاسبه نمی‌شوند.</p><hr><h3>تخصیص تحلیلی هزینه‌ها و سود تعدیل‌شده</h3><p class="hint">هزینه‌های ثبت‌شده در اسناد قطعی حساب‌های گروه ۶، به نسبت فروش دارای بهای معتبر بین کالاها و مشتریان سرشکن شده‌اند. این تخصیص صرفاً گزارشی است و هیچ سند حسابداری یا گردش مالی را تغییر نمی‌دهد.</p><div class="form-grid"><div class="stat-card"><b>${money(adjusted.totalPostedExpensesRial)}</b><span>خالص هزینه ثبت‌شده در حساب‌های گروه ۶</span></div><div class="stat-card"><b>${money(adjusted.allocatedExpensesRial)}</b><span>هزینه تخصیص‌یافته به فروش‌های بهای‌دار</span></div><div class="stat-card"><b>${money(adjusted.unallocatedExpensesRial)}</b><span>هزینه تخصیص‌نیافته</span></div><div class="stat-card"><b>${money(adjusted.adjustedProfitRial)}</b><span>سود پس از کسر هزینه تخصیص‌یافته</span></div><div class="stat-card"><b>${fa(Math.round(adjusted.adjustedMarginPercent*10)/10)}٪</b><span>حاشیه پس از تخصیص هزینه</span></div></div><h4>ترکیب هزینه‌های ثبت‌شده</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>کد حساب</th><th>عنوان حساب</th><th>خالص هزینه</th></tr></thead><tbody>${expenseRows}</tbody></table></div><h4>سود تعدیل‌شده کالاها</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>کالا</th><th>فروش معتبر</th><th>هزینه تخصیصی</th><th>سود تعدیل‌شده</th><th>حاشیه</th></tr></thead><tbody>${adjustedProductRows}</tbody></table></div><h4>سود تعدیل‌شده مشتریان</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>مشتری</th><th>فروش معتبر</th><th>هزینه تخصیصی</th><th>سود تعدیل‌شده</th><th>حاشیه</th></tr></thead><tbody>${adjustedCustomerRows}</tbody></table></div><p class="hint">مهم: این عدد «سود خالص رسمی» نیست؛ هزینه‌های گروه ۶ ممکن است مربوط به دوره‌های متفاوت یا درآمدهای خارج از فروش انبار باشند. تخصیص بر اساس نسبت فروش انجام شده و برای گزارش مدیریتی است. برای صورت سود و زیان رسمی، گزارش حسابداری با فیلتر سال مالی و تاریخ مبنا قرار گیرد.</p><hr><h3>مقایسه نموداری سال‌های مالی</h3><div>${periodRows.map(x=>{const max=Math.max(1,...periodRows.map(y=>Math.max(y.salesRial,y.grossProfitRial,y.postedExpensesRial)));return `<div style="padding:7px 0"><b>${esc(x.periodTitle)}</b><div style="display:grid;grid-template-columns:80px 1fr auto;gap:7px;align-items:center"><span>فروش</span><div style="height:8px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${x.salesRial/max*100}%;background:#2878bd"></div></div><small>${money(x.salesRial)}</small><span>سود ناخالص</span><div style="height:8px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${Math.max(0,x.grossProfitRial)/max*100}%;background:#26945e"></div></div><small>${money(x.grossProfitRial)}</small><span>هزینه</span><div style="height:8px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${Math.max(0,x.postedExpensesRial)/max*100}%;background:#c58a27"></div></div><small>${money(x.postedExpensesRial)}</small></div></div>`}).join('')||'<p class="hint">دوره مالی برای نمودار وجود ندارد.</p>'}</div><h3>مقایسه عملکرد سال‌های مالی</h3><p class="hint">هر ردیف فقط شامل فاکتورهای فروش و اسناد هزینه قطعی همان سال مالی است. فروش فاقد بهای معتبر جداگانه نمایش داده می‌شود و از سود ناخالص کنار گذاشته شده است.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>سال مالی</th><th>بازه شمسی</th><th>فروش</th><th>فروش بهای‌دار</th><th>بهای تمام‌شده</th><th>سود ناخالص</th><th>هزینه گروه ۶</th><th>سود تعدیل‌شده</th><th>حاشیه ناخالص</th><th>فروش بی‌بها/موقت</th></tr></thead><tbody>${periodComparisonRows}</tbody></table></div><p class="hint">سود تعدیل‌شده این جدول یک شاخص مدیریتی است، نه سود خالص رسمی؛ تخصیص هزینه‌ها همچنان بر مبنای نسبت فروش دارای بهای معتبر انجام می‌شود.</p></div>`;
}

async function managementDashboardPanel():Promise<string>{
  const parts=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const today=`${parts.find(x=>x.type==='year')?.value}/${parts.find(x=>x.type==='month')?.value}/${parts.find(x=>x.type==='day')?.value}`;
  const periods=await getProfitabilityPeriodComparison();
  const selectedPeriod=periods.find(x=>x.periodId===managementFilter.fiscalPeriodId);
  const from=managementFilter.fromDate||selectedPeriod?.startDate||'';
  const to=managementFilter.toDate||selectedPeriod?.endDate||'';
  const anchor=to||today;
  const filter:ProfitabilityFilter={...managementFilter};
  const [aging,cashflow,profitability,banks,monthlyTrend]=await Promise.all([getAgingDashboard(anchor),getCashflowDashboard(anchor),getProfitabilityDashboard(filter),getBankAccountBalances(),getMonthlyProfitabilityTrend(filter)]);
  const normalize=(v:string)=>digits(String(v||'')).replace(/-/g,'/').slice(0,10);
  const inRange=(v:string)=>{const d=normalize(v);return (!from||d>=normalize(from))&&(!to||d<=normalize(to));};
  const postedSales=(commerce!.invoices||[]).filter(i=>i.status==='posted'&&i.type==='sale'&&inRange(i.date));
  const monthSales=postedSales.reduce((sum,i)=>sum+i.grossRial,0);
  const lowStock=products.filter(p=>Number.isFinite(Number(p.minQty))&&p.minQty!==null&&p.minQty!==undefined&&p.systemQty<=Number(p.minQty));
  const stockValueQty=products.reduce((sum,p)=>sum+Math.max(0,Number(p.systemQty)||0),0);
  const bankBalance=banks.reduce((sum,a)=>sum+a.balanceRial,0);
  const net30=cashflow.next30InRial-cashflow.next30OutRial;
  const alerts=[
    aging.overdueReceivableRial>0?`مطالبات سررسیدگذشته: ${money(aging.overdueReceivableRial)}`:'مطالبه سررسیدگذشته‌ای شناسایی نشد',
    lowStock.length?`${fa(lowStock.length)} قلم کالا در حداقل موجودی یا پایین‌تر قرار دارد`:'کالای زیر حداقل موجودی ثبت نشده است',
    aging.overdueCheques.length?`${fa(aging.overdueCheques.length)} چک در جریان سررسیدگذشته دارد`:'چک سررسیدگذشته‌ای شناسایی نشد'
  ];
  const selectedLabel=managementFilter.fiscalPeriodId?(selectedPeriod?.periodTitle||'سال مالی انتخاب‌شده'):'همه سال‌های مالی';
  const monthKey=(value:string)=>digits(String(value||'')).replace(/[^0-9]/g,'').slice(0,6);
  const monthly=new Map(monthlyTrend.map(x=>[x.month,{...x,receiptsRial:0,paymentsRial:0,receivableRial:0}]));
  for(const tx of commerce!.cashTransactions){
    if(!inRange(tx.date)||tx.chequeStatus==='bounced'||tx.chequeStatus==='void'||(tx.method==='cheque'&&tx.chequeStatus!=='cleared'))continue;
    const key=monthKey(tx.date);if(key.length!==6)continue;const month=`${key.slice(0,4)}/${key.slice(4,6)}`;
    const row=monthly.get(month)||{month,salesRial:0,grossProfitRial:0,expensesRial:0,adjustedProfitRial:0,receiptsRial:0,paymentsRial:0,receivableRial:0};
    if(tx.type==='receipt')row.receiptsRial+=tx.amountRial;else row.paymentsRial+=tx.amountRial;monthly.set(month,row);
  }
  for(const invoice of commerce!.invoices){
    if(invoice.status!=='posted'||invoice.type!=='sale'||!inRange(invoice.date))continue;
    const key=monthKey(invoice.date);if(key.length!==6)continue;const month=`${key.slice(0,4)}/${key.slice(4,6)}`;
    const row=monthly.get(month)||{month,salesRial:0,grossProfitRial:0,expensesRial:0,adjustedProfitRial:0,receiptsRial:0,paymentsRial:0,receivableRial:0};
    row.receivableRial+=invoiceOutstanding(invoice.id,commerce!);monthly.set(month,row);
  }
  const trendRows=[...monthly.values()].sort((a,b)=>a.month.localeCompare(b.month)).slice(-18);
  const trendMax=Math.max(1,...trendRows.flatMap(x=>[x.salesRial,x.grossProfitRial,x.expensesRial,x.receiptsRial,x.paymentsRial,x.receivableRial]));
  const accountingData=await loadAccountingData();
  const monthOf=(value:string)=>monthKey(value).slice(0,6);
  const monthDetails=(month:string)=>{
    const invoices=commerce!.invoices.filter(i=>i.status==='posted'&&i.type==='sale'&&monthOf(i.date)===month.replace('/','')&&inRange(i.date));
    const transactions=commerce!.cashTransactions.filter(t=>monthOf(t.date)===month.replace('/','')&&inRange(t.date)&&t.chequeStatus!=='bounced'&&t.chequeStatus!=='void'&&(t.method!=='cheque'||t.chequeStatus==='cleared'));
    const expenses=accountingData.journalEntries.filter(j=>j.status==='posted'&&monthOf(j.date)===month.replace('/','')&&inRange(j.date)).flatMap(j=>j.lines.map(line=>{const account=accountingData.accounts.find(a=>a.id===line.accountId);const code=line.accountCodeSnapshot||account?.code||'';const amount=Number(line.debitRial||0)-Number(line.creditRial||0);return code.startsWith('6')&&amount!==0?{number:j.number,date:j.date,description:line.description||j.description,account:line.accountTitleSnapshot||account?.title||code,amount}:null}).filter((x):x is {number:string;date:string;description:string;account:string;amount:number}=>!!x));
    const invoiceRows=invoices.map(i=>{const party=commerce!.parties.find(p=>p.id===i.partyId);return `<tr><td>${esc(i.number)}</td><td>${esc(i.date)}</td><td>${esc(party?.name||'—')}</td><td>${money(i.grossRial)}</td></tr>`}).join('')||'<tr><td colspan="4">فاکتور فروش قطعی ندارد.</td></tr>';
    const cashRows=transactions.map(t=>{const party=commerce!.parties.find(p=>p.id===t.partyId);return `<tr><td>${t.type==='receipt'?'دریافت':'پرداخت'}</td><td>${esc(t.number)}</td><td>${esc(t.date)}</td><td>${esc(party?.name||'—')}</td><td>${money(t.amountRial)}</td></tr>`}).join('')||'<tr><td colspan="5">دریافت یا پرداخت قطعی ندارد.</td></tr>';
    const expenseRows=expenses.map(x=>`<tr><td>${esc(x.number)}</td><td>${esc(x.date)}</td><td>${esc(x.account)}</td><td>${esc(x.description)}</td><td>${money(x.amount)}</td></tr>`).join('')||'<tr><td colspan="5">هزینه ثبت‌شده در حساب‌های گروه ۶ ندارد.</td></tr>';
    return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button type="button" class="btn btn-sm btn-secondary" data-management-month-xlsx="${esc(month)}" data-management-month-from="${esc(from)}" data-management-month-to="${esc(to)}">خروجی Excel این ماه</button><button type="button" class="btn btn-sm btn-secondary" data-management-month-pdf="${esc(month)}" data-management-month-from="${esc(from)}" data-management-month-to="${esc(to)}">چاپ / PDF این ماه</button></div><div class="table-wrap"><h5>فاکتورهای فروش قطعی</h5><table class="data-table"><thead><tr><th>شماره</th><th>تاریخ</th><th>مشتری</th><th>مبلغ</th></tr></thead><tbody>${invoiceRows}</tbody></table></div><div class="table-wrap"><h5>دریافت‌ها و پرداخت‌های قطعی</h5><table class="data-table"><thead><tr><th>نوع</th><th>شماره</th><th>تاریخ</th><th>طرف حساب</th><th>مبلغ</th></tr></thead><tbody>${cashRows}</tbody></table></div><div class="table-wrap"><h5>ریز هزینه‌های قطعی گروه ۶</h5><table class="data-table"><thead><tr><th>سند</th><th>تاریخ</th><th>حساب</th><th>شرح</th><th>خالص هزینه</th></tr></thead><tbody>${expenseRows}</tbody></table></div>`;
  };
  const comparisonMetrics=[['فروش قطعی','salesRial'],['سود ناخالص','grossProfitRial'],['هزینه ثبت‌شده گروه ۶','expensesRial'],['دریافت قطعی','receiptsRial'],['پرداخت قطعی','paymentsRial'],['مانده فعلی مطالبات','receivableRial']] as const;
  const initialCurrent=trendRows[trendRows.length-1]?.month||'';
  const initialPrevious=trendRows[trendRows.length-2]?.month||initialCurrent;
  const comparisonMonthOptions=trendRows.map(x=>`<option value="${esc(x.month)}" ${x.month===initialPrevious?'data-first-default="1"':''} ${x.month===initialCurrent?'data-second-default="1"':''}>${esc(x.month)}</option>`).join('');
  const comparisonHtml=(first:string,second:string)=>{const a=trendRows.find(x=>x.month===first),b=trendRows.find(x=>x.month===second);if(!a||!b)return '<p class="hint">برای مقایسه، دست‌کم یک ماه دارای داده لازم است.</p>';const rows=comparisonMetrics.map(([label,key])=>{const av=Number(a[key]||0),bv=Number(b[key]||0),delta=bv-av,pct=av===0?null:delta/Math.abs(av)*100;return `<tr><td>${label}</td><td>${money(av)}</td><td>${money(bv)}</td><td>${delta>0?'+':''}${money(delta)}</td><td>${pct===null?'—':`${pct>0?'+':''}${pct.toFixed(1)}٪`}</td></tr>`}).join('');return `<div class="table-wrap"><table class="data-table"><thead><tr><th>شاخص</th><th>${esc(first)}</th><th>${esc(second)}</th><th>اختلاف (ماه دوم − اول)</th><th>تغییر درصدی</th></tr></thead><tbody>${rows}</tbody></table></div><p class="hint">درصد تغییر نسبت به ماه اول محاسبه می‌شود؛ اگر مقدار ماه اول صفر باشد، درصد تغییر قابل محاسبه نیست.</p>`};
  const anomalyHtml=(threshold:number)=>{const alerts=detectManagementMonthAnomalies(trendRows,threshold);if(!alerts.length)return '<p class="hint">در آستانه انتخابی، تغییر غیرعادی معناداری در ماه‌های دارای داده پیدا نشد. تغییرات با مبنای صفر برای جلوگیری از درصد گمراه‌کننده نادیده گرفته می‌شوند.</p>';return `<div class="table-wrap"><table class="data-table"><thead><tr><th>وضعیت</th><th>شاخص</th><th>بازه مقایسه</th><th>مقدار قبلی</th><th>مقدار جدید</th><th>تغییر</th></tr></thead><tbody>${alerts.map(a=>`<tr><td>${a.severity==='warning'?'نیازمند بررسی':'بهبود'}</td><td>${a.label}</td><td>${esc(a.previousMonth)} ← ${esc(a.month)}</td><td>${money(a.previousValue)}</td><td>${money(a.currentValue)}</td><td>${a.percentChange>0?'+':''}${a.percentChange.toFixed(1)}٪</td></tr>`).join('')}</tbody></table></div><p class="hint">هشدارها تحلیلی‌اند؛ کاهش فروش/سود/دریافت و افزایش هزینه/پرداخت/مطالبات به‌عنوان وضعیت نیازمند بررسی علامت‌گذاری می‌شود.</p>`;};
  const trendHtml=trendRows.length?trendRows.map(x=>{const bar=(label:string,value:number,color:string)=>`<div style="display:grid;grid-template-columns:92px minmax(50px,1fr) auto;gap:7px;align-items:center;margin:4px 0"><small>${label}</small><div style="height:9px;background:var(--border-color,#ddd);border-radius:8px;overflow:hidden"><div style="height:100%;width:${Math.max(0,Math.min(100,value/trendMax*100))}%;background:${color}"></div></div><small>${money(value)}</small></div>`;return `<div style="padding:9px 0;border-bottom:1px solid var(--border-color,#ddd)"><button type="button" class="btn btn-secondary btn-sm" data-management-month="${esc(x.month)}" aria-expanded="false">مشاهده جزئیات ${esc(x.month)}</button>${bar('فروش',x.salesRial,'#2878bd')}${bar('سود ناخالص',x.grossProfitRial,'#26945e')}${bar('هزینه ثبت‌شده',x.expensesRial,'#c58a27')}${bar('دریافت قطعی',x.receiptsRial,'#168a83')}${bar('پرداخت قطعی',x.paymentsRial,'#b85b5b')}${bar('مانده فعلی مطالبات',x.receivableRial,'#8064a2')}<div id="managementMonthDetail_${x.month.replace('/','')}" hidden style="margin-top:10px;padding:10px;background:var(--surface-color,#f7f7f7);border-radius:8px">${monthDetails(x.month)}</div></div>`}).join(''):'<p class="hint">برای بازه انتخابی داده ماهانه‌ای جهت نمودار وجود ندارد.</p>';
  (window as any).__anbarinManagementCompareRows=trendRows;
  return `<section class="card" style="margin-top:12px;border-inline-start:4px solid var(--primary-color,#2878bd)"><h2 style="margin-top:0">داشبورد مدیریتی یکپارچه</h2><p class="hint">نمای کلی عملیات بر اساس داده‌های ثبت‌شده · تاریخ مبنا: ${esc(anchor)} · مبالغ به ${currency==='toman'?'تومان':'ریال'}</p>
  <div class="form-grid" style="margin:10px 0"><label class="field">سال مالی داشبورد<select id="managementPeriod"><option value="">همه سال‌های مالی</option>${periods.map(x=>`<option value="${esc(x.periodId)}" ${managementFilter.fiscalPeriodId===x.periodId?'selected':''}>${esc(x.periodTitle)}</option>`).join('')}</select></label><label class="field">از تاریخ شمسی<input id="managementFrom" placeholder="1405/01/01" value="${esc(managementFilter.fromDate||'')}"></label><label class="field">تا تاریخ شمسی<input id="managementTo" placeholder="1405/12/29" value="${esc(managementFilter.toDate||'')}"></label><button class="btn btn-primary" id="managementApplyFilter" type="button">اعمال فیلتر داشبورد</button><button class="btn btn-secondary" id="managementClearFilter" type="button">نمایش همه دوره‌ها</button><button class="btn btn-secondary" id="managementExportXlsx" type="button">خروجی Excel داشبورد</button><button class="btn btn-secondary" id="managementPrintPdf" type="button">چاپ / PDF داشبورد</button></div>
  <p class="hint">فیلتر فعال: ${esc(selectedLabel)}${from||to?` · بازه ${esc(from||'ابتدا')} تا ${esc(to||'امروز')}`:''}. شاخص‌های موجودی و مانده بانک/صندوق، وضعیت فعلی هستند و به بازه تاریخی محدود نمی‌شوند.</p>
  <div class="form-grid">
  <div class="stat-card"><b>${money(monthSales)}</b><span>فروش قطعی در بازه انتخابی</span></div>
  <div class="stat-card"><b>${money(profitability.grossProfitRial)}</b><span>سود ناخالص قابل محاسبه در بازه</span></div>
  <div class="stat-card"><b>${money(aging.receivableRial)}</b><span>مطالبات باز تا تاریخ مبنا</span></div>
  <div class="stat-card"><b>${money(aging.payableRial)}</b><span>بدهی‌های باز تا تاریخ مبنا</span></div>
  <div class="stat-card"><b>${money(bankBalance)}</b><span>مانده دفتری فعلی بانک و صندوق</span></div>
  <div class="stat-card"><b>${money(net30)}</b><span>خالص جریان نقد پیش‌بینی‌شده ۳۰ روز از تاریخ مبنا</span></div>
  <div class="stat-card"><b>${fa(products.length)}</b><span>تعداد اقلام کالا</span></div>
  <div class="stat-card"><b>${fa(lowStock.length)}</b><span>کالاهای در حداقل موجودی</span></div>
  <div class="stat-card"><b>${fa(stockValueQty)}</b><span>جمع تعداد موجودی ثبت‌شده</span></div>
  <div class="stat-card"><b>${fa(postedSales.length)}</b><span>فاکتورهای فروش قطعی در بازه</span></div>
  </div><h3>هشدار تغییرات غیرعادی ماهانه</h3><p class="hint">تغییر شاخص‌ها بین ماه‌های متوالیِ دارای داده بررسی می‌شود. این بخش فقط هشدار مدیریتی می‌دهد و هیچ داده‌ای را تغییر نمی‌دهد.</p><div class="form-grid" style="margin:8px 0"><label class="field">حد آستانه تغییر<select id="managementAnomalyThreshold"><option value="10">۱۰٪</option><option value="20" selected>۲۰٪</option><option value="30">۳۰٪</option><option value="50">۵۰٪</option></select></label></div><div id="managementAnomalyAlerts">${anomalyHtml(20)}</div><h3>مقایسه عملکرد دو ماه</h3><p class="hint">دو ماه را از داده‌های همین بازه و سال مالی انتخاب کنید؛ اختلاف مبلغ و درصد تغییر شاخص‌ها نمایش داده می‌شود.</p><div class="form-grid" style="margin:8px 0"><label class="field">ماه اول (مبنای مقایسه)<select id="managementCompareFirst">${comparisonMonthOptions.replace('data-first-default="1"','selected')}</select></label><label class="field">ماه دوم<select id="managementCompareSecond">${comparisonMonthOptions.replace('data-second-default="1"','selected')}</select></label></div><div id="managementMonthComparison">${comparisonHtml(initialPrevious,initialCurrent)}</div><h3>روند ماهانه شاخص‌های مدیریتی</h3><p class="hint">برای بازکردن جزئیات هر ماه، دکمه «مشاهده جزئیات» را انتخاب کنید. اطلاعات شامل فاکتورهای فروش، دریافت‌ها، پرداخت‌ها و ریز هزینه‌های ثبت‌شده است.</p><div>${trendHtml}</div><p class="hint">توجه: مانده مطالبات در این نمودار، مانده فعلی فاکتورهای فروش است که بر اساس ماه صدور فاکتور دسته‌بندی شده؛ این عدد مانده تاریخی پایان هر ماه نیست. دریافت/پرداخت چکی تا زمان وصول یا تسویه قطعی در جریان نقد واقعی لحاظ نمی‌شود. برای پیش‌بینی، شاخص خالص جریان نقد ۳۰ روزه در بالای داشبورد نمایش داده شده است.</p><h4>هشدارها و موارد نیازمند پیگیری</h4><ul>${alerts.map(x=>`<li style="margin:6px 0">${esc(x)}</li>`).join('')}</ul><p class="hint">تعاریف: فروش و سود بر اساس فیلتر تاریخ/سال مالی؛ مطالبات و بدهی‌ها تا تاریخ مبنا؛ جریان نقد ۳۰ روز از تاریخ مبنا پیش‌بینی می‌شود. مانده بانک و صندوق و موجودی کالا وضعیت فعلی هستند، نه مانده تاریخی. سود ناخالص فقط از فروش دارای بهای معتبر محاسبه می‌شود.</p></section>`;
}

async function inventoryReconciliationPanel():Promise<string>{
  const [costing,accounting]=await Promise.all([loadInventoryCostData(),loadAccountingData()]);
  const report=buildInventoryReconciliation(products,costing,accounting);
  const issueLabel=(issue:string|null)=>issue==='quantity-mismatch'?'اختلاف تعداد':issue==='value-missing'?'بدون ارزش معتبر':issue==='negative-balance'?'موجودی منفی':issue==='orphan-cost-balance'?'کالای حذف‌شده در فهرست':'بدون مغایرت';
  const rows=report.rows.slice(0,300).map(r=>`<tr><td>${esc(r.productName)}</td><td>${esc(r.warehouse)}</td><td>${fa(r.systemQtyMilli/1000)}</td><td>${fa(r.costQtyMilli/1000)}</td><td>${fa(r.quantityDiffMilli/1000)}</td><td>${money(r.valueRial)}</td><td>${issueLabel(r.issue)}</td></tr>`).join('')||'<tr><td colspan="7">کالایی برای تطبیق وجود ندارد.</td></tr>';
  return `<div class="card" style="margin-top:12px"><h3>تطبیق موجودی انبار و حسابداری</h3><p class="hint">این گزارش فقط‌خواندنی است؛ موجودی عملیاتی، دفتر بهای تمام‌شده و حساب معین موجودی کالا را مقایسه می‌کند. هیچ مقدار، سند یا مانده‌ای به‌صورت خودکار اصلاح نمی‌شود.</p><div class="form-grid"><div class="stat-card"><b>${fa(report.totalProducts)}</b><span>ردیف کالا / انبار</span></div><div class="stat-card"><b>${fa(report.issueCount)}</b><span>ردیف نیازمند بررسی</span></div><div class="stat-card"><b>${fa(report.systemQuantityMilli/1000)}</b><span>جمع تعداد عملیاتی</span></div><div class="stat-card"><b>${fa(report.costQuantityMilli/1000)}</b><span>جمع تعداد بهای تمام‌شده</span></div><div class="stat-card"><b>${money(report.inventoryValueRial)}</b><span>ارزش دفتر بهای تمام‌شده</span></div><div class="stat-card"><b>${money(report.ledgerInventoryRial)}</b><span>مانده حساب موجودی در دفتر کل</span></div></div><p class="hint">اختلاف تعداد: ${fa(report.quantityDiffMilli/1000)} · اختلاف ارزش (بهای تمام‌شده منهای دفتر کل): ${money(report.ledgerDiffRial)} · ${report.ledgerAccountFound?'حساب دفتر کل: '+esc(report.ledgerAccountTitle):'حساب معین موجودی کالا پیدا نشد.'}</p><div class="table-wrap"><table class="data-table"><thead><tr><th>کالا</th><th>انبار</th><th>تعداد عملیاتی</th><th>تعداد بهای تمام‌شده</th><th>اختلاف</th><th>ارزش موجودی</th><th>وضعیت</th></tr></thead><tbody>${rows}</tbody></table></div><p class="hint">توجه: مقایسه دفتر کل با ارزش فعلی بهای تمام‌شده، فقط زمانی قابل اتکاست که ثبت‌های موجودی از ابتدای دوره به‌طور کامل در هر دو زیرسیستم انجام شده باشند. اسناد دستی، موجودی افتتاحیه قدیمی، حذف کالا و گردش‌های خارج از فاکتور می‌توانند اختلاف ایجاد کنند. برای بررسی کامل، ردیف‌های مغایر و اسناد مبدأ را کنترل کنید.</p></div>`;
}


async function openCommercePanelSheet(section:CommercePanelSection):Promise<void> {
  const titles:Record<CommercePanelSection,string>={
    sale:'فاکتور فروش',
    purchase:'فاکتور خرید',
    receipts:'دریافت / پرداخت',
    cheques:'چک‌ها',
    aging:'سررسید',
    banking:'بانک',
    management:'سودآوری',
    inventory:'انبار',
    parties:'طرف حساب‌ها',
    operating:'هزینه و درآمد',
  };
  // بستن برگه‌های تو در تو قبلی تا محتوا گیر نکند
  document.getElementById('invoiceItemsSheet')?.remove();
  document.getElementById('partyFormSheet')?.remove();
  document.getElementById('invoiceTypeSheet')?.remove();
  activeCommerceSection=section;
  if(section==='sale'||section==='purchase'){
    // اگر نوع فعلی با بخش هم‌خوان نیست، نوع پیش‌فرض همان بخش
    if(section==='sale'&&!isSaleInvoiceType(activeInvoiceType)) activeInvoiceType='sale';
    if(section==='purchase'&&!isPurchaseInvoiceType(activeInvoiceType)) activeInvoiceType='purchase';
  }
  if(section!=='sale'&&section!=='purchase') editingInvoiceId=null;
  suppressCommerceSheetReopen=true;
  await render();
  suppressCommerceSheetReopen=false;
  const root=el<HTMLDivElement>('#accountingCommerceWorkspace');
  const sectionKey=(section==='sale'||section==='purchase')?'invoices':section;
  const sectionEl=root?.querySelector<HTMLElement>(`[data-commerce-section="${sectionKey}"]`);
  if(!sectionEl){activeCommerceSection='home';toast('بخش موردنظر پیدا نشد.','error');return;}
  sectionEl.hidden=false;
  document.getElementById('commercePanelSheet')?.remove();
  const overlay=document.createElement('div');
  overlay.id='commercePanelSheet';
  overlay.className='accounting-module-sheet commerce-module-sheet';
  overlay.style.zIndex='10070';
  overlay.dir='rtl';
  overlay.innerHTML=`<div class="accounting-module-sheet-inner"><header class="accounting-module-sheet-head"><div><p class="accounting-module-sheet-kicker">بازرگانی</p><h2>${titles[section]||'بازرگانی'}</h2></div><button type="button" class="btn btn-secondary" id="commercePanelClose">بازگشت</button></header><div class="accounting-module-sheet-body" id="commercePanelMount"></div></div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('accounting-sheet-open');
  const mount=overlay.querySelector<HTMLElement>('#commercePanelMount')!;
  while(sectionEl.firstChild) mount.appendChild(sectionEl.firstChild);
  if(!mount.firstChild){
    mount.innerHTML=`<div class="card"><p class="hint">محتوای این بخش در دسترس نیست. بازگشت را بزنید و دوباره تلاش کنید.</p></div>`;
  }
  // اسکرول به بالای برگه تا فرم دیده شود
  overlay.scrollTop=0;
  mount.scrollIntoView({block:'start'});
  const close=()=>{
    document.getElementById('invoiceItemsSheet')?.remove();
    document.getElementById('partyFormSheet')?.remove();
    document.getElementById('invoiceTypeSheet')?.remove();
    // بازگرداندن گره‌ها تا render بعدی تمیز باشد
    while(mount.firstChild) sectionEl.appendChild(mount.firstChild);
    overlay.remove();
    if(!document.getElementById('accountingModuleSheet')){
      document.body.classList.remove('accounting-sheet-open');
    }
    editingInvoiceId=null;
    activeCommerceSection='home';
    suppressCommerceSheetReopen=true;
    void render().finally(()=>{suppressCommerceSheetReopen=false;});
  };
  overlay.querySelector('#commercePanelClose')?.addEventListener('click',close);
  // تقویم و جستجوی کالا پس از انتقال به برگه
  queueMicrotask(() => {
    const invDate = overlay.querySelector<HTMLInputElement>('#invoiceDate') || el<HTMLInputElement>('#invoiceDate');
    if (invDate) {
      const btn = overlay.querySelector<HTMLButtonElement>('#invoiceJalaliCalendar') || el<HTMLButtonElement>('#invoiceJalaliCalendar');
      const panel = overlay.querySelector<HTMLDivElement>('#invoiceJalaliCalendarPanel') || el<HTMLDivElement>('#invoiceJalaliCalendarPanel');
      if (btn) delete (btn as HTMLButtonElement).dataset.calBound;
      delete invDate.dataset.calendarEnhanced;
      attachJalaliCalendar(invDate, btn, panel);
    }
    enhanceDateFields(overlay);
  });

}

function openInvoiceTypeSheet():void {
 document.getElementById('invoiceTypeSheet')?.remove();
 const overlay=document.createElement('div');overlay.id='invoiceTypeSheet';overlay.dir='rtl';overlay.style.cssText='position:fixed;inset:0;z-index:10100;background:var(--surface,#fff);color:var(--text,#222);overflow:auto;padding:clamp(16px,4vw,32px)';
 overlay.innerHTML=`<div style="max-width:760px;margin:8vh auto"><div style="display:flex;justify-content:space-between;align-items:center"><h2>فاکتور</h2><button class="btn btn-secondary" id="invoiceTypeClose">بستن</button></div><div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-top:16px"><button class="btn btn-primary" data-new-invoice-type="sale">فروش</button><button class="btn btn-primary" data-new-invoice-type="purchase">خرید</button><button class="btn btn-secondary" data-new-invoice-type="return-sale">برگشت از فروش</button><button class="btn btn-secondary" data-new-invoice-type="return-purchase">برگشت از خرید</button><button class="btn btn-secondary" data-new-invoice-type="proforma">پیش‌فاکتور</button></div></div>`;
 document.body.appendChild(overlay);
 overlay.querySelector('#invoiceTypeClose')!.addEventListener('click',()=>overlay.remove());
 overlay.querySelectorAll<HTMLButtonElement>('[data-new-invoice-type]').forEach(b=>b.addEventListener('click',()=>{
  const type=b.dataset.newInvoiceType as InvoiceType;
  if(!['sale','purchase','return-sale','return-purchase','proforma'].includes(type))return;
  activeInvoiceType=type;
  overlay.remove();
  editingInvoiceId=null;
  openCommercePanelSheet(isSaleInvoiceType(type)?'sale':'purchase');
 }));
}
function bindInvoiceProductSearch(root:ParentNode=document):void {
  const scope = root instanceof Element ? root : document;
  const searchInput = scope.querySelector<HTMLInputElement>('#invoiceProductSearch') || el<HTMLInputElement>('#invoiceProductSearch');
  const addBtn = scope.querySelector<HTMLButtonElement>('#invoiceProductAdd') || el<HTMLButtonElement>('#invoiceProductAdd');
  const addLineBtn = scope.querySelector<HTMLButtonElement>('#invoiceAddLine') || el<HTMLButtonElement>('#invoiceAddLine');
  const scanBtn = scope.querySelector<HTMLButtonElement>('#invoiceScanOpen') || el<HTMLButtonElement>('#invoiceScanOpen');
  const suggestions = scope.querySelector<HTMLDivElement>('#invoiceProductSuggestions') || el<HTMLDivElement>('#invoiceProductSuggestions');
  if (!searchInput) return;

  // جلوگیری از دوباره‌اتصال با پرچم
  if (searchInput.dataset.searchBound === '1') {
    // فقط اگر قبلاً به همین نود وصل شده، رد شو — بعد از انتقال DOM پرچم را پاک می‌کنیم
  }
  searchInput.dataset.searchBound = '1';

  let suggestionIndex = 0;

  const hideSuggestions = () => {
    const box = scope.querySelector<HTMLDivElement>('#invoiceProductSuggestions') || el<HTMLDivElement>('#invoiceProductSuggestions');
    if (box) { box.hidden = true; box.innerHTML = ''; }
  };

  const showSuggestions = (value: string) => {
    const host = scope.querySelector<HTMLDivElement>('#invoiceProductSuggestions') || el<HTMLDivElement>('#invoiceProductSuggestions');
    if (!host) return;
    const matches = invoiceProductMatches(value);
    if (!matches.length) {
      host.innerHTML = value.trim()
        ? `<button type="button" class="invoice-product-suggestion" data-invoice-product-create="1"><span><b>کالا پیدا نشد</b><small>برای تعریف «${esc(value.trim())}» کلیک کنید</small></span></button>`
        : '';
      host.hidden = !value.trim();
      host.querySelectorAll('[data-invoice-product-create]').forEach(b => b.addEventListener('click', () => {
        hideSuggestions();
        addBySearch();
      }));
      return;
    }
    host.innerHTML = matches.map((p, i) =>
      `<button type="button" class="invoice-product-suggestion ${i === suggestionIndex ? 'active' : ''}" role="option" data-invoice-product-choice="${esc(p.id)}">` +
      `<span><b>${esc(p.name)}</b><small>${esc(p.code || p.sku || 'بدون کد')} · ${esc(p.unit || 'عدد')}</small></span>` +
      `<span class="suggestion-stock">موجودی ${fa(Number(p.systemQty) || 0)}</span></button>`
    ).join('');
    host.hidden = false;
    host.querySelectorAll<HTMLButtonElement>('[data-invoice-product-choice]').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = b.dataset.invoiceProductChoice;
        if (id) {
          addProductToInvoice(id, true);
          hideSuggestions();
          searchInput.value = '';
          searchInput.focus({ preventScroll: true });
        }
      });
    });
  };

  const addBySearch = () => {
    const value = (searchInput.value || '').trim();
    if (!value) { toast('نام کالا یا بارکد را وارد کنید.', 'error'); return; }
    const byCode = findProductByCode(digits(value));
    const product = byCode || resolveInvoiceProduct(value);
    if (!product) {
      const looksLikeBarcode = /^[0-9۰-۹٠-٩\-\s]{4,}$/.test(value);
      offerAddProduct(value, {
        asName: !looksLikeBarcode,
        onSaved: (productId) => {
          addProductToInvoice(productId, true);
          searchInput.value = '';
          hideSuggestions();
          toast('کالا تعریف شد و به اقلام فاکتور اضافه شد.', 'success');
        },
      });
      return;
    }
    addProductToInvoice(product.id, true);
    searchInput.value = '';
    hideSuggestions();
    const status = scope.querySelector<HTMLElement>('#invoiceScanStatus') || el<HTMLElement>('#invoiceScanStatus');
    if (status) status.textContent = `✓ ${product.name} اضافه شد`;
  };

  // حذف لیسنر قبلی با clone فقط برای خود دکمه‌ها اگر لازم باشد — به‌جای آن onclick مستقیم
  searchInput.oninput = () => {
    suggestionIndex = 0;
    showSuggestions(searchInput.value);
  };
  searchInput.onkeydown = (event: KeyboardEvent) => {
    const matches = invoiceProductMatches(searchInput.value);
    if (event.key === 'ArrowDown' && matches.length) {
      event.preventDefault();
      suggestionIndex = Math.min(matches.length - 1, suggestionIndex + 1);
      showSuggestions(searchInput.value);
    } else if (event.key === 'ArrowUp' && matches.length) {
      event.preventDefault();
      suggestionIndex = Math.max(0, suggestionIndex - 1);
      showSuggestions(searchInput.value);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = matches[suggestionIndex] || resolveInvoiceProduct(searchInput.value);
      if (chosen) {
        addProductToInvoice(chosen.id, true);
        searchInput.value = '';
        hideSuggestions();
      } else {
        addBySearch();
      }
    } else if (event.key === 'Escape') {
      hideSuggestions();
    }
  };
  searchInput.onfocus = () => {
    if (searchInput.value.trim()) showSuggestions(searchInput.value);
  };

  if (addBtn) {
    addBtn.onclick = (ev) => {
      ev.preventDefault();
      addBySearch();
    };
  }
  if (addLineBtn) {
    addLineBtn.onclick = (ev) => {
      ev.preventDefault();
      addInvoiceLine();
    };
  }
  if (scanBtn) {
    scanBtn.onclick = () => {
      const continuous = el<HTMLInputElement>('#scannerContinuous');
      (window as any).__anbarinScannerContinuousBeforeInvoice = continuous?.checked ?? true;
      if (continuous) continuous.checked = true;
      (window as any).__anbarinInvoiceScanActive = true;
      openScanner({ title: 'اسکن پیوسته بارکد کالا برای فاکتور' });
    };
  }

  if (!products.length) {
    const status = scope.querySelector<HTMLElement>('#invoiceScanStatus') || el<HTMLElement>('#invoiceScanStatus');
    if (status) status.textContent = 'کالایی در سیستم نیست؛ ابتدا در بخش کالاها تعریف کنید یا نام جدید بزنید و افزودن کنید.';
  }
}

function openInvoiceItemsSheet():void {
  const panel=document.getElementById('commercePanelSheet');
  const scope:ParentNode=panel||document.getElementById('accountingCommerceWorkspace')||document;
  const placeholder=scope.querySelector<HTMLElement>('#invoiceItemsPlaceholder')
    ||document.querySelector<HTMLElement>('#invoiceItemsPlaceholder');
  if(!placeholder){toast('فرم فاکتور هنوز آماده نیست؛ یک‌بار از فاکتور خارج شوید و دوباره وارد شوید.','error');return;}
  document.getElementById('invoiceItemsSheet')?.remove();
  const overlay=document.createElement('div');
  overlay.id='invoiceItemsSheet'; overlay.dir='rtl';
  overlay.style.cssText='position:fixed;inset:0;z-index:10120;background:var(--surface,#fff);color:var(--text,#222);overflow:auto;padding:clamp(12px,3vw,28px)';
  overlay.innerHTML=`<div class="invoice-items-sheet-inner" style="max-width:1100px;margin:0 auto"><div class="invoice-items-sheet-head" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h2>اقلام فاکتور</h2><button type="button" class="btn btn-primary" id="invoiceItemsBack">تأیید اقلام و بازگشت به فاکتور</button></div><div id="invoiceItemsMount" style="margin-top:14px"></div></div>`;
  document.body.appendChild(overlay);
  const mount=overlay.querySelector<HTMLElement>('#invoiceItemsMount')!;
  const selectors=['.commerce-lines-head','.invoice-product-tools','#commerceInvoiceLines','#invoiceAddLine'];
  // گره‌های واقعی را منتقل می‌کنیم تا مقادیر و event handlerها از بین نروند.
  selectors.forEach(selector=>{
    const node=placeholder.querySelector<HTMLElement>(selector);
    if(node)mount.appendChild(node);
  });
  const search=mount.querySelector<HTMLInputElement>('#invoiceProductSearch');
  if(search)delete search.dataset.searchBound;
  const lines=mount.querySelector<HTMLElement>('#commerceInvoiceLines');
  if(lines&&!lines.querySelector('.commerce-line'))addInvoiceLine();
  bindInvoiceProductSearch(mount);
  if(search){search.placeholder='نام کالا یا بارکد را وارد کنید';search.focus({preventScroll:true});}

  let returned=false;
  const returnToInvoice=()=>{
    if(returned)return; returned=true;
    selectors.forEach(selector=>{
      const node=mount.querySelector<HTMLElement>(selector);
      if(node)placeholder.appendChild(node);
    });
    const restoredSearch=placeholder.querySelector<HTMLInputElement>('#invoiceProductSearch');
    if(restoredSearch)delete restoredSearch.dataset.searchBound;
    overlay.remove();
    updateInvoiceTotals();
    const count=placeholder.querySelectorAll('#commerceInvoiceLines .commerce-line').length;
    const summary=panel?.querySelector<HTMLElement>('#invoiceItemsSummary')
      ||document.querySelector<HTMLElement>('#invoiceItemsSummary');
    if(summary)summary.textContent=count?`${fa(count)} قلم ثبت‌شده`:'بدون قلم';
    panel?.querySelector<HTMLButtonElement>('#invoiceOpenItems')?.focus({preventScroll:true});
  };
  overlay.querySelector<HTMLButtonElement>('#invoiceItemsBack')!.onclick=returnToInvoice;
  overlay.addEventListener('keydown',event=>{if((event as KeyboardEvent).key==='Escape')returnToInvoice();});
}

async function render():Promise<void> {
  const root=el<HTMLDivElement>('#accountingCommerceWorkspace'); if(!root||!commerce)return;
  const reopenSheet: CommercePanelSection | null = activeCommerceSection!=='home' ? activeCommerceSection : null;
  // drop previous nested sheet so nodes are not duplicated
  document.getElementById('commercePanelSheet')?.remove();
  if(!document.getElementById('accountingModuleSheet')){
    document.body.classList.remove('accounting-sheet-open');
  }
  root.setAttribute('dir','rtl');
  root.innerHTML=`
  <div class="commerce-home" ${activeCommerceSection==='home'?'':'hidden'}>
    <p class="hint">هر عملیات بازرگانی در برگه تمام‌صفحه جدا باز می‌شود.</p>
    <div class="accounting-home-grid" role="navigation" aria-label="بخش‌های بازرگانی">
      <button type="button" class="accounting-home-tile" id="openInvoiceTypeSheet"><span class="accounting-home-icon invoice" aria-hidden="true">🧾</span><strong>فاکتور</strong><span class="hint">فروش، خرید، برگشت و پیش‌فاکتور</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="parties"><span class="accounting-home-icon party" aria-hidden="true">👤</span><strong>طرف حساب‌ها</strong><span class="hint">تعریف مشتری و تأمین‌کننده</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="receipts"><span class="accounting-home-icon receipt" aria-hidden="true">💵</span><strong>دریافت / پرداخت</strong><span class="hint">نقد، کارت، چک و تخصیص</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="banking"><span class="accounting-home-icon banking" aria-hidden="true">🏦</span><strong>بانک</strong><span class="hint">حساب بانکی و صورت‌حساب</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="operating"><span class="accounting-home-icon expense" aria-hidden="true">📒</span><strong>هزینه و درآمد</strong><span class="hint">ثبت هزینه و درآمد متفرقه</span></button>
      <button type="button" class="accounting-home-tile" data-commerce-tab="inventory"><span class="accounting-home-icon inventory" aria-hidden="true">📦</span><strong>انبار</strong><span class="hint">بهای موجودی و تطبیق</span></button>
    </div>
  </div>
  <section data-commerce-section="invoices" ${activeCommerceSection==='sale'||activeCommerceSection==='purchase'?'':'hidden'}>
  <header class="commerce-page-header"><div><h2>${invoiceTypeTitle(activeInvoiceType)}</h2></div><span class="commerce-page-chip">${activeCommerceSection==='sale'?'فروش':'خرید'}</span></header>
  <div class="card commerce-invoice-card" style="margin-top:12px">
<h3 id="invoiceFormTitle">${invoiceTypeTitle(activeInvoiceType)}</h3>
<div class="form-grid invoice-header-grid">
<input type="hidden" id="invoiceType" value="${activeInvoiceType}">
<label class="field">شماره<input id="invoiceNumber" value="${esc(nextInvoiceNumber(activeInvoiceType))}" placeholder="شماره" autocomplete="off"></label>
<label class="field">${isSaleInvoiceType(activeInvoiceType)?'خریدار':'فروشنده'}
<div style="display:flex;gap:6px;align-items:stretch">
<select id="invoiceParty" style="flex:1"><option value="">انتخاب</option>${partyOptions(isSaleInvoiceType(activeInvoiceType)?'customer':'supplier')}</select>
<button type="button" class="btn btn-sm btn-secondary" id="invoiceAddParty" title="اگر شخص در فهرست نیست، اینجا تعریف کنید">+ شخص</button>
</div>
</label>
<label class="field">تاریخ<div class="invoice-jalali-date"><input id="invoiceDate" value="${todayJalali()}" placeholder="1405/01/01" autocomplete="off" inputmode="numeric"><button type="button" class="btn btn-secondary" id="invoiceJalaliCalendar" aria-label="تقویم" title="تقویم شمسی">▦</button></div><div id="invoiceJalaliCalendarPanel" class="invoice-jalali-calendar" hidden></div></label>
<input type="hidden" id="invoicePaymentTerms" value=""><select hidden aria-hidden="true"></select><input type="hidden" id="invoiceDescription">
</div>

<div class="invoice-items-block">
<div class="invoice-items-toolbar">
<b>اقلام</b>
<button type="button" class="btn btn-sm btn-secondary" id="invoiceOpenItems">برگه اقلام</button>
</div>
<div id="invoiceItemsSummary" class="hint" style="margin:4px 0 8px"></div>
<div id="invoiceItemsPlaceholder" hidden>
<div class="commerce-lines-head"><b>اقلام</b></div>
<div class="invoice-product-tools invoice-product-tools-compact">
<div class="invoice-live-search"><label class="field">کالا / بارکد<input id="invoiceProductSearch" autocomplete="off" placeholder="نام یا بارکد"></label><div id="invoiceProductSuggestions" class="invoice-product-suggestions" role="listbox" hidden></div></div>
<button class="btn btn-secondary" id="invoiceProductAdd" type="button">افزودن</button>
<button class="btn btn-primary" id="invoiceScanOpen" type="button">اسکن</button>
<input type="hidden" id="invoiceBarcodeInput">
<small id="invoiceScanStatus" class="hint" role="status" aria-live="polite"></small>
</div>
<div id="commerceInvoiceLines"></div>
<button class="btn btn-sm btn-secondary" id="invoiceAddLine" type="button">ردیف خالی</button>
</div>
</div>

<details class="card invoice-details-panel" style="margin-top:14px"><summary>مالیات</summary>
<div class="form-grid invoice-details-grid" style="margin-top:12px">
<label class="field">نرخ مالیات (%)<input id="invoiceTaxRate" inputmode="decimal" value="0" placeholder="۰"></label>
<label class="field">مبلغ مالیات<input id="invoiceTax" inputmode="numeric" value="0"></label>
<label class="field">توضیحات چاپی<textarea id="invoiceNotes" rows="2" placeholder="اختیاری"></textarea></label>
</div>
<input type="hidden" id="invoiceDescriptionVisible" value="">
<input type="hidden" id="invoiceDueDate" value=""><div id="invoicePaymentRows" hidden></div><div id="invoicePaymentSummary" class="hint" hidden></div>
</details>

<div class="commerce-invoice-summary">
<div><span>جمع</span><b id="invoiceNetPreview">—</b></div>
<div><span>مالیات</span><b id="invoiceTaxPreview">—</b></div>
<div class="grand"><span>مبلغ نهایی</span><b id="invoiceGrossPreview">—</b></div>
</div>
<div class="invoice-action-bar">
<button class="btn btn-secondary" id="invoiceSave" type="button">پیش‌نویس</button>
<button class="btn btn-primary" id="invoiceSettle" type="button" ${activeInvoiceType==='proforma'?'hidden':''}>تسویه درجا</button>
<button class="btn btn-secondary" id="invoiceCancelEdit" type="button" hidden>لغو</button>
</div>
<div class="table-wrap"><table class="data-table"><thead><tr><th>شماره فاکتور</th><th>${activeCommerceSection==='sale'?'مشتری':'تأمین‌کننده'}</th><th>تاریخ</th><th>مبلغ نهایی</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${invoiceRows(activeInvoiceType)}</tbody></table></div></div>
  </section>
  <section data-commerce-section="management" ${activeCommerceSection==='management'?'':'hidden'}>
    ${activeCommerceSection==='management'?await managementDashboardPanel():''}
    ${activeCommerceSection==='management'?await profitabilityPanel():''}
    ${activeCommerceSection==='management'?await cashflowPanel():''}
  </section>
  <section data-commerce-section="inventory" ${activeCommerceSection==='inventory'?'':'hidden'}>
    ${activeCommerceSection==='inventory'?`<div class="card" style="margin-top:14px"><h3>ارزش‌گذاری موجودی اولیه</h3><p class="hint">برای کالاهایی که پیش از راه‌اندازی حسابداری موجودی دارند، بهای واحد واقعی موجودی در تاریخ شروع را در این بخش ثبت کنید. این عملیات مستقل از فاکتور خرید است و تا پیش از ارزش‌گذاری، فروش آن کالا قطعی نمی‌شود تا بهای تمام‌شده اشتباه صفر ثبت نشود.</p><div class="form-grid"><label class="field">کالا<select id="openingCostProduct"><option value="">انتخاب کالا</option>${productOptions()}</select></label><label class="field">تعداد موجودی فعلی<input id="openingCostQty" inputmode="decimal" placeholder="از موجودی سیستم"></label><label class="field">بهای واحد (${currency==='toman'?'تومان':'ریال'})<input id="openingCostUnit" inputmode="numeric"></label><label class="field">تاریخ ارزش‌گذاری شمسی<input id="openingCostDate" placeholder="1405/01/01"></label></div><button class="btn btn-secondary" id="openingCostSave">ثبت بهای موجودی اولیه</button></div>`:''}
    ${activeCommerceSection==='inventory'?await inventoryReconciliationPanel():''}
  </section>
  <section data-commerce-section="receipts" ${activeCommerceSection==='receipts'?'':'hidden'}>
  <div class="card cash-entry-card" dir="rtl" style="margin-top:12px;text-align:right">
<h3>دریافت / پرداخت</h3>
<div class="form-grid cash-entry-grid">
<label class="field">نوع<select id="cashType"><option value="receipt">دریافت</option><option value="payment">پرداخت</option></select></label>
<label class="field">شماره<input id="cashNumber" placeholder="خودکار یا دستی"></label>
<label class="field">طرف حساب<select id="cashParty"><option value="">انتخاب</option>${partyOptions('customer')}</select></label>
<label class="field">روش<select id="cashMethod"><option value="cash">نقدی</option><option value="bank">بانک</option><option value="card">کارت</option><option value="transfer">حواله</option><option value="cheque">چک</option></select></label>
<label class="field">حساب<select id="cashAccount"><option value="">صندوق / بانک</option>${accountOptions()}</select></label>
<label class="field">فاکتور<select id="cashInvoice"><option value="">بدون تخصیص</option></select></label>
<label class="field">تاریخ<input id="cashDate" placeholder="1405/01/01"></label>
<label class="field">مبلغ<input id="cashAmount" inputmode="decimal" placeholder="۰"></label>
<input type="hidden" id="cashAllocation" value="">
<input type="hidden" id="cashDescription" value="">
<label class="field" data-cheque-field hidden>شماره چک<input id="cashChequeNumber" placeholder="شماره روی چک"></label>
<label class="field" data-cheque-field hidden>سریال چک<input id="cashChequeSerial" placeholder="سریال / سری برگه"></label>
<label class="field" data-cheque-field hidden>شناسه صیادی *<input id="cashChequeSayadi" inputmode="numeric" placeholder="شناسه ۱۶ رقمی صیادی"></label>
<label class="field" data-cheque-field hidden>بانک<input id="cashChequeBank" placeholder="نام بانک"></label>
<label class="field" data-cheque-field hidden>سررسید چک<input id="cashChequeDue" placeholder="1405/01/30" inputmode="numeric"></label>
</div>
<button class="btn btn-primary" id="cashSave" type="button">ثبت</button>
<div class="table-wrap" style="margin-top:14px"><table class="data-table"><thead><tr><th>شماره</th><th>نوع</th><th>طرف</th><th>تاریخ</th><th>مبلغ</th><th>وضعیت</th><th></th></tr></thead><tbody>${cashRows()}</tbody></table></div>
</div>
  </section>
  <section data-commerce-section="parties" ${activeCommerceSection==='parties'?'':'hidden'}>${activeCommerceSection==='parties'?partiesPanelHtml():''}</section>
  <section data-commerce-section="operating" ${activeCommerceSection==='operating'?'':'hidden'}>${activeCommerceSection==='operating'?await operatingPanelHtml():''}</section>
  <section data-commerce-section="cheques" ${activeCommerceSection==='cheques'?'':'hidden'}>${activeCommerceSection==='cheques'?await chequePanel():''}</section>
  <section data-commerce-section="aging" ${activeCommerceSection==='aging'?'':'hidden'}>${activeCommerceSection==='aging'?await agingPanel():''}</section>
  <section data-commerce-section="banking" ${activeCommerceSection==='banking'?'':'hidden'}>${activeCommerceSection==='banking'?await bankPanel():''}</section>`;
  const itemPlaceholder=root.querySelector<HTMLElement>('#invoiceItemsPlaceholder');
  if(itemPlaceholder){['.commerce-lines-head','.invoice-product-tools','#commerceInvoiceLines','#invoiceAddLine'].forEach(sel=>{const node=root.querySelector<HTMLElement>(sel);if(node)itemPlaceholder.appendChild(node);});}
  root.querySelectorAll<HTMLButtonElement>('[data-commerce-tab]').forEach(button=>button.addEventListener('click',()=>{
    const next=button.dataset.commerceTab as CommercePanelSection;
    if(next) openCommercePanelSheet(next);
  }));
  if(activeCommerceSection==='sale'||activeCommerceSection==='purchase'){
    addInvoiceLine(); addInvoicePaymentRow();
  }
  bind();
  if(!suppressCommerceSheetReopen && reopenSheet){
    await openCommercePanelSheet(reopenSheet);
  }
}
async function persist(next:CommerceData):Promise<void>{commerce=next;await saveCommerceData(next);await render()}
function refreshAccounting():void{window.dispatchEvent(new Event('accounting:data-updated'))}
function startInvoiceEdit(invoiceId:string):void {
  if(!commerce)return;
  const invoice=commerce.invoices.find(i=>i.id===invoiceId);
  if(!invoice)return;
  if(invoice.status!=='draft'){toast('فاکتور قطعی قابل ویرایش مستقیم نیست؛ برای حفظ سند و گردش انبار باید اصلاحیه ثبت شود.','error');return;}
  editingInvoiceId=invoice.id;
  const set=(selector:string,value:string)=>{const node=el<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>(selector);if(node)node.value=value};
  activeInvoiceType=invoice.type; activeCommerceSection=isSaleInvoiceType(invoice.type)?'sale':'purchase'; set('#invoiceType',invoice.type); el<HTMLSelectElement>('#invoiceParty')!.innerHTML='<option value="">انتخاب طرف حساب</option>'+partyOptions(isSaleInvoiceType(invoice.type)?'customer':'supplier');
  set('#invoiceNumber',invoice.number);set('#invoiceParty',invoice.partyId);set('#invoiceDate',invoice.date);set('#invoiceDueDate','');const paymentHost=el<HTMLDivElement>('#invoicePaymentRows');if(paymentHost)paymentHost.innerHTML='';set('#invoicePaymentTerms','تسویه از برگه مستقل انجام می‌شود');set('#invoiceDescription',invoice.description);set('#invoiceDescriptionVisible',invoice.description);set('#invoiceNotes',invoice.notes||'');set('#invoiceTaxRate',String((invoice.taxRateBps||0)/100));set('#invoiceTax',formatMoneyFromRial(invoice.taxRial,currency));
  const host=el<HTMLDivElement>('#commerceInvoiceLines')!;host.innerHTML='';
  for(const line of invoice.lines){
    addInvoiceLine(line.productId||undefined);
    const row=host.lastElementChild as HTMLElement;
    const put=(selector:string,value:string)=>{const node=row.querySelector<HTMLInputElement|HTMLSelectElement>(selector);if(node)node.value=value};
    put('[data-line-desc]',line.description);
    put('[data-line-unit]',line.unit||'عدد');
    put('[data-line-qty]',String(line.quantityMilli/1000));
    put('[data-line-price]',formatMoneyFromRial(line.unitPriceRial,currency));
    put('[data-line-discount]',formatMoneyFromRial(line.discountRial||0,currency));
    const descField=row.querySelector<HTMLInputElement>('[data-line-desc]');
    const descLabel=descField?.closest('label') as HTMLElement|null;
    if(descLabel)descLabel.hidden=!!line.productId;
    const stockField=row.querySelector<HTMLElement>('.invoice-stock-field');
    if(stockField)stockField.hidden=!line.productId;
  }
  updateInvoiceTotals();
  const save=el<HTMLButtonElement>('#invoiceSave');if(save)save.textContent='ذخیره پیش‌نویس';const cancel=el<HTMLButtonElement>('#invoiceCancelEdit');if(cancel)cancel.hidden=false;
  el<HTMLElement>('#invoiceFormTitle')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function cancelInvoiceEdit():void {editingInvoiceId=null;render()}

function bind():void {
  queueMicrotask(()=>enhanceDateFields(document));
  const updateMonthComparison=()=>{const first=el<HTMLSelectElement>('#managementCompareFirst')?.value||'';const second=el<HTMLSelectElement>('#managementCompareSecond')?.value||'';const host=el<HTMLDivElement>('#managementMonthComparison');if(!host)return;const metrics=[['فروش قطعی','salesRial'],['سود ناخالص','grossProfitRial'],['هزینه ثبت‌شده گروه ۶','expensesRial'],['دریافت قطعی','receiptsRial'],['پرداخت قطعی','paymentsRial'],['مانده فعلی مطالبات','receivableRial']] as const;const rows=(window as any).__anbarinManagementCompareRows as Array<Record<string,any>>|undefined;const a=rows?.find(x=>x.month===first),b=rows?.find(x=>x.month===second);if(!a||!b){host.innerHTML='<p class="hint">برای مقایسه، داده ماهانه کافی وجود ندارد.</p>';return;}host.innerHTML=`<div class="table-wrap"><table class="data-table"><thead><tr><th>شاخص</th><th>${first}</th><th>${second}</th><th>اختلاف (ماه دوم − اول)</th><th>تغییر درصدی</th></tr></thead><tbody>${metrics.map(([label,key])=>{const av=Number(a[key]||0),bv=Number(b[key]||0),delta=bv-av,pct=av===0?null:delta/Math.abs(av)*100;return `<tr><td>${label}</td><td>${money(av)}</td><td>${money(bv)}</td><td>${delta>0?'+':''}${money(delta)}</td><td>${pct===null?'—':`${pct>0?'+':''}${pct.toFixed(1)}٪`}</td></tr>`}).join('')}</tbody></table></div><p class="hint">درصد تغییر نسبت به ماه اول محاسبه می‌شود؛ اگر مقدار ماه اول صفر باشد، درصد تغییر قابل محاسبه نیست.</p>`;};
  document.querySelectorAll<HTMLSelectElement>('#managementCompareFirst,#managementCompareSecond').forEach(select=>select.addEventListener('change',updateMonthComparison));
  el<HTMLSelectElement>('#managementAnomalyThreshold')?.addEventListener('change',()=>{const threshold=Number(el<HTMLSelectElement>('#managementAnomalyThreshold')?.value||20);const host=el<HTMLDivElement>('#managementAnomalyAlerts');if(!host)return;const rows=(window as any).__anbarinManagementCompareRows as ManagementMonthRow[]|undefined;const alerts=detectManagementMonthAnomalies(rows||[],threshold);host.innerHTML=alerts.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>وضعیت</th><th>شاخص</th><th>بازه مقایسه</th><th>مقدار قبلی</th><th>مقدار جدید</th><th>تغییر</th></tr></thead><tbody>${alerts.map(a=>`<tr><td>${a.severity==='warning'?'نیازمند بررسی':'بهبود'}</td><td>${a.label}</td><td>${esc(a.previousMonth)} ← ${esc(a.month)}</td><td>${money(a.previousValue)}</td><td>${money(a.currentValue)}</td><td>${a.percentChange>0?'+':''}${a.percentChange.toFixed(1)}٪</td></tr>`).join('')}</tbody></table></div><p class="hint">کاهش فروش/سود/دریافت و افزایش هزینه/پرداخت/مطالبات نیازمند بررسی است.</p>`:'<p class="hint">در آستانه انتخابی تغییر غیرعادی معناداری پیدا نشد؛ ماه‌های با مبنای صفر برای جلوگیری از درصد گمراه‌کننده نادیده گرفته می‌شوند.</p>'});
  document.querySelectorAll<HTMLButtonElement>('[data-management-month]').forEach(button=>button.addEventListener('click',()=>{const month=button.dataset.managementMonth||'';const detail=el<HTMLElement>(`#managementMonthDetail_${month.replace('/','')}`);if(!detail)return;const opening=detail.hidden;detail.hidden=!opening;button.setAttribute('aria-expanded',String(opening));button.textContent=`${opening?'بستن جزئیات':'مشاهده جزئیات'} ${month}`;}));
  document.querySelectorAll<HTMLButtonElement>('[data-management-month-xlsx]').forEach(button=>button.addEventListener('click',async()=>{try{await exportManagementMonthXlsx(button.dataset.managementMonthXlsx||'',button.dataset.managementMonthFrom||'',button.dataset.managementMonthTo||'');toast('فایل Excel جزئیات ماه آماده شد','success')}catch(e){toast(e instanceof Error?e.message:'ساخت Excel جزئیات ماه ناموفق بود','error')}}));
  document.querySelectorAll<HTMLButtonElement>('[data-management-month-pdf]').forEach(button=>button.addEventListener('click',async()=>{try{await printManagementMonthPdf(button.dataset.managementMonthPdf||'',button.dataset.managementMonthFrom||'',button.dataset.managementMonthTo||'')}catch(e){toast(e instanceof Error?e.message:'آماده‌سازی PDF جزئیات ماه ناموفق بود','error')}}));
  el<HTMLButtonElement>('#managementApplyFilter')?.addEventListener('click',()=>{const next:ProfitabilityFilter={fiscalPeriodId:el<HTMLSelectElement>('#managementPeriod')?.value||'',fromDate:digits(el<HTMLInputElement>('#managementFrom')?.value||''),toDate:digits(el<HTMLInputElement>('#managementTo')?.value||'')};if(!next.fiscalPeriodId)delete next.fiscalPeriodId;if(!next.fromDate)delete next.fromDate;if(!next.toDate)delete next.toDate;if(next.fromDate&&next.toDate&&next.fromDate>next.toDate){toast('تاریخ شروع داشبورد نباید بعد از تاریخ پایان باشد','error');return}managementFilter=next;render()});
  el<HTMLButtonElement>('#managementClearFilter')?.addEventListener('click',()=>{managementFilter={};render()});
  el<HTMLButtonElement>('#managementExportXlsx')?.addEventListener('click',async()=>{try{await exportManagementDashboardXlsx(managementFilter);toast('فایل Excel داشبورد آماده شد','success')}catch(e){toast(e instanceof Error?e.message:'ساخت Excel داشبورد ناموفق بود','error')}});
  el<HTMLButtonElement>('#managementPrintPdf')?.addEventListener('click',async()=>{try{await printManagementDashboardPdf(managementFilter)}catch(e){toast(e instanceof Error?e.message:'آماده‌سازی PDF داشبورد ناموفق بود','error')}});
  el<HTMLButtonElement>('#profitabilityApplyFilter')?.addEventListener('click',()=>{profitabilityFilter={fiscalPeriodId:el<HTMLSelectElement>('#profitabilityPeriod')?.value||'',fromDate:digits(el<HTMLInputElement>('#profitabilityFrom')?.value||''),toDate:digits(el<HTMLInputElement>('#profitabilityTo')?.value||'')};if(!profitabilityFilter.fiscalPeriodId)delete profitabilityFilter.fiscalPeriodId;if(!profitabilityFilter.fromDate)delete profitabilityFilter.fromDate;if(!profitabilityFilter.toDate)delete profitabilityFilter.toDate;if(profitabilityFilter.fromDate&&profitabilityFilter.toDate&&profitabilityFilter.fromDate>profitabilityFilter.toDate){toast('تاریخ شروع نباید بعد از تاریخ پایان باشد','error');return}render()});
  el<HTMLButtonElement>('#profitabilityClearFilter')?.addEventListener('click',()=>{profitabilityFilter={};render()});
  el<HTMLButtonElement>('#profitabilityExportXlsx')?.addEventListener('click',async()=>{try{await exportProfitabilityXlsx(profitabilityFilter);toast('فایل Excel گزارش سودآوری آماده شد','success')}catch(e){toast(e instanceof Error?e.message:'ساخت فایل Excel ناموفق بود','error')}});
  el<HTMLButtonElement>('#profitabilityPrintPdf')?.addEventListener('click',async()=>{try{await printProfitabilityPdf(profitabilityFilter)}catch(e){toast(e instanceof Error?e.message:'آماده‌سازی PDF ناموفق بود','error')}});
  el<HTMLButtonElement>('#bankTransferSave')?.addEventListener('click',async()=>{try{await createInternalTransfer({number:el<HTMLInputElement>('#bankTransferNo')!.value,date:digits(el<HTMLInputElement>('#bankTransferDate')!.value),fiscalPeriodId:await activeFiscalPeriodId(),fromAccountId:el<HTMLSelectElement>('#bankTransferFrom')!.value,toAccountId:el<HTMLSelectElement>('#bankTransferTo')!.value,amountRial:parseMoneyToRial(digits(el<HTMLInputElement>('#bankTransferAmount')!.value),currency),feeRial:parseMoneyToRial(digits(el<HTMLInputElement>('#bankTransferFee')!.value||'0'),currency),feeAccountId:el<HTMLSelectElement>('#bankTransferFeeAccount')!.value,description:el<HTMLInputElement>('#bankTransferDescription')!.value});await render();refreshAccounting();toast('انتقال بین حساب‌ها و سند حسابداری ثبت شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ثبت انتقال','error')}});
  el<HTMLButtonElement>('#bankStatementImport')?.addEventListener('click',async()=>{try{const file=el<HTMLInputElement>('#bankStatementFile')?.files?.[0];if(!file)throw new Error('ابتدا فایل CSV را انتخاب کنید.');const accountId=el<HTMLSelectElement>('#bankStatementAccount')!.value;const rows=parseBankStatementCsv(await file.text(),accountId);const result=await importBankStatement(rows);await render();toast(`${result.imported} ردیف وارد شد؛ ${result.matched} ردیف به‌صورت خودکار تطبیق یافت.`,'success')}catch(e){toast(e instanceof Error?e.message:'خطا در ورود صورت‌حساب','error')}});
  el<HTMLButtonElement>('#bankMoveSave')?.addEventListener('click',async()=>{
    try{
      const kind=(el<HTMLSelectElement>('#bankMoveKind')?.value||'deposit') as 'deposit'|'withdraw';
      await createCashBankMove({
        kind,
        number:el<HTMLInputElement>('#bankMoveNo')?.value||String(Date.now()).slice(-6),
        date:digits(el<HTMLInputElement>('#bankMoveDate')?.value||''),
        fiscalPeriodId:await activeFiscalPeriodId(),
        cashAccountId:el<HTMLSelectElement>('#bankMoveCash')?.value||'',
        bankAccountId:el<HTMLSelectElement>('#bankMoveBank')?.value||'',
        amountRial:parseMoneyToRial(digits(el<HTMLInputElement>('#bankMoveAmount')?.value||'0'),currency),
        description:el<HTMLInputElement>('#bankMoveDesc')?.value||'',
      });
      await render();refreshAccounting();
      toast(kind==='deposit'?'واریز نقد به بانک ثبت شد.':'برداشت از بانک به صندوق ثبت شد.','success');
    }catch(e){toast(e instanceof Error?e.message:'خطا در ثبت واریز/برداشت','error')}
  });
  el<HTMLButtonElement>('#bankFeeSave')?.addEventListener('click',async()=>{
    try{
      await createBankFee({
        number:el<HTMLInputElement>('#bankFeeNo')?.value||String(Date.now()).slice(-6),
        date:digits(el<HTMLInputElement>('#bankFeeDate')?.value||''),
        fiscalPeriodId:await activeFiscalPeriodId(),
        bankAccountId:el<HTMLSelectElement>('#bankFeeBank')?.value||'',
        feeAccountId:el<HTMLSelectElement>('#bankFeeExpense')?.value||'',
        amountRial:parseMoneyToRial(digits(el<HTMLInputElement>('#bankFeeAmount')?.value||'0'),currency),
        description:el<HTMLInputElement>('#bankFeeDesc')?.value||'',
      });
      await render();refreshAccounting();
      toast('کارمزد بانکی ثبت و سند صادر شد.','success');
    }catch(e){toast(e instanceof Error?e.message:'خطا در ثبت کارمزد','error')}
  });
  el<HTMLButtonElement>('#bankLedgerLoad')?.addEventListener('click',async()=>{
    try{
      const accountId=el<HTMLSelectElement>('#bankLedgerAccount')?.value||'';
      if(!accountId)throw new Error('حساب را انتخاب کنید.');
      const rows=await getBankAccountLedger(accountId);
      const body=el<HTMLElement>('#bankLedgerBody');
      if(!body)return;
      body.innerHTML=rows.slice(-120).reverse().map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.number)}</td><td>${esc(r.description)}</td><td>${money(r.debitRial)}</td><td>${money(r.creditRial)}</td><td>${money(r.balanceRial)}</td></tr>`).join('')
        ||'<tr><td colspan="6">گردشی برای این حساب ثبت نشده است.</td></tr>';
    }catch(e){toast(e instanceof Error?e.message:'خطا در بارگذاری دفتر','error')}
  });

  el<HTMLButtonElement>('#openingCostSave')?.addEventListener('click',async()=>{try{const p=products.find(x=>x.id===el<HTMLSelectElement>('#openingCostProduct')!.value);if(!p)throw new Error('کالا را انتخاب کنید.');const qty=Number(digits(el<HTMLInputElement>('#openingCostQty')!.value).replace(',','.'));if(!Number.isFinite(qty)||qty<=0)throw new Error('تعداد موجودی معتبر نیست.');if(Math.abs(qty-(Number(p.systemQty)||0))>0.000001)throw new Error('تعداد باید با موجودی فعلی کالا در انبار برابر باشد.');const warehouse=p.warehouse||'انبار اصلی';const costing=await loadInventoryCostData();setOpeningStockCost(costing,{productId:p.id,warehouse,qtyMilli:Math.round(qty*1000),unitCostRial:parseMoneyToRial(digits(el<HTMLInputElement>('#openingCostUnit')!.value),currency),date:digits(el<HTMLInputElement>('#openingCostDate')!.value)});await saveInventoryCostData(costing);logAudit('accounting_opening_stock_valued',{productId:p.id,warehouse,qty,unitCostRial:parseMoneyToRial(digits(el<HTMLInputElement>('#openingCostUnit')!.value),currency)});toast('بهای موجودی اولیه ثبت شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ارزش‌گذاری موجودی','error')}});
  el<HTMLButtonElement>('#openInvoiceTypeSheet')?.addEventListener('click',openInvoiceTypeSheet);
  el<HTMLSelectElement>('#opKind')?.addEventListener('change',()=>{
    const kind=el<HTMLSelectElement>('#opKind')!.value;
    const exp=el<HTMLElement>('#opAccountExpenseWrap');
    const inc=el<HTMLElement>('#opAccountIncomeWrap');
    if(exp)exp.hidden=kind!=='expense';
    if(inc)inc.hidden=kind!=='income';
  });
  el<HTMLButtonElement>('#opSave')?.addEventListener('click',async()=>{
    try{
      const kind=(el<HTMLSelectElement>('#opKind')?.value||'expense') as 'expense'|'income';
      const operatingAccountId=kind==='expense'
        ?(el<HTMLSelectElement>('#opExpenseAccount')?.value||'')
        :(el<HTMLSelectElement>('#opIncomeAccount')?.value||'');
      const cashAccountId=el<HTMLSelectElement>('#opCashAccount')?.value||'';
      const amountRial=parseMoneyToRial(digits(el<HTMLInputElement>('#opAmount')?.value||'0'),currency);
      const date=digits(el<HTMLInputElement>('#opDate')?.value||'');
      const fiscalPeriodId=el<HTMLSelectElement>('#opPeriod')?.value||await activeFiscalPeriodId();
      const description=el<HTMLInputElement>('#opDescription')?.value||'';
      const partyId=el<HTMLSelectElement>('#opParty')?.value||undefined;
      if(!operatingAccountId)throw new Error(kind==='expense'?'حساب هزینه را انتخاب کنید.':'حساب درآمد را انتخاب کنید.');
      if(!cashAccountId)throw new Error('حساب صندوق یا بانک را انتخاب کنید.');
      await recordOperatingEntry({kind,date,fiscalPeriodId,amountRial,operatingAccountId,cashAccountId,description,partyId});
      logAudit('operating_entry',{kind,amountRial,operatingAccountId,cashAccountId});
      refreshAccounting();
      await render();
      toast(kind==='expense'?'هزینه ثبت و سند حسابداری صادر شد.':'درآمد ثبت و سند حسابداری صادر شد.','success');
    }catch(e){toast(e instanceof Error?e.message:'خطا در ثبت هزینه/درآمد','error')}
  });
  const openItemsButton=el<HTMLButtonElement>('#invoiceOpenItems');
  if(openItemsButton)openItemsButton.onclick=(event)=>{event.preventDefault();openInvoiceItemsSheet();};
  el<HTMLButtonElement>('#invoiceAddParty')?.addEventListener('click',()=>{
    openPartyFormSheet({
      preferType:isSaleInvoiceType(activeInvoiceType)?'customer':'supplier',
      selectAfterSave:true,
    });
  });
  el<HTMLButtonElement>('#partySaveBtn')?.addEventListener('click',async()=>{
    const saved=await savePartyFromForm(false);
    if(saved)await render();
  });
  el<HTMLButtonElement>('#partyResetBtn')?.addEventListener('click',()=>{editingPartyId=null;render();});
  document.querySelectorAll<HTMLButtonElement>('[data-edit-party]').forEach(btn=>btn.addEventListener('click',()=>{
    editingPartyId=btn.dataset.editParty||null;
    render().then(()=>el<HTMLElement>('#partyFormGrid')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }));
  el<HTMLInputElement>('#invoiceDescriptionVisible')?.addEventListener('input',event=>{const hidden=el<HTMLInputElement>('#invoiceDescription');if(hidden)hidden.value=(event.target as HTMLInputElement).value;});
  const previousInvoiceScanHandler=(window as any).__anbarinInvoiceBarcodeHandler as EventListener|undefined;
  if(previousInvoiceScanHandler)window.removeEventListener('anbarin:invoice-barcode-scan',previousInvoiceScanHandler);
  const invoiceScanHandler:EventListener=(event:Event)=>{
    const detail=(event as CustomEvent<{code:string}>).detail;
    const code=digits(detail?.code||'').trim();
    if(!code)return;
    const product=findProductByCode(code);
    const status=el<HTMLElement>('#invoiceScanStatus')||document.querySelector<HTMLElement>('#invoiceScanStatus');
    if(product){
      addProductToInvoice(product.id,true);
      if(status)status.textContent=`✓ ${product.name} اضافه شد`;
      toast(`${product.name} به اقلام اضافه شد`,'success');
    }else{
      if(status)status.textContent=`بارکد ${code} پیدا نشد`;
      offerAddProduct(code,{
        asName:false,
        onSaved:(productId)=>{
          addProductToInvoice(productId,true);
          const p=products.find(x=>x.id===productId);
          if(status)status.textContent=p?`✓ ${p.name} اضافه شد`:'کالا اضافه شد';
          toast(p?`${p.name} تعریف و به فاکتور اضافه شد`:'کالا به فاکتور اضافه شد','success');
        },
      });
    }
  };
  (window as any).__anbarinInvoiceBarcodeHandler=invoiceScanHandler;window.addEventListener('anbarin:invoice-barcode-scan',invoiceScanHandler);
  bindInvoiceProductSearch(document);
  document.addEventListener('click',event=>{if(!(event.target as HTMLElement).closest('.invoice-live-search')){const box=el<HTMLDivElement>('#invoiceProductSuggestions');if(box)box.hidden=true;}});
  // تقویم فاکتور از طریق attachJalaliCalendar / enhanceDateFields وصل می‌شود
  const invDate = el<HTMLInputElement>('#invoiceDate');
  if (invDate) {
    const btn = el<HTMLButtonElement>('#invoiceJalaliCalendar');
    const panel = el<HTMLDivElement>('#invoiceJalaliCalendarPanel');
    if (btn) delete btn.dataset.calBound;
    delete invDate.dataset.calendarEnhanced;
    attachJalaliCalendar(invDate, btn, panel);
  }
  el<HTMLInputElement>('#invoiceTax')?.addEventListener('input',updateInvoiceTotals);
  el<HTMLButtonElement>('#invoiceAddPayment')?.addEventListener('click',()=>addInvoicePaymentRow());el<HTMLDivElement>('#invoicePaymentRows')?.addEventListener('input',updateInvoiceTotals);el<HTMLDivElement>('#invoicePaymentRows')?.addEventListener('change',updateInvoiceTotals);
  el<HTMLInputElement>('#invoiceTaxRate')?.addEventListener('change',applyInvoiceTaxRate);
  const saveInvoiceDraft=async(quiet=false):Promise<string|null>=>{
    if(!commerce)return null;
    try{
      const type=el<HTMLInputElement>('#invoiceType')!.value as InvoiceType;
      const invoiceNo=el<HTMLInputElement>('#invoiceNumber')!.value.trim();
      if(!invoiceNo)throw new Error('شماره فاکتور را وارد کنید.');
      if(!el<HTMLSelectElement>('#invoiceParty')!.value)throw new Error('طرف حساب را انتخاب کنید.');
      if(commerce.invoices.some(i=>i.id!==editingInvoiceId&&i.type===type&&i.number===invoiceNo))throw new Error('شماره فاکتور در این نوع فاکتور تکراری است.');
      const rows=[...document.querySelectorAll<HTMLElement>('.commerce-line')];
      if(!rows.length)throw new Error('حداقل یک قلم به فاکتور اضافه کنید.');
      const lines=rows.map(row=>{
        const q=Number(digits(row.querySelector<HTMLInputElement>('[data-line-qty]')!.value).replace(',','.'));
        if(!Number.isFinite(q)||q<=0||q>999999999)throw new Error('تعداد نامعتبر است.');
        const productId=row.querySelector<HTMLInputElement>('[data-line-product]')!.value;
        const product=products.find(p=>p.id===productId);
        const description=row.querySelector<HTMLInputElement>('[data-line-desc]')!.value||(product?.name||'');
        if(!description.trim())throw new Error('شرح هر ردیف را وارد کنید.');
        return {description,unit:row.querySelector<HTMLInputElement>('[data-line-unit]')!.value,quantityMilli:Math.round(q*1000),unitPriceRial:parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-line-price]')!.value),currency),discountRial:parseMoneyToRial(digits(row.querySelector<HTMLInputElement>('[data-line-discount]')!.value||'0'),currency),...(product?{productId:product.id,warehouse:product.warehouse||'انبار اصلی'}:{})};
      });
      const invoiceDate=digits(el<HTMLInputElement>('#invoiceDate')!.value);
      const fiscalPeriodId=invoicePeriodForDate(invoiceDate);
      const payload={type,number:el<HTMLInputElement>('#invoiceNumber')!.value,date:invoiceDate,dueDate:'',paymentTerms:'',paymentParts:[] as InvoicePaymentPart[],fiscalPeriodId,partyId:el<HTMLSelectElement>('#invoiceParty')!.value,description:el<HTMLInputElement>('#invoiceDescription')!.value,notes:el<HTMLTextAreaElement>('#invoiceNotes')!.value,taxRateBps:Math.round(Number(digits(el<HTMLInputElement>('#invoiceTaxRate')!.value||'0').replace(',','.'))*100),lines,taxRial:parseMoneyToRial(digits(el<HTMLInputElement>('#invoiceTax')!.value||'0'),currency)};
      let savedId='';
      if(editingInvoiceId){
        const next=updateDraftInvoice(editingInvoiceId,payload,commerce);
        savedId=editingInvoiceId;
        editingInvoiceId=null;
        await persist(next);
        if(!quiet)toast('پیش‌نویس ذخیره شد','success');
      }else{
        const invoice=buildInvoice(payload,commerce.parties);
        savedId=invoice.id;
        const next={...commerce,invoices:[...commerce.invoices,invoice]};
        await persist(next);
        if(!quiet)toast('پیش‌نویس ذخیره شد','success');
      }
      return savedId;
    }catch(e){
      toast(e instanceof Error?e.message:'خطا در ذخیره فاکتور','error');
      return null;
    }
  };
  el<HTMLButtonElement>('#invoiceSave')?.addEventListener('click',async()=>{await saveInvoiceDraft(false);});
  el<HTMLButtonElement>('#invoiceSettle')?.addEventListener('click',async()=>{
    if(!commerce)return;
    const settleBtn=el<HTMLButtonElement>('#invoiceSettle');
    if(settleBtn){settleBtn.disabled=true;settleBtn.textContent='در حال آماده‌سازی...';}
    try{
      // همیشه آخرین محتوای فرم ذخیره شود، بعد برگه تسویه باز شود
      suppressCommerceSheetReopen=true;
      const savedId=await saveInvoiceDraft(true);
      suppressCommerceSheetReopen=false;
      if(!savedId)return;
      commerce=await loadCommerceData();
      const target=commerce.invoices.find(i=>i.id===savedId);
      if(!target){toast('فاکتور برای تسویه آماده نشد.','error');return;}
      if(target.status!=='draft'){toast('این فاکتور قبلاً قطعی شده است.','error');return;}
      if(target.type==='proforma'){toast('پیش‌فاکتور قابل تسویه حسابداری نیست.','error');return;}
      toast('پیش‌نویس ذخیره شد — تسویه را تکمیل کنید.','success');
      openInvoiceSettlementSheet(target.id);
    }catch(e){
      toast(e instanceof Error?e.message:'خطا در آماده‌سازی تسویه','error');
    }finally{
      suppressCommerceSheetReopen=false;
      if(settleBtn){settleBtn.disabled=false;settleBtn.textContent='تسویه درجا';}
    }
  });
  document.querySelectorAll<HTMLElement>('[data-edit-invoice]').forEach(b=>b.addEventListener('click',()=>startInvoiceEdit(b.dataset.editInvoice!)));
  el<HTMLButtonElement>('#invoiceCancelEdit')?.addEventListener('click',cancelInvoiceEdit);
  document.querySelectorAll<HTMLElement>('[data-print-invoice]').forEach(b=>b.addEventListener('click',()=>printInvoice(b.dataset.printInvoice!)));
  document.querySelectorAll<HTMLElement>('[data-post-invoice]').forEach(b=>b.addEventListener('click',()=>openInvoiceSettlementSheet(b.dataset.postInvoice!)));
  const refreshCashInvoices=()=>{if(!commerce)return;const type=el<HTMLSelectElement>('#cashType')!.value;const partyId=el<HTMLSelectElement>('#cashParty')!.value;const eligible=commerce.invoices.filter(i=>i.status==='posted'&&i.partyId===partyId&&((type==='receipt'&&i.type==='sale')||(type==='payment'&&i.type==='purchase'))&&invoiceOutstanding(i.id,commerce!)>0);el<HTMLSelectElement>('#cashInvoice')!.innerHTML='<option value="">بدون تخصیص (علی‌الحساب)</option>'+eligible.map(i=>`<option value="${esc(i.id)}">${esc(i.number)} — مانده ${money(invoiceOutstanding(i.id,commerce!))}</option>`).join('')};
  el<HTMLSelectElement>('#cashType')?.addEventListener('change',()=>{const type=el<HTMLSelectElement>('#cashType')!.value;el<HTMLSelectElement>('#cashParty')!.innerHTML='<option value="">انتخاب طرف حساب</option>'+partyOptions(type==='receipt'?'customer':'supplier');refreshCashInvoices()});
  el<HTMLSelectElement>('#cashParty')?.addEventListener('change',refreshCashInvoices);
  el<HTMLSelectElement>('#cashMethod')?.addEventListener('change',()=>{const show=el<HTMLSelectElement>('#cashMethod')!.value==='cheque';document.querySelectorAll<HTMLElement>('[data-cheque-field]').forEach(x=>x.hidden=!show)});
  el<HTMLButtonElement>('#cashSave')?.addEventListener('click',async()=>{if(!commerce)return;try{const type=el<HTMLSelectElement>('#cashType')!.value as 'receipt'|'payment';const result=await createCashTransaction({type,number:el<HTMLInputElement>('#cashNumber')!.value,date:digits(el<HTMLInputElement>('#cashDate')!.value),fiscalPeriodId:await activeFiscalPeriodId(),partyId:el<HTMLSelectElement>('#cashParty')!.value,cashAccountId:el<HTMLSelectElement>('#cashAccount')!.value,amountRial:parseMoneyToRial(digits(el<HTMLInputElement>('#cashAmount')!.value),currency),description:el<HTMLInputElement>('#cashDescription')!.value,method:el<HTMLSelectElement>('#cashMethod')!.value as any,allocations:el<HTMLSelectElement>('#cashInvoice')!.value?[{invoiceId:el<HTMLSelectElement>('#cashInvoice')!.value,amountRial:parseMoneyToRial(digits(el<HTMLInputElement>('#cashAllocation')!.value||el<HTMLInputElement>('#cashAmount')!.value),currency)}]:[],chequeNumber:el<HTMLInputElement>('#cashChequeNumber')!.value,chequeSerial:el<HTMLInputElement>('#cashChequeSerial')?.value||'',chequeSayadi:digits(el<HTMLInputElement>('#cashChequeSayadi')?.value||''),chequeBank:el<HTMLInputElement>('#cashChequeBank')!.value,chequeDueDate:digits(el<HTMLInputElement>('#cashChequeDue')!.value)},commerce);commerce=result.commerce;await saveCommerceData(commerce);render();refreshAccounting();toast('دریافت/پرداخت و سند حسابداری ثبت شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ثبت دریافت/پرداخت','error')}});
  document.querySelectorAll<HTMLElement>('[data-cheque-clear]').forEach(b=>b.addEventListener('click',async()=>{if(!commerce)return;try{const date=prompt('تاریخ وصول/تسویه شمسی را وارد کنید (مثلاً ۱۴۰۵/۰۱/۳۰):');if(!date)return;const result=await updateChequeStatus(b.dataset.chequeClear!,'cleared',digits(date),commerce);commerce=result.commerce;await recordChequeEvent(b.dataset.chequeClear!,'cleared_note',digits(date),'وصول/تسویه با سند حسابداری');render();refreshAccounting();toast('وصول/تسویه چک ثبت شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا در تسویه چک','error')}}));
  document.querySelectorAll<HTMLElement>('[data-cheque-bounce]').forEach(b=>b.addEventListener('click',async()=>{if(!commerce)return;try{const date=prompt('تاریخ برگشت چک شمسی را وارد کنید:');if(!date)return;const result=await updateChequeStatus(b.dataset.chequeBounce!,'bounced',digits(date),commerce);commerce=result.commerce;const reason=prompt('علت برگشت چک:')||'علت اعلام نشده';await recordChequeEvent(b.dataset.chequeBounce!,'bounced_note',digits(date),reason);render();refreshAccounting();toast('برگشت چک و اثر حسابداری ثبت شد','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ثبت برگشت چک','error')}}));

  document.querySelectorAll<HTMLElement>('[data-chq-endorse]').forEach(b=>b.addEventListener('click',async()=>{if(!commerce)return;try{const tx=commerce.cashTransactions.find(t=>t.id===b.dataset.chqEndorse);if(!tx)throw new Error('چک پیدا نشد.');const remaining=getChequeEndorsementRemaining(tx.id,commerce);const amountText=prompt(`مبلغ این مرحله را به ریال وارد کنید (حداکثر ${fa(remaining)}):`,String(remaining));if(!amountText)return;const amount=parseMoneyToRial(digits(amountText),'rial');if(!Number.isSafeInteger(amount)||amount<=0||amount>remaining)throw new Error('مبلغ واگذاری معتبر نیست یا از مانده چک بیشتر است.');const suppliers=commerce.parties.filter(p=>p.isActive&&(p.type==='supplier'||p.type==='both'));if(!suppliers.length)throw new Error('ابتدا تأمین‌کننده فعال ثبت کنید.');const supplierText=suppliers.map((p,i)=>`${i+1}) ${p.name}`).join('\n');const choice=prompt(`شماره تأمین‌کننده دریافت‌کننده را وارد کنید:\n${supplierText}`);if(!choice)return;const supplier=suppliers[Number(digits(choice))-1];if(!supplier)throw new Error('انتخاب تأمین‌کننده معتبر نیست.');const invoices=commerce.invoices.filter(i=>i.status==='posted'&&i.type==='purchase'&&i.partyId===supplier.id&&invoiceOutstanding(i.id,commerce!)>=amount);if(!invoices.length)throw new Error('برای این تأمین‌کننده فاکتور خرید قطعی با مانده کافی وجود ندارد.');const invoiceText=invoices.map((i,n)=>`${n+1}) ${i.number} — مانده ${money(invoiceOutstanding(i.id,commerce!))}`).join('\n');const invChoice=prompt(`فاکتور خریدی را انتخاب کنید که با این بخش از چک تسویه می‌شود:\n${invoiceText}`);if(!invChoice)return;const invoice=invoices[Number(digits(invChoice))-1];if(!invoice)throw new Error('انتخاب فاکتور معتبر نیست.');const date=prompt('تاریخ واگذاری شمسی (YYYY/MM/DD):');if(!date)return;const note=prompt('شرح / شماره رسید تحویل چک:')||'';commerce=await endorseCheque(tx.id,supplier.id,invoice.id,digits(date),note,amount);await render();refreshAccounting();toast('بخش چک و سند حسابداری ثبت شد.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در واگذاری چک','error')}}));
  document.querySelectorAll<HTMLElement>('[data-chain-endorsement]').forEach(b=>b.addEventListener('click',async()=>{if(!commerce)return;try{const endorsementId=b.dataset.chainEndorsement!;const parentTransferId=b.dataset.chainParent||undefined;const fromPartyId=b.dataset.chainFrom!;const available=Number(b.dataset.chainAvailable);const amountText=prompt(`مبلغ انتقال به ذی‌نفع بعدی (حداکثر ${fa(available)} ریال):`,String(available));if(!amountText)return;const amount=parseMoneyToRial(digits(amountText),'rial');if(!Number.isSafeInteger(amount)||amount<=0||amount>available)throw new Error('مبلغ انتقال معتبر نیست.');const candidates=commerce.parties.filter(p=>p.isActive&&p.id!==fromPartyId);if(!candidates.length)throw new Error('طرف حساب فعال دیگری برای انتقال وجود ندارد.');const options=candidates.map((p,i)=>`${i+1}) ${p.name}`).join('\n');const choice=prompt(`شماره دریافت‌کننده را وارد کنید:\n${options}`);if(!choice)return;const to=candidates[Number(digits(choice))-1];if(!to)throw new Error('انتخاب دریافت‌کننده معتبر نیست.');const date=prompt('تاریخ انتقال شمسی (YYYY/MM/DD):');if(!date)return;const note=prompt('شماره رسید تحویل / توضیحات:')||'';await transferEndorsedCheque({endorsementId,parentTransferId,fromPartyId,toPartyId:to.id,amountRial:amount,date:digits(date),note});await render();toast('انتقال زنجیره‌ای چک ثبت شد.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در انتقال زنجیره‌ای چک','error')}}));
  document.querySelectorAll<HTMLElement>('[data-chain-outcome]').forEach(b=>b.addEventListener('click',async()=>{if(!commerce)return;try{const endorsementId=b.dataset.chainOutcome!;const parentTransferId=b.dataset.outcomeParent||undefined;const holderPartyId=b.dataset.outcomeHolder!;const available=Number(b.dataset.outcomeAvailable);const amountText=prompt(`مبلغ تعیین‌تکلیف (حداکثر ${fa(available)} ریال):`,String(available));if(!amountText)return;const amountRial=parseMoneyToRial(digits(amountText),'rial');if(!Number.isSafeInteger(amountRial)||amountRial<=0||amountRial>available)throw new Error('مبلغ واردشده معتبر نیست.');const choice=prompt('نتیجه را انتخاب کنید:\n1) وصول‌شده\n2) برگشتی\n3) مورد اختلاف');if(!choice)return;const typeMap:Record<string,'collected'|'returned'|'disputed'>={'1':'collected','2':'returned','3':'disputed'};const type=typeMap[digits(choice)];if(!type)throw new Error('نوع نتیجه معتبر نیست.');const date=prompt('تاریخ ثبت نتیجه شمسی (YYYY/MM/DD):');if(!date)return;const reference=prompt('شماره گواهی بانک / کد رهگیری (اختیاری):')||'';const note=prompt('شرح یا علت برگشت / اختلاف:')||'';await recordChequeHolderOutcome({endorsementId,parentTransferId,holderPartyId,type,amountRial,date:digits(date),reference,note});await render();toast('نتیجه چک نزد دارنده ثبت شد.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ثبت نتیجه چک','error')}}));
  document.querySelectorAll<HTMLElement>('[data-chq-extend]').forEach(b=>b.addEventListener('click',async()=>{try{const date=prompt('سررسید جدید شمسی (YYYY/MM/DD):');if(!date)return;const note=prompt('علت تمدید:')||'';await extendChequeDueDate(b.dataset.chqExtend!,digits(date),note);commerce=await loadCommerceData();await render();toast('سررسید جدید ثبت و سابقه قبلی حفظ شد.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در تمدید چک','error')}}));
  document.querySelectorAll<HTMLElement>('[data-chq-replace]').forEach(b=>b.addEventListener('click',async()=>{try{const number=prompt('شماره چک جایگزین:');if(!number)return;const bank=prompt('بانک چک جایگزین:');if(!bank)return;const dueDate=prompt('سررسید جدید شمسی:');if(!dueDate)return;const date=prompt('تاریخ تحویل چک جایگزین شمسی:');if(!date)return;const note=prompt('شرح/علت جایگزینی:')||'';await replaceChequeDetails(b.dataset.chqReplace!,{number,bank,dueDate:digits(dueDate),date:digits(date),note});commerce=await loadCommerceData();await render();toast('مشخصات چک جایگزین ثبت شد؛ سوابق قبلی محفوظ است.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در جایگزینی چک','error')}}));
  document.querySelectorAll<HTMLElement>('[data-chq-deposit]').forEach(b=>b.addEventListener('click',async()=>{try{const date=prompt('تاریخ واگذاری به بانک شمسی:');if(!date)return;const note=prompt('نام شعبه/شماره رسید واگذاری:')||'';await recordChequeEvent(b.dataset.chqDeposit!,'deposited',digits(date),note);await render();toast('واگذاری چک به بانک در دفتر ثبت شد.','success')}catch(e){toast(e instanceof Error?e.message:'خطا در ثبت واگذاری','error')}}));

}
/** بستن همه برگه‌های تو در توی بازرگانی و برگشت به خانه تا دفعه بعد انتخاب نوع فاکتور دوباره دیده شود */
export async function resetCommerceNavigation():Promise<void>{
  document.getElementById('invoiceItemsSheet')?.remove();
  document.getElementById('partyFormSheet')?.remove();
  document.getElementById('invoiceTypeSheet')?.remove();
  document.getElementById('commercePanelSheet')?.remove();
  editingInvoiceId=null;
  activeCommerceSection='home';
  suppressCommerceSheetReopen=true;
  try{await render();}finally{suppressCommerceSheetReopen=false;}
}

export async function initAccountingCommerceUI():Promise<void>{
  try{await ensureCommerceAccounts();const [acc,stored]=await Promise.all([loadAccountingData(),loadCommerceData()]);commerce=stored;currency=acc.settings.currencyDisplay;fiscalPeriodsCache=acc.fiscalPeriods.map(p=>({id:p.id,startDate:p.startDate,endDate:p.endDate,status:p.status}));loadPeriodOptions=acc.fiscalPeriods.filter(p=>p.status==='open').map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');accountOptionsCache=acc.accounts.filter(a=>a.isActive&&a.level==='detail'&&['det-cash','det-bank'].includes(a.id)).map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('');activeCommerceSection='home';suppressCommerceSheetReopen=false;render();}
  catch(e){console.error('[Anbarin] commerce UI init failed',e);toast('بارگذاری فاکتورها و دریافت‌وپرداخت انجام نشد','error')}
}

