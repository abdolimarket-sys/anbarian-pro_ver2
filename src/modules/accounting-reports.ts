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
    else if(type==='aging'){
      const parties=buildPartyLedger(commerce,acc,r);
      const openInvoices=(commerce.invoices||[]).filter(i=>i.status==='posted'&&(!r.fiscalPeriodId||i.fiscalPeriodId===r.fiscalPeriodId)&&inRange(i.date,r));
      host.innerHTML=table(['طرف حساب','بدهکار','بستانکار','مانده'],parties.map(x=>[esc(x.partyName),money(x.debitRial),money(x.creditRial),money(x.balanceRial)]))
        +table(['شماره فاکتور','نوع','تاریخ','طرف حساب','مبلغ'],openInvoices.slice(0,150).map(i=>{
          const p=commerce!.parties.find(x=>x.id===i.partyId);
          return [esc(i.number),i.type==='sale'||i.type==='return-purchase'?'فروش/برگشت خرید':i.type==='purchase'||i.type==='return-sale'?'خرید/برگشت فروش':i.type,esc(i.date),esc(p?.name||'—'),money(i.grossRial)];
        }));
    }
    else if(type==='cheques_recv'||type==='cheques_pay'||type==='cheques'){
      const want=type==='cheques_recv'?'receipt':type==='cheques_pay'?'payment':null;
      const cheques=(commerce.cashTransactions||[]).filter(t=>t.method==='cheque'&&(!want||t.type===want)&&(!r.fiscalPeriodId||t.fiscalPeriodId===r.fiscalPeriodId)&&inRange(t.date,r)).slice().reverse();
      const stLabel=(s?:string)=>s==='pending'?'در جریان':s==='cleared'?'وصول':s==='bounced'?'برگشتی':s==='void'?'باطل':(s||'—');
      host.innerHTML=table(['تاریخ','شماره','طرف حساب','مبلغ','شماره چک','سررسید','وضعیت'],cheques.map(t=>{
        const p=commerce!.parties.find(x=>x.id===t.partyId);
        return [esc(t.date),esc(t.number),esc(p?.name||'—'),money(t.amountRial),esc(t.chequeNumber||'—'),esc(t.chequeDueDate||'—'),stLabel(t.chequeStatus)];
      }));
    }
    else if(type==='purchase_detail'||type==='sale_detail'){
      const isSale=type==='sale_detail';
      const invs=(commerce.invoices||[]).filter(i=>i.status==='posted'&&(isSale?i.type==='sale'||i.type==='return-sale':i.type==='purchase'||i.type==='return-purchase')&&(!r.fiscalPeriodId||i.fiscalPeriodId===r.fiscalPeriodId)&&inRange(i.date,r)).slice().reverse();
      const rows:string[][]=[];
      let total=0;
      for(const inv of invs){
        const p=commerce.parties.find(x=>x.id===inv.partyId);
        for(const line of inv.lines||[]){
          const qty=(line.quantityMilli||0)/1000;
          const lineTotal=(line.unitPriceRial||0)*qty-(line.discountRial||0);
          total+=lineTotal;
          rows.push([esc(inv.date),esc(inv.number),esc(p?.name||'—'),esc(line.description||'—'),fa(qty),money(line.unitPriceRial||0),money(line.discountRial||0),money(lineTotal)]);
        }
      }
      host.innerHTML=table(['تاریخ','شماره','طرف حساب','شرح کالا/خدمت','تعداد','فی','تخفیف','مبلغ'],rows)
        +table(['شرح','مبلغ'],[['جمع',money(total)]]);
    }
    else if(type==='monthly'){
      const map=new Map<string,{sale:number;purchase:number;receipt:number;payment:number}>();
      const bump=(date:string,key:'sale'|'purchase'|'receipt'|'payment',amount:number)=>{
        const m=date.slice(0,7); if(!/^\d{4}\/\d{2}$/.test(m))return;
        const row=map.get(m)||{sale:0,purchase:0,receipt:0,payment:0}; row[key]+=amount; map.set(m,row);
      };
      for(const i of commerce.invoices||[]){
        if(i.status!=='posted'||(r.fiscalPeriodId&&i.fiscalPeriodId!==r.fiscalPeriodId)||!inRange(i.date,r))continue;
        if(i.type==='sale')bump(i.date,'sale',i.grossRial);
        if(i.type==='purchase')bump(i.date,'purchase',i.grossRial);
      }
      for(const t of commerce.cashTransactions||[]){
        if((r.fiscalPeriodId&&t.fiscalPeriodId!==r.fiscalPeriodId)||!inRange(t.date,r))continue;
        if(t.chequeStatus==='bounced'||t.chequeStatus==='void')continue;
        if(t.type==='receipt')bump(t.date,'receipt',t.amountRial);
        if(t.type==='payment')bump(t.date,'payment',t.amountRial);
      }
      const months=[...map.keys()].sort();
      host.innerHTML=table(['ماه','فروش','خرید','دریافت','پرداخت','خالص نقد'],months.map(m=>{
        const x=map.get(m)!;
        return [esc(m),money(x.sale),money(x.purchase),money(x.receipt),money(x.payment),money(x.receipt-x.payment)];
      }));
    }
    else if(type==='daily'){
      const map=new Map<string,{sale:number;purchase:number;receipt:number;payment:number}>();
      const bump=(date:string,key:'sale'|'purchase'|'receipt'|'payment',amount:number)=>{
        const row=map.get(date)||{sale:0,purchase:0,receipt:0,payment:0}; row[key]+=amount; map.set(date,row);
      };
      for(const i of commerce.invoices||[]){
        if(i.status!=='posted'||(r.fiscalPeriodId&&i.fiscalPeriodId!==r.fiscalPeriodId)||!inRange(i.date,r))continue;
        if(i.type==='sale')bump(i.date,'sale',i.grossRial);
        if(i.type==='purchase')bump(i.date,'purchase',i.grossRial);
      }
      for(const t of commerce.cashTransactions||[]){
        if((r.fiscalPeriodId&&t.fiscalPeriodId!==r.fiscalPeriodId)||!inRange(t.date,r))continue;
        if(t.chequeStatus==='bounced'||t.chequeStatus==='void')continue;
        if(t.type==='receipt')bump(t.date,'receipt',t.amountRial);
        if(t.type==='payment')bump(t.date,'payment',t.amountRial);
      }
      const days=[...map.keys()].sort().reverse();
      host.innerHTML=table(['تاریخ','فروش','خرید','دریافت','پرداخت','خالص نقد'],days.map(d=>{
        const x=map.get(d)!;
        return [esc(d),money(x.sale),money(x.purchase),money(x.receipt),money(x.payment),money(x.receipt-x.payment)];
      }));
    }
    else if(type==='revenues'||type==='expenses'){
      const wantExpense=type==='expenses';
      const entries=postedEntries(acc,r);
      const byAcc=new Map<string,{code:string;title:string;debit:number;credit:number}>();
      for(const e of entries){
        for(const line of e.lines){
          const a=acc.accounts.find(x=>x.id===line.accountId);
          if(!a)continue;
          const match=wantExpense
            ? (/^6/.test(a.code) || /هزینه/.test(a.title))
            : (/^[78]/.test(a.code) || /درآمد|فروش/.test(a.title));
          if(!match)continue;
          const row=byAcc.get(a.id)||{code:a.code,title:a.title,debit:0,credit:0};
          row.debit+=line.debitRial; row.credit+=line.creditRial; byAcc.set(a.id,row);
        }
      }
      const rows=[...byAcc.values()].sort((a,b)=>a.code.localeCompare(b.code,'en'));
      const total=rows.reduce((s,x)=>s+(wantExpense?x.debit-x.credit:x.credit-x.debit),0);
      host.innerHTML=table(['کد','حساب','بدهکار','بستانکار','خالص'],rows.map(x=>[esc(x.code),esc(x.title),money(x.debit),money(x.credit),money(wantExpense?x.debit-x.credit:x.credit-x.debit)]))
        +table(['شرح','مبلغ'],[[wantExpense?'جمع هزینه‌ها':'جمع درآمدها',money(total)]]);
    }
    else if(type==='advanced'){
      const trial=buildTrialBalance(acc,r); const total=sumLines(trial);
      const inc=buildIncomeStatement(acc,r);
      const cash=buildCashReport(commerce,r);
      const parties=buildPartyLedger(commerce,acc,r);
      const topParties=parties.slice().sort((a,b)=>Math.abs(b.balanceRial)-Math.abs(a.balanceRial)).slice(0,15);
      host.innerHTML=
        table(['شاخص','مبلغ'],[
          ['درآمد فروش',money(inc.revenueRial)],
          ['بهای تمام‌شده',money(inc.costOfGoodsSoldRial)],
          ['سود ناخالص',money(inc.grossProfitRial)],
          ['هزینه‌ها',money(inc.expensesRial)],
          ['سود / زیان خالص',money(inc.netProfitRial)],
          ['دریافت‌ها',money(cash.receiptsRial)],
          ['پرداخت‌ها',money(cash.paymentsRial)],
          ['خالص جریان نقدی',money(cash.netCashRial)],
          ['جمع بدهکار تراز',money(total.debitRial)],
          ['جمع بستانکار تراز',money(total.creditRial)],
        ])
        +table(['طرف حساب','مانده'],topParties.map(x=>[esc(x.partyName),money(x.balanceRial)]));
    }
    else if(type==='cash'){const x=buildCashReport(commerce,r);host.innerHTML=table(['شرح','مبلغ'],[['دریافت‌ها',money(x.receiptsRial)],['پرداخت‌ها',money(x.paymentsRial)],['خالص جریان نقدی',money(x.netCashRial)]])+table(['تاریخ','شماره','نوع','طرف حساب','مبلغ'],x.transactions.map(t=>[esc(t.date),esc(t.number),t.type==='receipt'?'دریافت':'پرداخت',esc(commerce!.parties.find(p=>p.id===t.partyId)?.name||'—'),money(t.amountRial)]));}
    else {const rows=buildInventoryValuation(costing);host.innerHTML=table(['کالا','انبار','موجودی','ارزش ریالی','بهای متوسط واحد'],rows.map(x=>[esc(x.productName),esc(x.warehouse),fa(x.quantityMilli/1000),money(x.valueRial),money(x.averageUnitCostRial)]));}
  }catch(e){host.innerHTML=`<p class="hint">${esc(e instanceof Error?e.message:'خطا در تهیه گزارش')}</p>`;}
}
function exportCsv():void{const host=el<HTMLDivElement>('#arResult');if(!host)return;const rows=[...host.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(td=>'"'+(td.textContent||'').replace(/"/g,'""')+'"').join(','));const blob=new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`anbarin-accounting-report-${Date.now()}.csv`;a.click();URL.revokeObjectURL(url);}
export async function initAccountingReportsUI():Promise<void>{
  try{[acc,commerce,costing]=await Promise.all([loadAccountingData(),loadCommerceData(),loadInventoryCostData()]);const root=el<HTMLDivElement>('#accountingReportsWorkspace');if(!root)return;
    root.innerHTML=`<div class="card" style="margin-top:12px"><h3>گزارش‌ها</h3><div class="form-grid"><label class="field">نوع گزارش<select id="arType">
<option value="daily">گزارش روزانه</option>
<option value="monthly">گزارش ماهیانه</option>
<option value="purchase_detail">ریز خرید</option>
<option value="sale_detail">ریز فروش</option>
<option value="revenues">درآمدها</option>
<option value="expenses">هزینه‌ها</option>
<option value="cheques_recv">چک‌های دریافتی</option>
<option value="cheques_pay">چک‌های پرداختی</option>
<option value="cash">دریافت و پرداخت</option>
<option value="party">گردش طرف حساب‌ها</option>
<option value="aging">مانده اشخاص</option>
<option value="trial">تراز آزمایشی</option>
<option value="income">سود و زیان</option>
<option value="balance">ترازنامه</option>
<option value="ledger">دفتر معین</option>
<option value="inventory">ارزش موجودی</option>
<option value="advanced">گزارشات پیشرفته</option>
</select></label><label class="field">سال مالی<select id="arPeriod"><option value="">همه سال‌های مالی</option>${acc.fiscalPeriods.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select></label><label class="field">از تاریخ شمسی<input id="arFrom" placeholder="۱۴۰۵/۰۱/۰۱"></label><label class="field">تا تاریخ شمسی<input id="arTo" placeholder="۱۴۰۵/۱۲/۲۹"></label><label class="field" id="arAccountWrap" style="display:none">حساب<select id="arAccount"><option value="">انتخاب حساب</option>${acc.accounts.filter(a=>a.isActive&&a.level==='detail').map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('')}</select></label></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button class="btn btn-primary" id="arRun">تهیه گزارش</button><button class="btn btn-secondary" id="arCsv">خروجی Excel (CSV)</button><button class="btn btn-secondary" id="arPrint">چاپ / ذخیره PDF</button></div><div id="arResult"></div></div>`;
    el<HTMLButtonElement>('#arRun')?.addEventListener('click',renderReport);el<HTMLButtonElement>('#arCsv')?.addEventListener('click',exportCsv);el<HTMLButtonElement>('#arPrint')?.addEventListener('click',()=>window.print());el<HTMLSelectElement>('#arType')?.addEventListener('change',()=>{const w=el<HTMLLabelElement>('#arAccountWrap');if(w)w.style.display=el<HTMLSelectElement>('#arType')!.value==='ledger'?'':'none';renderReport()});window.addEventListener('accounting:data-updated',async()=>{[acc,commerce,costing]=await Promise.all([loadAccountingData(),loadCommerceData(),loadInventoryCostData()]);renderReport()});
  }catch(e){console.error('[Anbarin] accounting reports init failed',e);toast('بارگذاری گزارش‌های مالی انجام نشد','error')}
}
