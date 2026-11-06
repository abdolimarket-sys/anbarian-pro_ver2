/** گزارش‌های مالی و حسابداری
 * گزارش‌ها فقط از اسناد قطعی و گردش‌های ذخیره‌شده خوانده می‌شوند؛ داده عملیاتی تغییر نمی‌کند.
 */
import { loadAccountingData, type AccountingData } from './accounting';
import { loadCommerceData, invoiceOutstanding, type CommerceData } from './accounting-commerce';
import { loadInventoryCostData, type InventoryCostData } from './inventory-costing';
import { products } from './state';
import { enhanceDateFields } from './date-picker';
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

/** اسناد قطعی قبل از تاریخ شروع (برای مانده افتتاحیه) */
function postedBefore(data: AccountingData, range: DateRange) {
  validRange(range);
  return data.journalEntries.filter(e =>
    e.status === 'posted' &&
    (!range.fiscalPeriodId || e.fiscalPeriodId === range.fiscalPeriodId) &&
    (!!range.from && e.date < range.from)
  );
}
function trialFromEntries(data: AccountingData, entries: AccountingData['journalEntries']): AccountReportRow[] {
  const map = new Map<string, AccountReportRow>();
  for (const entry of entries) for (const line of entry.lines) {
    const account = data.accounts.find(a => a.id === line.accountId); if (!account) continue;
    const row = map.get(account.id) || {accountId:account.id,code:line.accountCodeSnapshot||account.code,title:line.accountTitleSnapshot||account.title,nature:account.nature,debitRial:0,creditRial:0,balanceRial:0};
    row.debitRial += line.debitRial; row.creditRial += line.creditRial; map.set(account.id, row);
  }
  return [...map.values()].map(r => ({...r, balanceRial: r.nature==='debit' ? r.debitRial-r.creditRial : r.creditRial-r.debitRial})).sort((a,b)=>a.code.localeCompare(b.code,'en'));
}

/** تراز آزمایشی ۸ ستونی: افتتاحیه + گردش دوره + اختتامیه */
export function buildTrialBalance8(data: AccountingData, range: DateRange = {}) {
  const openingRaw = range.from ? trialFromEntries(data, postedBefore(data, range)) : [] as AccountReportRow[];
  const periodRaw = buildTrialBalance(data, range);
  const ids = new Set([...openingRaw.map(r=>r.accountId), ...periodRaw.map(r=>r.accountId)]);
  const openingMap = new Map(openingRaw.map(r=>[r.accountId,r]));
  const periodMap = new Map(periodRaw.map(r=>[r.accountId,r]));
  return [...ids].map(id => {
    const o = openingMap.get(id);
    const p = periodMap.get(id);
    const account = data.accounts.find(a=>a.id===id)!;
    const openDebit = o?.debitRial || 0, openCredit = o?.creditRial || 0;
    const perDebit = p?.debitRial || 0, perCredit = p?.creditRial || 0;
    const closeDebit = openDebit + perDebit, closeCredit = openCredit + perCredit;
    const nature = account?.nature || p?.nature || o?.nature || 'debit';
    const closeBalance = nature==='debit' ? closeDebit-closeCredit : closeCredit-closeDebit;
    return {
      accountId: id,
      code: p?.code || o?.code || account?.code || '',
      title: p?.title || o?.title || account?.title || '',
      nature,
      openDebitRial: openDebit, openCreditRial: openCredit,
      periodDebitRial: perDebit, periodCreditRial: perCredit,
      closeDebitRial: closeDebit, closeCreditRial: closeCredit,
      balanceRial: closeBalance,
    };
  }).sort((a,b)=>a.code.localeCompare(b.code,'en'));
}

/** دفتر روزنامه — همه آرتیکل‌های اسناد قطعی به ترتیب تاریخ */
export function buildJournalBook(data: AccountingData, range: DateRange = {}) {
  const rows: Array<{date:string;number:string;accountCode:string;accountTitle:string;description:string;debitRial:number;creditRial:number;partyId?:string}> = [];
  for (const entry of postedEntries(data, range).sort((a,b)=>a.date.localeCompare(b.date)||a.number.localeCompare(b.number,'en'))) {
    for (const line of entry.lines) {
      const account = data.accounts.find(a=>a.id===line.accountId);
      rows.push({
        date: entry.date,
        number: entry.number,
        accountCode: line.accountCodeSnapshot || account?.code || '',
        accountTitle: line.accountTitleSnapshot || account?.title || '',
        description: line.description || entry.description,
        debitRial: line.debitRial,
        creditRial: line.creditRial,
        partyId: line.partyId,
      });
    }
  }
  return rows;
}

/** فهرست اسناد حسابداری */
export function buildVoucherList(data: AccountingData, range: DateRange = {}) {
  return postedEntries(data, range).sort((a,b)=>a.date.localeCompare(b.date)||a.number.localeCompare(b.number,'en')).map(e => {
    const totals = sumLines(e.lines);
    return {
      id: e.id,
      number: e.number,
      date: e.date,
      description: e.description,
      source: e.source,
      lineCount: e.lines.length,
      debitRial: totals.debitRial,
      creditRial: totals.creditRial,
    };
  });
}

/** مانده حساب‌ها در همه سطوح کدینگ (تجمیع از تفصیلی به بالا) */
export function buildAccountBalancesByLevel(data: AccountingData, range: DateRange = {}) {
  const detail = buildTrialBalance(data, range);
  const byId = new Map(detail.map(r => [r.accountId, r]));
  // attach parent rollups
  const result: Array<AccountReportRow & {level:string}> = [];
  for (const acc of [...data.accounts].filter(a=>a.isActive).sort((a,b)=>a.code.localeCompare(b.code,'en'))) {
    if (acc.level === 'detail') {
      const row = byId.get(acc.id);
      if (row) result.push({...row, level: acc.level});
      continue;
    }
    // sum children whose code starts with this code
    const children = detail.filter(r => r.code.startsWith(acc.code));
    if (!children.length) continue;
    const debitRial = children.reduce((s,r)=>s+r.debitRial,0);
    const creditRial = children.reduce((s,r)=>s+r.creditRial,0);
    result.push({
      accountId: acc.id, code: acc.code, title: acc.title, nature: acc.nature,
      debitRial, creditRial,
      balanceRial: acc.nature==='debit' ? debitRial-creditRial : creditRial-debitRial,
      level: acc.level,
    });
  }
  return result;
}
const digits=(s:string)=>s.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const fa=(n:number)=>new Intl.NumberFormat('fa-IR').format(n);
const money=(n:number)=>`${fa(n)} ریال`;
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let acc:AccountingData|null=null, commerce:CommerceData|null=null, costing:InventoryCostData|null=null;
const el=<T extends HTMLElement>(q:string)=>document.querySelector<T>(q);
function range():DateRange{return {from:digits(el<HTMLInputElement>('#arFrom')?.value||'')||undefined,to:digits(el<HTMLInputElement>('#arTo')?.value||'')||undefined,fiscalPeriodId:el<HTMLSelectElement>('#arPeriod')?.value||undefined};}
function table(headers:string[], rows:string[][]):string{return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${headers.length}">داده‌ای برای این گزارش وجود ندارد.</td></tr>`}</tbody></table></div>`;}
function invTypeLabel(t:string):string{
  return t==='sale'?'فروش':t==='purchase'?'خرید':t==='return-sale'?'برگشت از فروش':t==='return-purchase'?'برگشت از خرید':t==='proforma'?'پیش‌فاکتور':t;
}
function sourceLabel(s:string):string{
  return ({manual:'دستی',opening:'افتتاحیه',sales:'فروش',purchase:'خرید',receipt:'دریافت',payment:'پرداخت',inventory:'موجودی',closing:'اختتامیه'} as Record<string,string>)[s]||s;
}
function levelLabel(l:string):string{
  return ({group:'گروه',general:'کل',subsidiary:'معین',detail:'تفصیلی'} as Record<string,string>)[l]||l;
}
function openInvoicesFor(kind:'receivable'|'payable'){
  if(!commerce)return [];
  return (commerce.invoices||[]).filter(i=>{
    if(i.status!=='posted')return false;
    const outstanding=invoiceOutstanding(i.id,commerce!);
    if(outstanding<=0)return false;
    if(kind==='receivable')return i.type==='sale'||i.type==='return-purchase';
    return i.type==='purchase'||i.type==='return-sale';
  }).map(i=>({invoice:i,outstanding:invoiceOutstanding(i.id,commerce!),party:commerce!.parties.find(p=>p.id===i.partyId)}));
}
function agingBucket(due:string, asOf:string):string{
  if(!due)return 'بدون سررسید';
  if(due>=asOf)return 'جاری / نرسیده';
  // approximate day diff from Jalali YYYY/MM/DD strings is not exact; use month-based bands via string compare helpers
  const [y1,m1,d1]=due.split('/').map(Number);
  const [y2,m2,d2]=asOf.split('/').map(Number);
  const days=((y2-y1)*365)+((m2-m1)*30)+(d2-d1);
  if(days<=30)return '۱ تا ۳۰ روز';
  if(days<=60)return '۳۱ تا ۶۰ روز';
  if(days<=90)return '۶۱ تا ۹۰ روز';
  return 'بیش از ۹۰ روز';
}
function renderReport():void{
  if(!acc||!commerce||!costing)return; const type=el<HTMLSelectElement>('#arType')?.value||'trial'; const r=range(); const host=el<HTMLDivElement>('#arResult');if(!host)return;
  try{
    if(type==='trial'){
      const rows=buildTrialBalance(acc,r);const total=sumLines(rows);
      host.innerHTML=table(['کد','حساب','جمع بدهکار','جمع بستانکار','مانده طبیعی'],rows.map(x=>[esc(x.code),esc(x.title),money(x.debitRial),money(x.creditRial),money(x.balanceRial)]).concat([['جمع کل','',money(total.debitRial),money(total.creditRial),'']]));
    }
    else if(type==='trial8'){
      const rows=buildTrialBalance8(acc,r);
      const tot=(key:keyof typeof rows[0])=>rows.reduce((s,x)=>s+Number(x[key]||0),0);
      host.innerHTML=table(
        ['کد','حساب','بدهکار افتتاحیه','بستانکار افتتاحیه','بدهکار دوره','بستانکار دوره','بدهکار اختتامیه','بستانکار اختتامیه','مانده'],
        rows.map(x=>[esc(x.code),esc(x.title),money(x.openDebitRial),money(x.openCreditRial),money(x.periodDebitRial),money(x.periodCreditRial),money(x.closeDebitRial),money(x.closeCreditRial),money(x.balanceRial)])
          .concat([['جمع کل','',money(tot('openDebitRial')),money(tot('openCreditRial')),money(tot('periodDebitRial')),money(tot('periodCreditRial')),money(tot('closeDebitRial')),money(tot('closeCreditRial')),'']])
      );
    }
    else if(type==='journal'){
      const rows=buildJournalBook(acc,r);
      host.innerHTML=table(['تاریخ','شماره سند','کد حساب','عنوان حساب','شرح','بدهکار','بستانکار'],
        rows.map(x=>[esc(x.date),esc(x.number),esc(x.accountCode),esc(x.accountTitle),esc(x.description),money(x.debitRial),money(x.creditRial)]));
    }
    else if(type==='vouchers'){
      const rows=buildVoucherList(acc,r);
      host.innerHTML=table(['تاریخ','شماره','منبع','شرح','تعداد آرتیکل','بدهکار','بستانکار'],
        rows.map(x=>[esc(x.date),esc(x.number),sourceLabel(x.source),esc(x.description),fa(x.lineCount),money(x.debitRial),money(x.creditRial)]));
    }
    else if(type==='account_balances'){
      const rows=buildAccountBalancesByLevel(acc,r);
      host.innerHTML=table(['سطح','کد','حساب','بدهکار','بستانکار','مانده'],
        rows.map(x=>[levelLabel(x.level),esc(x.code),esc(x.title),money(x.debitRial),money(x.creditRial),money(x.balanceRial)]));
    }
    else if(type==='income'){
      const x=buildIncomeStatement(acc,r);
      host.innerHTML=table(['شرح','مبلغ'],[
        ['درآمد فروش و خدمات',money(x.revenueRial)],
        ['بهای تمام‌شده کالای فروش‌رفته',money(x.costOfGoodsSoldRial)],
        ['سود ناخالص',money(x.grossProfitRial)],
        ['هزینه‌های عملیاتی',money(x.expensesRial)],
        ['سود / زیان خالص',money(x.netProfitRial)],
      ]);
    }
    else if(type==='balance'){
      const x=buildBalanceSheet(acc,r);
      host.innerHTML=table(['شرح','مبلغ'],[
        ['دارایی‌ها',money(x.assetsRial)],
        ['بدهی‌ها',money(x.liabilitiesRial)],
        ['حقوق مالکانه',money(x.equityRial)],
        ['جمع بدهی و حقوق مالکانه',money(x.liabilitiesAndEquityRial)],
        ['اختلاف تراز (باید صفر باشد)',money(x.differenceRial)],
      ]);
    }
    else if(type==='ledger'){
      const accountId=el<HTMLSelectElement>('#arAccount')?.value||'';
      const rows=accountId?buildGeneralLedger(acc,accountId,r):[];
      host.innerHTML=table(['تاریخ','شماره سند','شرح','بدهکار','بستانکار','مانده'],
        rows.map(x=>[esc(x.date),esc(x.entryNumber),esc(x.description),money(x.debitRial),money(x.creditRial),money(x.balanceRial)]));
    }
    else if(type==='party'){
      const rows=buildPartyLedger(commerce,acc,r);
      host.innerHTML=table(['طرف حساب','بدهکار','بستانکار','مانده'],
        rows.map(x=>[esc(x.partyName),money(x.debitRial),money(x.creditRial),money(x.balanceRial)]));
    }
    else if(type==='receivables'||type==='payables'){
      const kind=type==='receivables'?'receivable':'payable';
      const open=openInvoicesFor(kind);
      const byParty=new Map<string,{name:string;count:number;amount:number}>();
      for(const row of open){
        const id=row.invoice.partyId;
        const cur=byParty.get(id)||{name:row.party?.name||'—',count:0,amount:0};
        cur.count+=1; cur.amount+=row.outstanding; byParty.set(id,cur);
      }
      const partyRows=[...byParty.values()].sort((a,b)=>b.amount-a.amount);
      host.innerHTML=
        table(['طرف حساب','تعداد فاکتور باز','مانده'],partyRows.map(x=>[esc(x.name),fa(x.count),money(x.amount)]))
        +table(['شماره','نوع','تاریخ','سررسید','طرف حساب','مانده'],open.map(x=>[
          esc(x.invoice.number),invTypeLabel(x.invoice.type),esc(x.invoice.date),esc(x.invoice.dueDate||'—'),esc(x.party?.name||'—'),money(x.outstanding)
        ]));
    }
    else if(type==='aging'){
      const asOf=r.to||r.from||'9999/12/29';
      const all=[...openInvoicesFor('receivable').map(x=>({...x,kind:'مطالبات'})),...openInvoicesFor('payable').map(x=>({...x,kind:'بدهی'}))];
      const buckets=new Map<string,number>();
      const rows=all.map(x=>{
        const due=x.invoice.dueDate||x.invoice.date;
        const bucket=agingBucket(due,asOf);
        buckets.set(bucket,(buckets.get(bucket)||0)+x.outstanding);
        return [x.kind,esc(x.invoice.number),esc(x.party?.name||'—'),esc(x.invoice.date),esc(due),bucket,money(x.outstanding)];
      });
      host.innerHTML=
        table(['طبقه سررسید','جمع مانده'],[...buckets.entries()].map(([k,v])=>[esc(k),money(v)]))
        +table(['نوع','شماره فاکتور','طرف حساب','تاریخ','سررسید','طبقه','مانده'],rows);
    }
    else if(type==='vat'){
      const invs=(commerce.invoices||[]).filter(i=>i.status==='posted'&&i.type!=='proforma'&&(!r.fiscalPeriodId||i.fiscalPeriodId===r.fiscalPeriodId)&&inRange(i.date,r));
      let outputTax=0,inputTax=0,saleNet=0,purchaseNet=0;
      const detail:string[][]=[];
      for(const i of invs){
        const p=commerce.parties.find(x=>x.id===i.partyId);
        const isSale=i.type==='sale'||i.type==='return-purchase';
        const isPurchase=i.type==='purchase'||i.type==='return-sale';
        const sign=i.type.startsWith('return')?-1:1;
        if(isSale){outputTax+=sign*i.taxRial;saleNet+=sign*i.netRial;}
        if(isPurchase){inputTax+=sign*i.taxRial;purchaseNet+=sign*i.netRial;}
        detail.push([esc(i.date),esc(i.number),invTypeLabel(i.type),esc(p?.name||'—'),money(i.netRial),money(i.taxRial),money(i.grossRial)]);
      }
      host.innerHTML=
        table(['شرح','مبلغ'],[
          ['خالص فروش مشمول',money(saleNet)],
          ['مالیات و عوارض فروش (خروجی)',money(outputTax)],
          ['خالص خرید مشمول',money(purchaseNet)],
          ['مالیات و عوارض خرید (ورودی)',money(inputTax)],
          ['مالیات پرداختنی / (قابل استرداد)',money(outputTax-inputTax)],
        ])
        +table(['تاریخ','شماره','نوع','طرف حساب','خالص','مالیات','مبلغ نهایی'],detail);
    }
    else if(type==='sale_by_party'||type==='purchase_by_party'){
      const isSale=type==='sale_by_party';
      const map=new Map<string,{name:string;count:number;net:number;tax:number;gross:number}>();
      for(const i of commerce.invoices||[]){
        if(i.status!=='posted'||(r.fiscalPeriodId&&i.fiscalPeriodId!==r.fiscalPeriodId)||!inRange(i.date,r))continue;
        const match=isSale?(i.type==='sale'||i.type==='return-sale'):(i.type==='purchase'||i.type==='return-purchase');
        if(!match)continue;
        const sign=i.type.startsWith('return')?-1:1;
        const p=commerce.parties.find(x=>x.id===i.partyId);
        const cur=map.get(i.partyId)||{name:p?.name||'—',count:0,net:0,tax:0,gross:0};
        cur.count+=1; cur.net+=sign*i.netRial; cur.tax+=sign*i.taxRial; cur.gross+=sign*i.grossRial;
        map.set(i.partyId,cur);
      }
      const rows=[...map.values()].sort((a,b)=>b.gross-a.gross);
      const tot=rows.reduce((s,x)=>({count:s.count+x.count,net:s.net+x.net,tax:s.tax+x.tax,gross:s.gross+x.gross}),{count:0,net:0,tax:0,gross:0});
      host.innerHTML=table(['طرف حساب','تعداد فاکتور','خالص','مالیات','مبلغ نهایی'],
        rows.map(x=>[esc(x.name),fa(x.count),money(x.net),money(x.tax),money(x.gross)])
          .concat([['جمع',fa(tot.count),money(tot.net),money(tot.tax),money(tot.gross)]]));
    }
    else if(type==='product_sales'){
      const map=new Map<string,{name:string;qty:number;amount:number;discount:number}>();
      for(const i of commerce.invoices||[]){
        if(i.status!=='posted'||(i.type!=='sale'&&i.type!=='return-sale')||(r.fiscalPeriodId&&i.fiscalPeriodId!==r.fiscalPeriodId)||!inRange(i.date,r))continue;
        const sign=i.type==='return-sale'?-1:1;
        for(const line of i.lines||[]){
          const key=line.productId||line.description||'—';
          const name=line.productId?(products.find(p=>p.id===line.productId)?.name||line.description):line.description;
          const cur=map.get(key)||{name:name||'—',qty:0,amount:0,discount:0};
          cur.qty+=sign*(line.quantityMilli||0)/1000;
          cur.amount+=sign*((line.unitPriceRial||0)*((line.quantityMilli||0)/1000));
          cur.discount+=sign*(line.discountRial||0);
          map.set(key,cur);
        }
      }
      const rows=[...map.values()].sort((a,b)=>b.amount-a.amount);
      host.innerHTML=table(['کالا / خدمت','تعداد','مبلغ','تخفیف','خالص'],
        rows.map(x=>[esc(x.name),fa(x.qty),money(x.amount),money(x.discount),money(x.amount-x.discount)]));
    }
    else if(type==='returns'){
      const invs=(commerce.invoices||[]).filter(i=>i.status==='posted'&&(i.type==='return-sale'||i.type==='return-purchase')&&(!r.fiscalPeriodId||i.fiscalPeriodId===r.fiscalPeriodId)&&inRange(i.date,r));
      host.innerHTML=table(['تاریخ','شماره','نوع','طرف حساب','خالص','مالیات','مبلغ نهایی'],
        invs.map(i=>{
          const p=commerce!.parties.find(x=>x.id===i.partyId);
          return [esc(i.date),esc(i.number),invTypeLabel(i.type),esc(p?.name||'—'),money(i.netRial),money(i.taxRial),money(i.grossRial)];
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
            : (/^[478]/.test(a.code) || /درآمد|فروش/.test(a.title));
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
      const bal=buildBalanceSheet(acc,r);
      const cash=buildCashReport(commerce,r);
      const parties=buildPartyLedger(commerce,acc,r);
      const topParties=parties.slice().sort((a,b)=>Math.abs(b.balanceRial)-Math.abs(a.balanceRial)).slice(0,15);
      const ar=openInvoicesFor('receivable').reduce((s,x)=>s+x.outstanding,0);
      const ap=openInvoicesFor('payable').reduce((s,x)=>s+x.outstanding,0);
      host.innerHTML=
        table(['شاخص','مبلغ'],[
          ['درآمد فروش',money(inc.revenueRial)],
          ['بهای تمام‌شده',money(inc.costOfGoodsSoldRial)],
          ['سود ناخالص',money(inc.grossProfitRial)],
          ['هزینه‌ها',money(inc.expensesRial)],
          ['سود / زیان خالص',money(inc.netProfitRial)],
          ['دارایی‌ها',money(bal.assetsRial)],
          ['بدهی‌ها',money(bal.liabilitiesRial)],
          ['حقوق مالکانه',money(bal.equityRial)],
          ['مطالبات باز',money(ar)],
          ['بدهی‌های باز',money(ap)],
          ['دریافت‌ها',money(cash.receiptsRial)],
          ['پرداخت‌ها',money(cash.paymentsRial)],
          ['خالص جریان نقدی',money(cash.netCashRial)],
          ['جمع بدهکار تراز',money(total.debitRial)],
          ['جمع بستانکار تراز',money(total.creditRial)],
        ])
        +table(['طرف حساب (بیشترین مانده)','مانده'],topParties.map(x=>[esc(x.partyName),money(x.balanceRial)]));
    }
    else if(type==='cash'){
      const x=buildCashReport(commerce,r);
      host.innerHTML=table(['شرح','مبلغ'],[['دریافت‌ها',money(x.receiptsRial)],['پرداخت‌ها',money(x.paymentsRial)],['خالص جریان نقدی',money(x.netCashRial)]])
        +table(['تاریخ','شماره','نوع','طرف حساب','مبلغ'],x.transactions.map(t=>[esc(t.date),esc(t.number),t.type==='receipt'?'دریافت':'پرداخت',esc(commerce!.parties.find(p=>p.id===t.partyId)?.name||'—'),money(t.amountRial)]));
    }
    else {
      const rows=buildInventoryValuation(costing);
      host.innerHTML=table(['کالا','انبار','موجودی','ارزش ریالی','بهای متوسط واحد'],rows.map(x=>[esc(x.productName),esc(x.warehouse),fa(x.quantityMilli/1000),money(x.valueRial),money(x.averageUnitCostRial)]));
    }
  }catch(e){host.innerHTML=`<p class="hint">${esc(e instanceof Error?e.message:'خطا در تهیه گزارش')}</p>`;}
}
function exportCsv():void{const host=el<HTMLDivElement>('#arResult');if(!host)return;const rows=[...host.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(td=>'"'+(td.textContent||'').replace(/"/g,'""')+'"').join(','));const blob=new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`anbarin-accounting-report-${Date.now()}.csv`;a.click();URL.revokeObjectURL(url);}

const REPORT_CATALOG: Array<{group:string;items:Array<{id:string;title:string;desc:string}>}> = [
  {group:'دفاتر و اسناد',items:[
    {id:'journal',title:'دفتر روزنامه',desc:'آرتیکل‌های اسناد قطعی'},
    {id:'vouchers',title:'فهرست اسناد',desc:'لیست اسناد حسابداری'},
    {id:'ledger',title:'دفتر معین',desc:'گردش یک حساب'},
    {id:'trial',title:'تراز آزمایشی',desc:'مانده حساب‌های تفصیلی'},
    {id:'trial8',title:'تراز ۸ ستونی',desc:'افتتاحیه، گردش، اختتامیه'},
    {id:'account_balances',title:'مانده حساب‌ها',desc:'همه سطوح کدینگ'},
  ]},
  {group:'صورت‌های مالی',items:[
    {id:'income',title:'سود و زیان',desc:'درآمد، بها، هزینه، سود'},
    {id:'balance',title:'ترازنامه',desc:'دارایی، بدهی، سرمایه'},
    {id:'advanced',title:'داشبورد مدیریتی',desc:'خلاصه شاخص‌های کلیدی'},
  ]},
  {group:'بازرگانی و اشخاص',items:[
    {id:'sale_detail',title:'ریز فروش',desc:'اقلام فاکتورهای فروش'},
    {id:'purchase_detail',title:'ریز خرید',desc:'اقلام فاکتورهای خرید'},
    {id:'sale_by_party',title:'فروش به تفکیک مشتری',desc:'خلاصه هر مشتری'},
    {id:'purchase_by_party',title:'خرید به تفکیک تأمین‌کننده',desc:'خلاصه هر تأمین‌کننده'},
    {id:'product_sales',title:'فروش به تفکیک کالا',desc:'تعداد و مبلغ هر کالا'},
    {id:'returns',title:'برگشت‌ها',desc:'برگشت از فروش و خرید'},
    {id:'party',title:'گردش طرف حساب',desc:'بدهکار و بستانکار اشخاص'},
    {id:'receivables',title:'بدهکاران',desc:'مطالبات باز'},
    {id:'payables',title:'بستانکاران',desc:'بدهی‌های باز'},
    {id:'aging',title:'تحلیل سررسید',desc:'طبقات سررسید مطالبات و بدهی'},
  ]},
  {group:'نقد، بانک و چک',items:[
    {id:'cash',title:'دریافت و پرداخت',desc:'جریان نقدی ثبت‌شده'},
    {id:'cheques_recv',title:'چک‌های دریافتی',desc:'وضعیت چک‌های دریافتی'},
    {id:'cheques_pay',title:'چک‌های پرداختی',desc:'وضعیت چک‌های پرداختی'},
    {id:'daily',title:'گزارش روزانه',desc:'فروش، خرید، نقد روزانه'},
    {id:'monthly',title:'گزارش ماهیانه',desc:'جمع ماهانه عملیات'},
  ]},
  {group:'مالیات، هزینه و موجودی',items:[
    {id:'vat',title:'مالیات ارزش افزوده',desc:'مالیات فروش و خرید'},
    {id:'revenues',title:'درآمدها',desc:'حساب‌های درآمد'},
    {id:'expenses',title:'هزینه‌ها',desc:'حساب‌های هزینه'},
    {id:'inventory',title:'ارزش موجودی',desc:'بهای تمام‌شده انبار'},
  ]},
];

let activeReportId: string | null = null;

function reportTitle(id:string):string{
  for(const g of REPORT_CATALOG){const it=g.items.find(x=>x.id===id);if(it)return it.title;}
  return 'گزارش';
}

function bindReportRunner():void{
  queueMicrotask(()=>enhanceDateFields(document));
  el<HTMLButtonElement>('#arRun')?.addEventListener('click',renderReport);
  el<HTMLButtonElement>('#arCsv')?.addEventListener('click',exportCsv);
  el<HTMLButtonElement>('#arPrint')?.addEventListener('click',()=>window.print());
  el<HTMLSelectElement>('#arAccount')?.addEventListener('change',()=>{if(activeReportId==='ledger')renderReport();});
  el<HTMLButtonElement>('#arBackCatalog')?.addEventListener('click',()=>{activeReportId=null;renderReportsCatalog();});
}

function renderReportRunner(reportId:string):void{
  if(!acc)return;
  const root=el<HTMLDivElement>('#accountingReportsWorkspace');if(!root)return;
  activeReportId=reportId;
  root.innerHTML=`
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:8px">
      <div>
        <p class="hint" style="margin:0 0 4px">گزارش‌ها</p>
        <h3 style="margin:0;border:0;padding:0">${esc(reportTitle(reportId))}</h3>
      </div>
      <button type="button" class="btn btn-secondary" id="arBackCatalog">همه گزارش‌ها</button>
    </div>
    <p class="hint">فقط اسناد و فاکتورهای قطعی؛ داده عملیاتی تغییر نمی‌کند.</p>
    <input type="hidden" id="arType" value="${esc(reportId)}">
    <div class="form-grid">
      <label class="field">سال مالی<select id="arPeriod"><option value="">همه سال‌های مالی</option>${acc.fiscalPeriods.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select></label>
      <label class="field">از تاریخ شمسی<input id="arFrom" placeholder="1405/01/01"></label>
      <label class="field">تا تاریخ شمسی<input id="arTo" placeholder="1405/12/29"></label>
      <label class="field" id="arAccountWrap" ${reportId==='ledger'?'':'hidden'}>حساب<select id="arAccount"><option value="">انتخاب حساب</option>${acc.accounts.filter(a=>a.isActive&&a.level==='detail').map(a=>`<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('')}</select></label>
    </div>
    <div class="actions" style="margin:10px 0">
      <button class="btn btn-primary" id="arRun">تهیه گزارش</button>
      <button class="btn btn-secondary" id="arCsv">خروجی Excel (CSV)</button>
      <button class="btn btn-secondary" id="arPrint">چاپ / PDF</button>
    </div>
    <div id="arResult"><p class="hint">بازه را مشخص کنید و «تهیه گزارش» را بزنید.</p></div>
  </div>`;
  bindReportRunner();
  if(reportId!=='ledger')renderReport();
}

function renderReportsCatalog():void{
  const root=el<HTMLDivElement>('#accountingReportsWorkspace');if(!root)return;
  activeReportId=null;
  root.innerHTML=`
  <div class="card">
    <h3>گزارش‌ها</h3>
    <p class="hint">همه گزارش‌های حسابداری، بازرگانی، اشخاص، نقد و موجودی از این بخش در دسترس هستند.</p>
    ${REPORT_CATALOG.map(g=>`
      <div style="margin-top:18px">
        <h4 style="margin:0 0 10px;color:var(--primary-dark);font-size:0.95rem">${esc(g.group)}</h4>
        <div class="accounting-home-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">
          ${g.items.map(it=>`
            <button type="button" class="accounting-home-tile" data-report-id="${esc(it.id)}" style="min-height:96px">
              <strong>${esc(it.title)}</strong>
              <span class="hint">${esc(it.desc)}</span>
            </button>`).join('')}
        </div>
      </div>`).join('')}
  </div>`;
  queueMicrotask(()=>enhanceDateFields(root));
  root.querySelectorAll<HTMLButtonElement>('[data-report-id]').forEach(btn=>{
    btn.addEventListener('click',()=>renderReportRunner(btn.dataset.reportId||'trial'));
  });
}

export async function initAccountingReportsUI():Promise<void>{
  try{
    [acc,commerce,costing]=await Promise.all([loadAccountingData(),loadCommerceData(),loadInventoryCostData()]);
    const root=el<HTMLDivElement>('#accountingReportsWorkspace');if(!root)return;
    renderReportsCatalog();
    window.addEventListener('accounting:data-updated',async()=>{
      [acc,commerce,costing]=await Promise.all([loadAccountingData(),loadCommerceData(),loadInventoryCostData()]);
      if(activeReportId)renderReport();
      else renderReportsCatalog();
    });
  }catch(e){
    console.error('[Anbarin] accounting reports init failed',e);
    toast('بارگذاری گزارش‌های مالی انجام نشد','error');
  }
}
