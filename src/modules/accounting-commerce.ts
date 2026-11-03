/** گردش تجاری حسابداری و اتصال فاکتور به موجودی و بهای تمام‌شده — فاز ۲۳. */
import { idbGet, idbPut } from './storage';
import { products, save as saveAppState, flushSave, logAudit } from './state';
import { loadInventoryCostData, saveInventoryCostData, receiveStock, issueStock, seedOpeningStock } from './inventory-costing';
import {
  loadAccountingData, saveAccountingData, upsertJournalEntry, postJournalEntry,
  type AccountingData, type JournalEntry, type JournalLine,
} from './accounting';

export type PartyType = 'customer' | 'supplier' | 'both';
export type InvoiceType = 'sale' | 'purchase';
export type CommercialStatus = 'draft' | 'posted';
export interface AccountingParty {
  id: string; type: PartyType; name: string; nationalId: string; phone: string; address: string;
  isActive: boolean; createdAt: string; updatedAt: string;
}
export interface CommercialInvoiceLine {
  id: string; description: string; quantityMilli: number; unitPriceRial: number; totalRial: number; productId?: string; warehouse?: string;
}
export interface CommercialInvoice {
  id: string; type: InvoiceType; number: string; date: string; fiscalPeriodId: string; partyId: string;
  description: string; lines: CommercialInvoiceLine[]; netRial: number; taxRial: number; grossRial: number;
  status: CommercialStatus; journalEntryId?: string; createdAt: string; updatedAt: string;
}
export interface CashTransaction {
  id: string; type: 'receipt' | 'payment'; number: string; date: string; fiscalPeriodId: string;
  partyId: string; cashAccountId: string; amountRial: number; description: string;
  journalEntryId: string; createdAt: string;
}
export interface CommerceData {
  schemaVersion: 1; parties: AccountingParty[]; invoices: CommercialInvoice[]; cashTransactions: CashTransaction[];
}

const KEY = 'accounting_phase22_commerce';
const BACKUP = 'accounting_phase22_commerce_backup';
const now = () => new Date().toISOString();
const makeId = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
const isSafeMoney = (n: number) => Number.isSafeInteger(n) && n >= 0;

export function emptyCommerceData(): CommerceData { return { schemaVersion: 1, parties: [], invoices: [], cashTransactions: [] }; }
function validCommerceData(v: unknown): v is CommerceData {
  if (!v || typeof v !== 'object') return false;
  const x = v as Partial<CommerceData>;
  return x.schemaVersion === 1 && Array.isArray(x.parties) && Array.isArray(x.invoices) && Array.isArray(x.cashTransactions);
}
export async function loadCommerceData(): Promise<CommerceData> {
  try { const v = await idbGet<unknown>(KEY); if (validCommerceData(v)) return v; } catch (e) { console.warn('commerce read failed', e); }
  try { const v = await idbGet<unknown>(BACKUP); if (validCommerceData(v)) return v; } catch (e) { console.warn('commerce backup read failed', e); }
  return emptyCommerceData();
}
export async function saveCommerceData(v: CommerceData): Promise<void> {
  if (!validCommerceData(v)) throw new Error('ساختار اطلاعات فاکتور و دریافت‌وپرداخت معتبر نیست.');
  await idbPut(BACKUP, v); await idbPut(KEY, v);
}

/** افزودن حساب‌های سیستمی فاز ۲۲ حتی اگر کدینگ قبلاً مقداردهی شده باشد. */
export async function ensureCommerceAccounts(): Promise<AccountingData> {
  const data = await loadAccountingData();
  const additions = [
    { id:'sub-purchases', code:'5102', title:'خرید کالا', level:'subsidiary' as const, nature:'debit' as const, parentId:'acc-cogs' },
    { id:'det-purchases', code:'510201', title:'خرید کالا و مواد', level:'detail' as const, nature:'debit' as const, parentId:'sub-purchases' },
    { id:'det-inventory', code:'110301', title:'موجودی کالای انبار', level:'detail' as const, nature:'debit' as const, parentId:'sub-inventory' },
    { id:'sub-input-tax', code:'1104', title:'مالیات و عوارض ارزش افزوده خرید', level:'subsidiary' as const, nature:'debit' as const, parentId:'acc-current-assets' },
    { id:'det-input-tax', code:'110401', title:'مالیات ارزش افزوده خرید', level:'detail' as const, nature:'debit' as const, parentId:'sub-input-tax' },
    { id:'sub-output-tax', code:'2102', title:'مالیات و عوارض ارزش افزوده فروش', level:'subsidiary' as const, nature:'credit' as const, parentId:'acc-current-liabilities' },
    { id:'det-output-tax', code:'210201', title:'مالیات ارزش افزوده فروش', level:'detail' as const, nature:'credit' as const, parentId:'sub-output-tax' },
  ];
  const timestamp = now();
  let changed = false;
  for (const a of additions) {
    if (data.accounts.some(x => x.id === a.id)) continue;
    if (data.accounts.some(x => x.code === a.code)) continue; // احترام به کدینگ ویرایش‌شده مشتری
    if (!data.accounts.some(x => x.id === a.parentId)) continue;
    data.accounts.push({ ...a, isActive:true, isSystem:true, createdAt:timestamp, updatedAt:timestamp }); changed = true;
  }
  if (changed) await saveAccountingData(data);
  return data;
}

export function upsertParty(data: CommerceData, input: Omit<AccountingParty,'id'|'createdAt'|'updatedAt'> & {id?:string}): CommerceData {
  const name = input.name.trim();
  if (!name) throw new Error('نام مشتری یا تأمین‌کننده الزامی است.');
  const nationalId = input.nationalId.trim();
  if (nationalId && !/^[0-9]{10,14}$/.test(nationalId)) throw new Error('شناسه ملی/کد اقتصادی باید ۱۰ تا ۱۴ رقم باشد.');
  if (nationalId && data.parties.some(p => p.id !== input.id && p.nationalId === nationalId)) throw new Error('این شناسه قبلاً برای شخص دیگری ثبت شده است.');
  const existing = input.id ? data.parties.find(p => p.id === input.id) : undefined;
  if (input.id && !existing) throw new Error('شخص موردنظر پیدا نشد.');
  const timestamp = now();
  const party: AccountingParty = { ...input, id:existing?.id || makeId('party'), name, nationalId, phone:input.phone.trim(), address:input.address.trim(), createdAt:existing?.createdAt || timestamp, updatedAt:timestamp };
  return { ...data, parties: existing ? data.parties.map(p=>p.id===party.id?party:p) : [...data.parties,party] };
}

function validateDateAndPeriod(date: string, periodId: string, accounting: AccountingData): void {
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) throw new Error('تاریخ باید به شکل سال/ماه/روز شمسی باشد.');
  const period = accounting.fiscalPeriods.find(p=>p.id===periodId);
  if (!period || period.status !== 'open') throw new Error('سال مالی معتبر و باز انتخاب کنید.');
  if (date < period.startDate || date > period.endDate) throw new Error('تاریخ سند خارج از محدوده سال مالی است.');
}
function requireAccount(accounting: AccountingData, id: string, title: string): void {
  const a = accounting.accounts.find(x=>x.id===id && x.isActive && x.level==='detail');
  if (!a) throw new Error(`حساب تفصیلی فعال «${title}» در کدینگ پیدا نشد؛ کدینگ را بررسی کنید.`);
}
function journalLine(accountId: string, description: string, debitRial: number, creditRial: number, partyId?: string): JournalLine {
  return { id:makeId('line'), accountId, description, debitRial, creditRial, ...(partyId?{partyId}:{}) };
}
function journalBase(id: string, number: string, periodId: string, date: string, description: string, source: JournalEntry['source'], lines: JournalLine[]): JournalEntry {
  return { id:makeId('je'), number:`${number}-${Date.now().toString().slice(-5)}-${Math.random().toString(36).slice(2,5)}`,  fiscalPeriodId:periodId, date, description, status:'draft', source, sourceDocumentId:id, lines, createdAt:now(), updatedAt:now() };
}
async function persistPostedJournal(accounting: AccountingData, entry: JournalEntry): Promise<string> {
  const already = accounting.journalEntries.find(j=>j.sourceDocumentId===entry.sourceDocumentId && j.status==='posted');
  if (already) return already.id;
  const withDraft = upsertJournalEntry(accounting, entry);
  const posted = postJournalEntry(withDraft, entry.id);
  await saveAccountingData(posted);
  return entry.id;
}

export function buildInvoice(input: {
  type: InvoiceType; number: string; date: string; fiscalPeriodId: string; partyId: string;
  description: string; lines: Array<{description:string; quantityMilli:number; unitPriceRial:number; productId?:string; warehouse?:string}>; taxRial:number;
}, parties: AccountingParty[]): CommercialInvoice {
  const party = parties.find(p=>p.id===input.partyId && p.isActive);
  if (!party || !(party.type==='both' || (input.type==='sale'?party.type==='customer':party.type==='supplier'))) throw new Error('طرف حساب فعال و متناسب با نوع فاکتور انتخاب کنید.');
  const number = input.number.trim(); if (!number) throw new Error('شماره فاکتور الزامی است.');
  if (!input.lines.length) throw new Error('فاکتور باید حداقل یک ردیف کالا یا خدمت داشته باشد.');
  const lines: CommercialInvoiceLine[] = input.lines.map(l=>{
    const description=l.description.trim();
    if (!description) throw new Error('شرح ردیف فاکتور الزامی است.');
    if (!Number.isSafeInteger(l.quantityMilli) || l.quantityMilli<=0) throw new Error('تعداد باید بیشتر از صفر و حداکثر سه رقم اعشار داشته باشد.');
    if (!isSafeMoney(l.unitPriceRial) || l.unitPriceRial<=0) throw new Error('قیمت واحد باید عدد صحیح ریال و بیشتر از صفر باشد.');
    const product = l.quantityMilli * l.unitPriceRial;
    if (!Number.isSafeInteger(product)) throw new Error('حاصل تعداد در قیمت از محدوده مجاز محاسبات خارج است.');
    const totalRial = Math.floor((product + 500) / 1000);
    if (!isSafeMoney(totalRial) || totalRial<=0) throw new Error('مبلغ ردیف معتبر نیست.');
    return {id:makeId('item'),description,quantityMilli:l.quantityMilli,unitPriceRial:l.unitPriceRial,totalRial,...(l.productId?{productId:l.productId,warehouse:l.warehouse||'انبار اصلی'}:{})};
  });
  const netRial=lines.reduce((s,l)=>s+l.totalRial,0);
  if (!Number.isSafeInteger(netRial) || !isSafeMoney(input.taxRial)) throw new Error('مبلغ کل یا مالیات از محدوده مجاز خارج است.');
  const grossRial=netRial+input.taxRial;
  if (!Number.isSafeInteger(grossRial) || grossRial<=0) throw new Error('جمع نهایی فاکتور معتبر نیست.');
  return {id:makeId('invoice'),type:input.type,number,date:input.date,fiscalPeriodId:input.fiscalPeriodId,partyId:party.id,description:input.description.trim(),lines,netRial,taxRial:input.taxRial,grossRial,status:'draft',createdAt:now(),updatedAt:now()};
}

export async function postInvoice(invoiceId: string, commerce: CommerceData): Promise<{commerce:CommerceData; accounting:AccountingData}> {
  const invoice=commerce.invoices.find(i=>i.id===invoiceId); if(!invoice) throw new Error('فاکتور پیدا نشد.');
  if(invoice.status==='posted') return {commerce,accounting:await loadAccountingData()};
  const accounting=await loadAccountingData(); validateDateAndPeriod(invoice.date,invoice.fiscalPeriodId,accounting);
  const party=commerce.parties.find(p=>p.id===invoice.partyId && p.isActive); if(!party) throw new Error('طرف حساب فاکتور غیرفعال یا حذف شده است.');
  const ar='det-customers', ap='det-suppliers', sales='det-sales-goods', inventory='det-inventory', cogs='det-cogs-goods', purchases='det-purchases', inputTax='det-input-tax', outputTax='det-output-tax';
  const stockLines=invoice.lines.filter(l=>l.productId);
  const needed=invoice.type==='sale'?[ar,sales,inventory,cogs,...(invoice.taxRial?[outputTax]:[])]:[inventory,purchases,cogs,ap,...(invoice.taxRial?[inputTax]:[])];
  for(const id of needed) requireAccount(accounting,id,id);
  const costing=await loadInventoryCostData(); let inventoryValue=0; let cogsValue=0; let purchaseCogsAdjustment=0; let provisional=false;
  const touched=new Set<string>();
  const alreadyApplied=new Set(costing.movements.filter(m=>m.sourceDocumentId===invoice.id).map(m=>m.productId));
  for(const line of stockLines){
    const product=products.find(p=>p.id===line.productId); if(!product) throw new Error(`کالای ردیف «${line.description}» دیگر در انبار وجود ندارد.`);
    const warehouse=line.warehouse||product.warehouse||'انبار اصلی';
    if((product.warehouse||'انبار اصلی')!==warehouse) throw new Error(`کالای «${product.name}» در انبار «${product.warehouse||'انبار اصلی'}» تعریف شده است؛ انبار فاکتور را اصلاح کنید.`);
    if(touched.has(product.id)) throw new Error(`کالای «${product.name}» در چند ردیف تکرار شده است؛ ردیف‌ها را یکی کنید.`); touched.add(product.id);
    if(alreadyApplied.has(product.id)) continue;
    seedOpeningStock(costing,product.id,warehouse,Math.round((Number(product.systemQty)||0)*1000));
    if(invoice.type==='purchase'){
      const result=receiveStock(costing,{productId:product.id,warehouse,qtyMilli:line.quantityMilli,unitCostRial:line.unitPriceRial,date:invoice.date,sourceDocumentId:invoice.id}); inventoryValue+=result.inventoryValueRial; purchaseCogsAdjustment+=result.negativeOffsetCostRial;
    }else{
      const allowNegative=!!accounting.settings.allowNegativeStockByWarehouse[warehouse];
      const result=issueStock(costing,{productId:product.id,warehouse,qtyMilli:line.quantityMilli,date:invoice.date,sourceDocumentId:invoice.id,method:accounting.settings.defaultCostingMethod,allowNegative});
      cogsValue+=result.totalCostRial; provisional=provisional||result.provisional;
    }
  }
  // کنترل موجودی عملیاتی و اعمال تغییر فقط پس از اعتبارسنجی همه ردیف‌ها
  for(const line of stockLines){const p=products.find(x=>x.id===line.productId)!;const qty=line.quantityMilli/1000;if(invoice.type==='sale'&&!accounting.settings.allowNegativeStockByWarehouse[line.warehouse||p.warehouse||'انبار اصلی']&&p.systemQty<qty)throw new Error(`موجودی کالای «${p.name}» کافی نیست.`);}
  const lines:JournalLine[]=[];
  if(invoice.type==='sale'){
    lines.push(journalLine(ar,'حساب دریافتنی مشتری',invoice.grossRial,0,party.id),journalLine(sales,'فروش کالا و خدمات',0,invoice.netRial));
    if(invoice.taxRial)lines.push(journalLine(outputTax,'مالیات ارزش افزوده فروش',0,invoice.taxRial));
    if(cogsValue)lines.push(journalLine(cogs,'بهای تمام‌شده کالای فروش‌رفته',cogsValue,0),journalLine(inventory,'کاهش موجودی کالا',0,cogsValue));
  }else{
    const nonStockPurchase=invoice.lines.filter(l=>!l.productId).reduce((sum,l)=>sum+l.totalRial,0);
    if(inventoryValue)lines.push(journalLine(inventory,'افزایش موجودی کالا',inventoryValue,0));
    if(nonStockPurchase)lines.push(journalLine(purchases,'خرید خدمات و اقلام غیرانبار',nonStockPurchase,0));
    if(invoice.taxRial)lines.push(journalLine(inputTax,'مالیات ارزش افزوده خرید',invoice.taxRial,0));
    lines.push(journalLine(ap,'حساب پرداختنی تأمین‌کننده',0,invoice.grossRial,party.id));
  }
  const existing=accounting.journalEntries.find(j=>j.sourceDocumentId===invoice.id && j.status==='posted');
  const journalId=existing?.id || await persistPostedJournal(accounting,journalBase(invoice.id,invoice.type==='sale'?'F':'B',invoice.fiscalPeriodId,invoice.date,invoice.description || `فاکتور ${invoice.number}`,invoice.type==='sale'?'sales':'purchase',lines));
  for(const line of stockLines){const p=products.find(x=>x.id===line.productId)!;const movement=costing.movements.find(m=>m.sourceDocumentId===invoice.id&&m.productId===p.id);if(!movement)throw new Error(`گردش انبار کالای «${p.name}» ثبت نشده است.`);const before=movement.beforeQtyMilli/1000,after=movement.afterQtyMilli/1000;if(Math.abs(p.systemQty-before)<0.000001)p.systemQty=after;else if(Math.abs(p.systemQty-after)>=0.000001)throw new Error(`موجودی کالای «${p.name}» هم‌زمان تغییر کرده است؛ فاکتور را بررسی کنید.`);}
  if(stockLines.length){await saveInventoryCostData(costing);saveAppState(true);await flushSave();logAudit('accounting_invoice_stock_posted',{invoiceId:invoice.id,number:invoice.number,type:invoice.type,items:stockLines.length,cogsRial:cogsValue,inventoryRial:inventoryValue,provisionalCost:provisional});}
  const updated={...invoice,status:'posted' as const,journalEntryId:journalId,updatedAt:now()};
  const next={...commerce,invoices:commerce.invoices.map(i=>i.id===invoice.id?updated:i)}; await saveCommerceData(next);
  return {commerce:next,accounting:await loadAccountingData()};
}

export async function createCashTransaction(input: {
  type:'receipt'|'payment'; number:string; date:string; fiscalPeriodId:string; partyId:string;
  cashAccountId:string; amountRial:number; description:string;
}, commerce:CommerceData): Promise<{commerce:CommerceData; accounting:AccountingData}> {
  const accounting=await loadAccountingData(); validateDateAndPeriod(input.date,input.fiscalPeriodId,accounting);
  if(!input.number.trim()) throw new Error('شماره رسید یا پرداخت الزامی است.');
  if(!isSafeMoney(input.amountRial)||input.amountRial<=0) throw new Error('مبلغ باید عدد صحیح ریال و بیشتر از صفر باشد.');
  const party=commerce.parties.find(p=>p.id===input.partyId && p.isActive);
  if(!party || !(party.type==='both'||(input.type==='receipt'?party.type==='customer':party.type==='supplier'))) throw new Error('طرف حساب متناسب با دریافت یا پرداخت انتخاب کنید.');
  requireAccount(accounting,input.cashAccountId,'صندوق/بانک');
  const partyAccount=input.type==='receipt'?'det-customers':'det-suppliers';
  requireAccount(accounting,partyAccount,'حساب اشخاص');
  const lines=input.type==='receipt'
    ? [journalLine(input.cashAccountId,'دریافت وجه در صندوق/بانک',input.amountRial,0),journalLine(partyAccount,'تسویه حساب مشتری',0,input.amountRial,party.id)]
    : [journalLine(partyAccount,'تسویه حساب تأمین‌کننده',input.amountRial,0,party.id),journalLine(input.cashAccountId,'پرداخت وجه از صندوق/بانک',0,input.amountRial)];
  const id=makeId(input.type); const entry=journalBase(id,input.type==='receipt'?'R':'P',input.fiscalPeriodId,input.date,input.description || (input.type==='receipt'?'دریافت از مشتری':'پرداخت به تأمین‌کننده'),input.type,lines);
  const journalEntryId=await persistPostedJournal(accounting,entry);
  const tx:CashTransaction={id,type:input.type,number:input.number.trim(),date:input.date,fiscalPeriodId:input.fiscalPeriodId,partyId:party.id,cashAccountId:input.cashAccountId,amountRial:input.amountRial,description:input.description.trim(),journalEntryId,createdAt:now()};
  const next={...commerce,cashTransactions:[...commerce.cashTransactions,tx]}; await saveCommerceData(next);
  return {commerce:next,accounting:await loadAccountingData()};
}

export function partyBalance(partyId: string, commerce: CommerceData): number {
  const sales=commerce.invoices.filter(i=>i.status==='posted'&&i.type==='sale'&&i.partyId===partyId).reduce((s,i)=>s+i.grossRial,0);
  const purchases=commerce.invoices.filter(i=>i.status==='posted'&&i.type==='purchase'&&i.partyId===partyId).reduce((s,i)=>s+i.grossRial,0);
  const receipts=commerce.cashTransactions.filter(t=>t.type==='receipt'&&t.partyId===partyId).reduce((s,t)=>s+t.amountRial,0);
  const payments=commerce.cashTransactions.filter(t=>t.type==='payment'&&t.partyId===partyId).reduce((s,t)=>s+t.amountRial,0);
  return sales-purchases-receipts+payments;
}
