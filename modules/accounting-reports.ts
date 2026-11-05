/** گزارش‌های مالی و حسابداری
 * گزارش‌ها فقط از اسناد قطعی و گردش‌های ذخیره‌شده خوانده می‌شوند؛ داده عملیاتی تغییر نمی‌کند.
 */
import { loadAccountingData, type AccountingData } from './accounting';
import { loadCommerceData, type CommerceData } from './accounting-commerce';
import { loadInventoryCostData, type InventoryCostData } from './inventory-costing';
import { products } from './state';
import { toast } from './ui';

type DateRange = { from?: string; to?: string; fiscalPeriodId?: string };
type Totals = { debitRial: number; creditRial: number; balanceRial: number };
export interface AccountReportRow extends Totals { accountId: string; code: string; title: string; nature: 'debit'|'credit'; }
export interface LedgerReportRow { date: string; entryNumber: string; description: string; debitRial: number; creditRial: number; balanceRial: number; }
export interface PartyReportRow { partyId: string; partyName: string; debitRial: number; creditRial: number; balanceRial: number; }
export interface InventoryValueRow { productId: string; productName: string; warehouse: string; quantityMilli: number; valueRial: number; averageUnitCostRial: number; }
const inRange = (date: string, range: DateRange) => (!range.from || date >= range.from) && (!range.to || date <= range.to);
const validRange = (range: DateRange) => { if (range.from && !/^\d{4}\/\d{2}\/\d{2}$/.test(range.from)) throw new Error('تاریخ شروع باید به شکل سال/ماه/روز شمسی باشد.'); if (range.to && !/^\d{4}\/\d{2}\/\d{2}$/.test(range.to)) throw new Error('تاریخ پایان باید به شکل سال/ماه/روز شمسی باشد.'); if (range.from && range.to && range.from > range.to) throw new Error('تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.'); };
function postedEntries(data: AccountingData, range: DateRange) { validRange(range); return data.journalEntries.filter(e => e.status === 'posted' && (!range.fiscalPeriodId || e.fiscalPeriodId === range.fiscalPeriodId) && inRange(e.date, range)); }
function sumLines(lines: Array<{ debitRial: number; creditRial: number }>) { return lines.reduce((s,l)=>({debitRial:s.debitRial+l.debitRial,creditRial:s.creditRial+l.creditRial}),{debitRial:0,creditRial:0}); }
export function buildTrialBalance(data: AccountingData, range: DateRange = {}): AccountReportRow[] {
  const map = new Map<string, AccountReportRow>();
  for (const entry of postedEntries(data,range)) for (const line of entry.lines) {
    const account = data.accounts.find(a=>a.id===line.accountId); if (!account) continue;
    const row = map.get(account.id) || {accountId:account.id,code:line.accountCodeSnapshot||account.code,title:line.accountTitleSnapshot||account.title,nature:account.nature,debitRial:0,creditRial:0,balanceRial:0};
    row.debitRial += line.debitRial; row.creditRial += line.creditRial; map.set(account.id,row);
  }
  return [...map.values()].map(r=>({...r,balanceRial:r.nature==='debit'?r.debitRial-r.creditRial:r.creditRial-r.debitRial})).sort((a,b)=>a.code.localeCompare(b.code,'en'));
}
export function buildGeneralLedger(data: AccountingData, accountId: string, range: DateRange = {}): LedgerReportRow[] {
  const account = data.accounts.find(a=>a.id===accountId); if (!account) throw new Error('حساب انتخاب‌شده پیدا نشد.');
  let balance=0; const rows: LedgerReportRow[]=[];
  for (const entry of postedEntries(data,range).sort((a,b)=>a.date.localeCompare(b.date)||a.number.localeCompare(b.number,'en'))) for (const line of entry.lines.filter(l=>l.accountId===accountId)) {
    balance += account.nature==='debit' ? line.debitRial-line.creditRial : line.creditRial-line.debitRial;
    rows.push({date:entry.date,entryNumber:entry.number,description:line.description||entry.description,debitRial:line.debitRial,creditRial:line.creditRial,balanceRial:balance});
  }
  return rows;
}
export function buildIncomeStatement(data: AccountingData, range: DateRange = {}) {
  const rows=buildTrialBalance(data,range);
  const revenue=rows.filter(r=>r.code.startsWith('4')).reduce((s,r)=>s+r.creditRial-r.debitRial,0);
  const cogs=rows.filter(r=>r.code.startsWith('5')).reduce((s,r)=>s+r.debitRial-r.creditRial,0);
  const expenses=rows.filter(r=>r.code.startsWith('6')).reduce((s,r)=>s+r.debitRial-r.creditRial,0);
  return {revenueRial:revenue,costOfGoodsSoldRial:cogs,grossProfitRial:revenue-cogs,expensesRial:expenses,netProfitRial:revenue-cogs-expenses};
}
export function buildBalanceSheet(data: AccountingData, range: DateRange = {}) {
  // ترازنامه مانده تجمعی تا تاریخ پایان است؛ تاریخ شروع برای آن اعمال نمی‌شود.
  const rows=buildTrialBalance(data,{...range,from:undefined});
  const assets=rows.filter(r=>r.code.startsWith('1')).reduce((s,r)=>s+r.debitRial-r.creditRial,0);
  const liabilities=rows.filter(r=>r.code.startsWith('2')).reduce((s,r)=>s+r.creditRial-r.debitRial,0);
  const equity=rows.filter(r=>r.code.startsWith('3')).reduce((s,r)=>s+r.creditRial-r.debitRial,0);
  return {assetsRial:assets,liabilitiesRial:liabilities,equityRial:equity,liabilitiesAndEquityRial:liabilities+equity,differenceRial:assets-liabilities-equity};
}
export function buildPartyLedger(commerce: CommerceData, accounting: AccountingData, range: DateRange = {}): PartyReportRow[] {
  const entries=postedEntries(accounting,range); const byParty=new Map<string,{debitRial:number;creditRial:number}>();
  for(const entry of entries) for(const line of entry.lines) if(line.partyId){const v=byParty.get(line.partyId)||{debitRial:0,creditRial:0};v.debitRial+=line.debitRial;v.creditRial+=line.creditRial;byParty.set(line.partyId,v)}
  return commerce.parties.filter(p=>byParty.has(p.id)).map(p=>{const v=byParty.get(p.id)!;return {partyId:p.id,partyName:p.name,...v,balanceRial:v.debitRial-v.creditRial}}).sort((a,b)=>a.partyName.localeCompare(b.partyName));
}
export function buildCashReport(commerce: CommerceData, range: DateRange = {}) {
  validRange(range); const tx=commerce.cashTransactions.filter(t=>(!range.fiscalPeriodId||t.fiscalPeriodId===range.fiscalPeriodId)&&inRange(t.date,range));
  const receipts=tx.filter(t=>t.type==='receipt').reduce((s,t)=>s+t.amountRial,0),payments=tx.filter(t=>t.type==='payment').reduce((s,t)=>s+t.amountRial,0);
  return {receiptsRial:receipts,paymentsRial:payments,netCashRial:receipts-payments,transactions:tx.slice().sort((a,b)=>a.date.localeCompare(b.date))};
}
export function buildInventoryValuation(costing: InventoryCostData): InventoryValueRow[] {
  return costing.balances.map(b=>({productId:b.productId,productName:products.find(p=>p.id===b.productId)?.name||b.productId,warehouse:b.warehouse,quantityMilli:b.qtyMilli,valueRial:b.valueRial,averageUnitCostRial:b.averageUnitCostRial})).sort((a,b)=>a.productName.localeCompare(b.productName));
}
const digits=(s:string)=>s.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const fa=(n:number)=>new Intl.NumberFormat('fa-IR').format(n);
const money=(n:number)=>`${fa(n)} ریال`;
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let acc:AccountingData|null=null, commerce:CommerceData|null=null, costing:InventoryCostData|null=null;
const el=<T extends HTMLElement>(q:string)=>document.querySelector<T>(q);
function range():DateRange{return {from:digits(el<HTMLInputElement>('#arFrom')?.value||'')||undefined,to:digits(el<HTMLInputElement>('#arTo')?.value||'')||undefined,fiscalPeriodId:el<HTMLSelectElement>('#arPeriod')?.value||undefined};}
function table(headers:string[], rows:string[][]):string{return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${headers.length}">داده‌ای برای این گزارش وجود ندارد.</td></tr>`}</tbody></table></div>`;}
function renderReport():void{
  if(!acc||!commerce||!costing)return; const type=el<HTMLSelectElement>('#arType')?.value||'trial'; const r=range(); const host=el<HTMLDivElement>('#arResult');if(!host)return;
  try{
    if(type==='trial'){const rows=buildTrialBalance(acc,r);const total=sumLines(rows);host.innerHTML=table(['کد','حساب','جمع بدهکار','جمع بستانکار','مانده طبیعی'],rows.map(x=>[esc(x.code),esc(x.title),money(x.debitRial),money(x.creditRial),money(x.balanceRial)]).concat([['جمع کل','',money(total.debitRial),money(total.creditRial),''] ]));}
    else if(type==='income'){const x=buildIncomeStatement(acc,r);host.innerHTML=table(['شرح','مبلغ'],[['درآمد فروش و خدمات',money(x.revenueRial)],['بهای تمام‌شده',money(x.costOfGoodsSoldRial)],['سود ناخالص',money(x.grossProfitRial)],['هزینه‌ها',money(x.expensesRial)],['سود / زیان خالص',money(x.netProfitRial)]]);}
    else if(type==='balance'){const x=buildBalanceSheet(acc,r);host.innerHTML=table(['شرح','مبلغ'],[['دارایی‌ها',money(x.assetsRial)],['بدهی‌ها',money(x.liabilitiesRial)],['حقوق مالکانه',money(x.equityRial)],['بدهی و حقوق مالکانه',money(x.liabilitiesAndEquityRial)],['اختلاف تراز',money(x.differenceRial)]]);}
    else if(type==='ledger'){const accountId=el<HTMLSelectElement>('#arAccount')?.value||'';const rows=accountId?buildGeneralLedger(acc,accountId,r):[];host.innerHTML=table(['تاریخ','شماره سند','شرح','بدهکار','بستانکار','مانده'],rows.map(x=>[esc(x.date),esc(x.entryNumber),esc(x.description),money(x.debitRial),money(x.creditRial),money(x.balanceRial)]));}
    else if(type==='party'){const rows=buildPartyLedger(commerce,acc,r);host.innerHTML=table(['طرف حساب','بدهکار','بستانکار','مانده بدهکار - بستانکار'],rows.map(x=>[esc(x.partyName),money(x.debitRial),money(x.creditRial),money(x.balanceRial)]));}
    else if(type==='cash'){const x=buildCashReport(commerce,r);host.innerHTML=table(['شرح','مبلغ'],[['دریافت‌ها',money(x.receiptsRial)],['پرداخت‌ها',money(x.paymentsRial)],['خالص جریان نقدی',money(x.netCashRial)]])+table(['تاریخ','شماره','نوع','طرف حساب','مبلغ'],x.transactions.map(t=>[esc(t.date),esc(t.number),t.type==='receipt'?'دریافت':'پرداخت',esc(commerce!.parties.find(p=>p.id===t.partyId)?.name||'—'),money(t.amountRial)]));}
    else {const rows=buildInventoryValuation(costing);host.innerHTML=table(['کالا','انبار','موجودی','ارزش ریالی','بهای متوسط واحد'],rows.map(x=>[esc(x.productName),esc(x.warehouse),fa(x.quantityMilli/1000),money(x.valueRial),money(x.averageUnitCostRial)]));}
  }catch(e){host.innerHTML=`<p class="hint">${esc(e instanceof Error?e.message:'خطا در تهیه گزارش')}</p>`;}
}
function exportCsv():void{const host=el<HTMLDivElement>('#arResult');if(!host)return;const rows=[...host.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(td=>'"'+(td.textContent||'').replace(/"/g,'""')+'"').join(','));const blob=new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`anbarin-accounting-report-${Date.now()}.csv`;a.click();URL.revokeObjectURL(url);}
export async function initAccountingReportsUI():Promise<void>{
  try{[acc,commerce,costing]=await Promise.all([loadAccountingData(),loadCommerceData(),loadInventoryCostData()]);const root=el<HTMLDivElement>('#accountingReportsWorkspace');if(!root)return;
    root.innerHTML=`<div class="card" style="margin-top:12px"><h3>گزارش‌های مالی و حسابداری</h3><div class="form-grid"><label class="field">نوع گزارش<select id="arType"><option value="trial">تراز آزمایشی</option><option value="income">سود و زیان</option><option value="balance">ترازنامه</option><option value="ledger">دفتر معین / گردش حساب</option><option value="party">گردش طرف حساب‌ها</option><option value="cash">گزارش دریافت و پرداخت</option><option value="inventory">ارزش موجودی انبار</option></select></label><label class="field">سال مالی<select id="arPeriod"><option value="">همه سال‌های مالی</option>${acc.fiscalPeriods.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select></label><label class="field">از تاریخ شمسی<input id="arFrom" placeholder="۱۴۰۵/۰۱/۰۱"></label><label class="field">تا تاریخ شمسی<input id="arTo" placeholder="۱۴۰۵/۱۲/۲۹"></label><label class="field" id="arAccountWrap" style="display:none">حساب<select id="arAccount"><option value="">انتخاب حساب</option>${acc.accounts.filter(a=>a.isActive&&a.level==='detail').map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('')}</select></label></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button class="btn btn-primary" id="arRun">تهیه گزارش</button><button class="btn btn-secondary" id="arCsv">خروجی Excel (CSV)</button><button class="btn btn-secondary" id="arPrint">چاپ / ذخیره PDF</button></div><div id="arResult"><p class="hint">برای مشاهده گزارش، «تهیه گزارش» را انتخاب کنید.</p></div><p class="hint">گزارش‌های حسابداری بر اساس اسناد قطعی تهیه می‌شوند. ارزش موجودی، تصویر وضعیت فعلی انبار است و گزارش تاریخی موجودی نیست. خروجی PDF از پنجره چاپ مرورگر و با انتخاب «ذخیره به‌صورت PDF» قابل دریافت است.</p></div>`;
    el<HTMLButtonElement>('#arRun')?.addEventListener('click',renderReport);el<HTMLButtonElement>('#arCsv')?.addEventListener('click',exportCsv);el<HTMLButtonElement>('#arPrint')?.addEventListener('click',()=>window.print());el<HTMLSelectElement>('#arType')?.addEventListener('change',()=>{const w=el<HTMLLabelElement>('#arAccountWrap');if(w)w.style.display=el<HTMLSelectElement>('#arType')!.value==='ledger'?'':'none';renderReport()});window.addEventListener('accounting:data-updated',async()=>{[acc,commerce,costing]=await Promise.all([loadAccountingData(),loadCommerceData(),loadInventoryCostData()]);renderReport()});
  }catch(e){console.error('[Anbarin] accounting reports init failed',e);toast('بارگذاری گزارش‌های مالی انجام نشد','error')}
}
