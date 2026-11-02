/**
 * گزارش‌ها و خروجی‌های کاربردی انبارگردانی
 */

import type { Product } from '@/types';
import { products, settings, session, auditLog, inventoryDocs, isDoubleCount, logAudit } from './state';
import { toast } from './ui';
import { exportExcel, exportCSV, rowsToCSV, buildOfflineXlsx } from './import-export';
import { downloadFile, dateStr, formatFaNumber } from '@/utils/helpers';
import { getOperatorName } from './storage';

export interface ReportSummary {
  total: number;
  counted: number;
  uncounted: number;
  diffs: number;
  over: number;
  under: number;
  match: number;
  withPhoto: number;
  progressPct: number;
  valueDiff: number;
}

export function computeSummary(list: Product[] = products): ReportSummary {
  let counted = 0;
  let diffs = 0;
  let over = 0;
  let under = 0;
  let match = 0;
  let withPhoto = 0;
  let valueDiff = 0;

  for (const p of list) {
    if (p.photo) withPhoto++;
    if (p.countedQty == null) continue;
    counted++;
    const d = p.countedQty - (p.systemQty ?? 0);
    if (d === 0) match++;
    else {
      diffs++;
      if (d > 0) over++;
      else under++;
      valueDiff += d * (p.price || 0);
    }
  }

  const total = list.length;
  return {
    total,
    counted,
    uncounted: total - counted,
    diffs,
    over,
    under,
    match,
    withPhoto,
    progressPct: total ? Math.round((counted / total) * 100) : 0,
    valueDiff,
  };
}

function activeList(): Product[] {
  const wh = settings.currentWarehouse;
  if (!wh || wh === 'همه') return products;
  return products.filter((p) => (p.warehouse || 'انبار اصلی') === wh);
}

export function buildTextReport(): string {
  const list = activeList();
  const s = computeSummary(list);
  const lines = [
    'گزارش انبارگردانی — انبارین',
    'تاریخ: ' + new Date().toLocaleString('fa-IR'),
    'اپراتور: ' + getOperatorName(),
    'انبار: ' + (settings.currentWarehouse || '—'),
    session ? 'جلسه: ' + session.id : 'بدون جلسه',
    '────────────────',
    `کل کالا: ${s.total}`,
    `شمارش‌شده: ${s.counted} (${s.progressPct}٪)`,
    `مانده: ${s.uncounted}`,
    `تطابق: ${s.match}`,
    `مغایرت: ${s.diffs} (اضافه: ${s.over} / کسری: ${s.under})`,
    `ارزش مغایرت تقریبی: ${s.valueDiff.toLocaleString('fa-IR')}`,
    `با عکس: ${s.withPhoto}`,
  ];
  if (isDoubleCount()) {
    const review = computeDoubleCountReview(list);
    lines.push(
      '────────────────',
      'بازبینی شمارش دوفازی',
      `تکمیل فاز ۱: ${review.phase1Count}`,
      `تکمیل فاز ۲: ${review.phase2Count}`,
      `هر دو فاز تکمیل: ${review.bothCount}`,
      `نیازمند بازبینی: ${review.reviewCount}`,
      `اختلاف دو فاز: ${review.mismatchCount}`,
    );
  }
  return lines.join('\n');
}

export function exportDiffsExcel(): void {
  exportExcel(true);
}

export function exportFullExcel(): void {
  exportExcel(false);
}

/** خروجی مستقل کالاهای شمارش‌شده؛ فقط خواندن داده‌ها و بدون تغییر موجودی/شمارش. */
export function exportCountedProductsExcel(): void {
  const doubleCount = isDoubleCount();
  // در شمارش دوفازی، وجود حداقل یک مقدار ثبت‌شده در هر یک از دو فاز
  // به معنی شمارش‌شدن کالا است؛ مقدار نهایی نمایشی، فاز ۲ و در نبود آن فاز ۱ است.
  const list = activeList().filter((p) =>
    doubleCount ? p.countedQty != null || p.countedQty2 != null : p.countedQty != null
  );
  if (!list.length) {
    toast('در انبار انتخاب‌شده کالای شمارش‌شده‌ای برای خروجی وجود ندارد', 'info');
    return;
  }

  const headers = [
    'بارکد', 'کد کالا', 'نام', 'موجودی سیستم', 'تعداد شمارش‌شده', 'مغایرت', 'قیمت', 'محل',
    ...(doubleCount ? ['شمارش اول', 'شمارش دوم'] : []),
  ];
  const rows: unknown[][] = list.map((p) => {
    const effectiveCount = doubleCount
      ? (p.countedQty2 != null ? p.countedQty2 : p.countedQty)
      : p.countedQty;
    const diff = effectiveCount == null ? '' : effectiveCount - (p.systemQty ?? 0);
    return [
      String(p.code ?? '').trim(),
      String(p.sku ?? '').trim(),
      p.name ?? '',
      p.systemQty ?? 0,
      effectiveCount ?? '',
      diff,
      p.price ?? 0,
      p.location ?? '',
      ...(doubleCount ? [p.countedQty ?? '', p.countedQty2 ?? ''] : []),
    ];
  });

  try {
    const bytes = buildOfflineXlsx([{
      name: 'کالاهای شمارش‌شده',
      rows: [
        [`انبار: ${settings.currentWarehouse || 'همه'}`, `تاریخ تهیه: ${new Date().toLocaleString('fa-IR')}`],
        headers,
        ...rows,
      ],
    }]);
    const filename = `anbarin-counted-products-${dateStr()}.xlsx`;
    downloadFile(
      new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      filename,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    toast(`خروجی کالاهای شمارش‌شده آماده شد؛ ${list.length} کالا`, 'success');
    logAudit('export_counted_products_xlsx', {
      warehouse: settings.currentWarehouse || 'همه',
      count: list.length,
      doubleCount,
    });
  } catch (error) {
    console.error('Counted products XLSX export failed', error);
    toast('ساخت فایل اکسل کالاهای شمارش‌شده ناموفق بود', 'error');
  }
}

export function exportAccountingDoc(kind: 'generic' | 'heloo' | 'sepidar' = 'generic'): void {
  const list = activeList().filter(
    (p) => p.countedQty != null && p.countedQty !== p.systemQty
  );
  if (!list.length) {
    toast('مغایرتی برای سند اصلاح نیست', 'error');
    return;
  }

  if (kind === 'heloo') {
    const rows = list.map((p) => ({
      کد: p.sku || p.code || '',
      نام: p.name,
      'موجودی سیستم': p.systemQty,
      شمارش: p.countedQty,
      اختلاف: (p.countedQty ?? 0) - p.systemQty,
      انبار: p.warehouse || settings.currentWarehouse || '',
    }));
    downloadFile(rowsToCSV(rows), `heloo-adjust-${dateStr()}.csv`, 'text/csv;charset=utf-8');
    toast('خروجی قالب هلو آماده شد', 'success');
    return;
  }

  if (kind === 'sepidar') {
    const rows = list.map((p) => ({
      ItemCode: p.sku || p.code || '',
      ItemName: p.name,
      SystemQty: p.systemQty,
      CountedQty: p.countedQty,
      Diff: (p.countedQty ?? 0) - p.systemQty,
      Warehouse: p.warehouse || settings.currentWarehouse || '',
      Location: p.location || '',
    }));
    downloadFile(rowsToCSV(rows), `sepidar-adjust-${dateStr()}.csv`, 'text/csv;charset=utf-8');
    toast('خروجی قالب سپیدار آماده شد', 'success');
    return;
  }

  const rows = list.map((p) => ({
    بارکد: p.code || '',
    کد: p.sku || '',
    نام: p.name,
    'موجودی سیستم': p.systemQty,
    شمارش: p.countedQty,
    اختلاف: (p.countedQty ?? 0) - p.systemQty,
    'قیمت واحد': p.price || 0,
    'ارزش اختلاف': ((p.countedQty ?? 0) - p.systemQty) * (p.price || 0),
    محل: p.location || '',
    انبار: p.warehouse || '',
    یادداشت: p.note || '',
  }));
  downloadFile(rowsToCSV(rows), `inventory-adjust-${dateStr()}.csv`, 'text/csv;charset=utf-8');
  toast('سند اصلاح موجودی دانلود شد', 'success');
}

export type AccountingTemplateKind = 'heloo' | 'sepidar';
type AccountingField = 'barcode' | 'name' | 'code' | 'systemQty' | 'countedQty' | 'diff' | 'unitPrice' | 'diffValue' | 'unit' | 'location';
const ACCOUNTING_FIELDS: Array<{ id: AccountingField; label: string }> = [
  { id: 'barcode', label: 'بارکد' },
  { id: 'name', label: 'نام کالا' },
  { id: 'code', label: 'کد کالا' },
  { id: 'systemQty', label: 'موجودی سیستم' },
  { id: 'countedQty', label: 'موجودی شمارش‌شده' },
  { id: 'diff', label: 'مغایرت' },
  { id: 'unitPrice', label: 'قیمت واحد' },
  { id: 'diffValue', label: 'ارزش مغایرت' },
  { id: 'unit', label: 'واحد کالا' },
  { id: 'location', label: 'محل کالا' },
];
const DEFAULT_ACCOUNTING_FIELDS: AccountingField[] = ACCOUNTING_FIELDS.map((f) => f.id);
const TEMPLATE_STORAGE_PREFIX = 'anbarin_accounting_template_v1_';

function getTemplate(kind: AccountingTemplateKind): AccountingField[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_PREFIX + kind);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((v): v is AccountingField => ACCOUNTING_FIELDS.some((f) => f.id === v));
        if (valid.length) return valid;
      }
    }
  } catch (e) { console.warn('Could not read accounting template', e); }
  return [...DEFAULT_ACCOUNTING_FIELDS];
}

export function initAccountingTemplateUI(): void {
  const target = document.getElementById('accountingTemplateTarget') as HTMLSelectElement | null;
  const fieldsHost = document.getElementById('accountingTemplateFields');
  if (!target || !fieldsHost || fieldsHost.dataset.initialized === '1') return;
  fieldsHost.dataset.initialized = '1';
  fieldsHost.innerHTML = ACCOUNTING_FIELDS.map((f) => `<label class="accounting-field-option" style="display:flex;align-items:center;gap:8px;padding:6px 2px"><input type="checkbox" data-accounting-field="${f.id}" checked><span>${f.label}</span></label>`).join('');

  const applyTemplate = () => {
    const selected = getTemplate(target.value as AccountingTemplateKind);
    fieldsHost.querySelectorAll<HTMLInputElement>('input[data-accounting-field]').forEach((el) => {
      el.checked = selected.includes(el.dataset.accountingField as AccountingField);
    });
  };
  target.addEventListener('change', applyTemplate);
  document.getElementById('btnSaveAccountingTemplate')?.addEventListener('click', () => {
    const chosen = Array.from(fieldsHost.querySelectorAll<HTMLInputElement>('input[data-accounting-field]:checked'))
      .map((el) => el.dataset.accountingField as AccountingField);
    if (!chosen.length) { toast('حداقل یک ستون را انتخاب کنید', 'error'); return; }
    try {
      localStorage.setItem(TEMPLATE_STORAGE_PREFIX + target.value, JSON.stringify(chosen));
      toast(`قالب ${target.value === 'heloo' ? 'هلو' : 'سپیدار'} ذخیره شد`, 'success');
      logAudit('save_accounting_template', { kind: target.value, fields: chosen });
    } catch (e) { console.error(e); toast('ذخیره قالب ناموفق بود', 'error'); }
  });
  document.getElementById('btnExportAccountingTemplate')?.addEventListener('click', () => {
    const chosen = Array.from(fieldsHost.querySelectorAll<HTMLInputElement>('input[data-accounting-field]:checked'))
      .map((el) => el.dataset.accountingField as AccountingField);
    if (!chosen.length) { toast('حداقل یک ستون را انتخاب کنید', 'error'); return; }
    exportConfiguredAccounting(target.value as AccountingTemplateKind, chosen);
  });
  applyTemplate();
}

function exportConfiguredAccounting(kind: AccountingTemplateKind, chosen: AccountingField[]): void {
  const list = activeList().filter((p) => p.countedQty != null);
  if (!list.length) { toast('کالای شمارش‌شده‌ای برای خروجی وجود ندارد', 'error'); return; }
  const labels: Record<AccountingField, string> = {
    barcode: 'بارکد', name: 'نام کالا', code: 'کد کالا', systemQty: 'موجودی سیستم',
    countedQty: 'موجودی شمارش‌شده', diff: 'مغایرت', unitPrice: 'قیمت واحد',
    diffValue: 'ارزش مغایرت', unit: 'واحد کالا', location: 'محل کالا',
  };
  const rows = list.map((p) => {
    const diff = (p.countedQty ?? 0) - (p.systemQty ?? 0);
    const values: Record<AccountingField, unknown> = {
      // Barcode is intentionally a string cell to preserve leading zeros.
      barcode: String(p.code ?? '').trim(),
      name: p.name ?? '',
      code: String(p.sku ?? p.code ?? '').trim(),
      systemQty: p.systemQty ?? 0,
      countedQty: p.countedQty ?? 0,
      diff,
      unitPrice: p.price ?? 0,
      diffValue: diff * (p.price ?? 0),
      unit: p.unit ?? '',
      location: p.location ?? '',
    };
    return chosen.map((field) => values[field]);
  });
  const headers = chosen.map((field) => labels[field]);
  const filename = `anbarin-${kind === 'heloo' ? 'heloo' : 'sepidar'}-custom-${dateStr()}.xlsx`;
  try {
    const bytes = buildOfflineXlsx([{ name: kind === 'heloo' ? 'خروجی هلو' : 'خروجی سپیدار', rows: [headers, ...rows] }]);
    downloadFile(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast(`فایل اکسل ساخته شد؛ ${list.length} کالا و ${chosen.length} ستون`, 'success');
    logAudit('export_accounting_custom_xlsx', { kind, count: list.length, fields: chosen });
  } catch (error) {
    console.error('Custom accounting XLSX export failed', error);
    toast('ساخت فایل اکسل ناموفق بود', 'error');
  }
}


export interface DoubleCountReview {
  phase1Count: number;
  phase2Count: number;
  bothCount: number;
  reviewCount: number;
  mismatchCount: number;
}

export function computeDoubleCountReview(list: Product[] = activeList()): DoubleCountReview {
  let phase1Count = 0, phase2Count = 0, bothCount = 0, reviewCount = 0, mismatchCount = 0;
  for (const p of list) {
    const has1 = p.countedQty != null;
    const has2 = p.countedQty2 != null;
    if (has1) phase1Count++;
    if (has2) phase2Count++;
    if (has1 && has2) {
      bothCount++;
      if (p.countedQty !== p.countedQty2) mismatchCount++;
    } else {
      reviewCount++;
    }
  }
  return { phase1Count, phase2Count, bothCount, reviewCount, mismatchCount };
}

export function exportDoubleCountMismatches(): void {
  if (!isDoubleCount()) {
    toast('شمارش دوفازی فعال نیست', 'info');
    return;
  }
  // Export incomplete items as well as unequal counts so an unfinished phase
  // cannot be mistaken for a clean reconciliation. Never overwrite either count.
  const list = activeList().filter((p) =>
    p.countedQty == null || p.countedQty2 == null || p.countedQty !== p.countedQty2
  );
  if (!list.length) {
    toast('همه کالاها در هر دو فاز شمارش شده و برابر هستند', 'info');
    return;
  }
  const rows = list.map((p) => {
    const has1 = p.countedQty != null;
    const has2 = p.countedQty2 != null;
    return {
      بارکد: p.code || '',
      نام: p.name,
      'شمارش ۱': has1 ? p.countedQty : '',
      'شمارش ۲': has2 ? p.countedQty2 : '',
      اختلاف: has1 && has2 ? (p.countedQty2 as number) - (p.countedQty as number) : '',
      وضعیت: !has1 && !has2 ? 'هیچ‌کدام شمارش نشده' : !has1 ? 'فاز ۱ ناقص' : !has2 ? 'فاز ۲ ناقص' : 'اختلاف دو فاز',
      سیستم: p.systemQty,
      محل: p.location || '',
    };
  });
  downloadFile(rowsToCSV(rows), `double-count-review-${dateStr()}.csv`, 'text/csv;charset=utf-8');
  toast(`${list.length} کالا برای بازبینی خروجی گرفته شد`, 'success');
}





/** گردش مقداری اسناد تأییدشده؛ ارزش صرفاً برآوردی و با قیمت فعلی کالا است. */
export interface InventoryMovementSummary {
  kind: string;
  documentCount: number;
  totalQty: number;
  estimatedValue: number;
}
export function getInventoryMovementSummary(): InventoryMovementSummary[] {
  const kinds: Array<{ key: string; label: string }> = [
    { key: 'receipt', label: 'رسید' },
    { key: 'issue', label: 'حواله' },
    { key: 'adjustment', label: 'اصلاح موجودی' },
    { key: 'transfer', label: 'انتقال' },
  ];
  const currentWarehouse = settings.currentWarehouse || '';
  return kinds.map(({ key, label }) => {
    const docs = (inventoryDocs || []).filter((doc) =>
      doc.status === 'approved' && doc.kind === key &&
      (!currentWarehouse || doc.warehouse === currentWarehouse || doc.destinationWarehouse === currentWarehouse)
    );
    let totalQty = 0;
    let estimatedValue = 0;
    for (const doc of docs) {
      for (const line of (doc.lines || [])) {
        const product = products.find((p) => p.id === line.productId);
        const qty = Number(line.qty);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        totalQty += qty;
        estimatedValue += qty * Number(product?.price || 0);
      }
    }
    return { kind: label, documentCount: docs.length, totalQty, estimatedValue };
  });
}
export function renderInventoryMovementPanel(): string {
  const rows = getInventoryMovementSummary();
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
  const body = rows.map((r) => `<tr><td>${esc(r.kind)}</td><td>${formatFaNumber(r.documentCount)}</td><td>${formatFaNumber(r.totalQty)}</td><td>${formatFaNumber(Math.round(r.estimatedValue))}</td></tr>`).join('');
  const csv = rowsToCSV(rows.map((r) => ({
    نوع_سند: r.kind, تعداد_اسناد: r.documentCount, جمع_تعداد: r.totalQty,
    ارزش_برآوردی_با_قیمت_فعلی: Math.round(r.estimatedValue),
  })));
  return `<section class="card" style="margin-top:14px;padding:12px">
    <h3 style="margin:0 0 6px">📦 گردش اسناد انبار</h3>
    <p class="hint">فقط اسناد تأییدشده محاسبه می‌شوند. ارزش‌ها برآوردی و بر اساس قیمت فعلی کالا هستند، نه قیمت تاریخی خرید یا فروش.</p>
    <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>نوع سند</th><th>تعداد اسناد</th><th>جمع تعداد</th><th>ارزش برآوردی</th></tr></thead><tbody>${body}</tbody></table></div>
    <button class="btn btn-secondary btn-block" id="btnMovementSummaryCSV" style="margin-top:8px">خروجی CSV گردش اسناد</button>
    <textarea id="movementSummaryCSVData" hidden>${esc(csv)}</textarea>
  </section>`;
}

/** داشبورد مدیریتی بر پایه موجودی ثبت‌شده؛ شمارش موقت را در ارزش موجودی دخالت نمی‌دهد. */
export function renderManagementDashboard(): string {
  const list = activeList();
  const alerts = getStockAlertRows();
  const totalQty = list.reduce((sum, p) => sum + Number(p.systemQty || 0), 0);
  const stockValue = list.reduce((sum, p) => sum + Number(p.systemQty || 0) * Number(p.price || 0), 0);
  const counted = list.filter((p) => p.countedQty != null).length;
  const low = alerts.filter((r) => r.status.includes('کم‌موجود')).length;
  const over = alerts.filter((r) => r.status.includes('بیش‌موجود')).length;
  const expired = alerts.filter((r) => r.status.includes('منقضی‌شده')).length;
  const nearExpiry = alerts.filter((r) => r.status.includes('انقضای تا ۳۰ روز')).length;
  const warehouseCount = new Set(list.map((p) => p.warehouse || 'انبار اصلی')).size;
  const money = (n: number) => formatFaNumber(Math.round(n));
  return `<section class="card" style="margin:0 0 14px;padding:12px;border:1px solid var(--border,#ddd)">
    <h3 style="margin:0 0 4px">📊 داشبورد مدیریتی</h3>
    <p class="hint" style="margin:0 0 10px">خلاصه وضعیت ${String(settings.currentWarehouse || 'همه انبارها').replace(/[&<>"']/g, '')} بر اساس موجودی ثبت‌شده در سیستم</p>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${formatFaNumber(list.length)}</div><div class="stat-label">تعداد کالا</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(totalQty)}</div><div class="stat-label">جمع تعداد موجودی</div></div>
      <div class="stat-card"><div class="stat-value">${money(stockValue)}</div><div class="stat-label">ارزش تقریبی موجودی</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(warehouseCount)}</div><div class="stat-label">تعداد انبار</div></div>
    </div>
    <div class="stats-grid" style="margin-top:8px">
      <div class="stat-card"><div class="stat-value">${formatFaNumber(counted)}</div><div class="stat-label">شمارش‌شده</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(list.length - counted)}</div><div class="stat-label">شمارش‌نشده</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(low)}</div><div class="stat-label">کم‌موجود</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(over)}</div><div class="stat-label">بیش‌موجود</div></div>
    </div>
    <p class="hint" style="margin:9px 0 0">منقضی‌شده: <strong>${formatFaNumber(expired)}</strong> · انقضای ۳۰ روز آینده: <strong>${formatFaNumber(nearExpiry)}</strong></p>
    <p class="hint" style="margin:4px 0 0">ارزش تقریبی از حاصل‌ضرب موجودی سیستم در قیمت ثبت‌شده محاسبه می‌شود؛ کالاهای بدون قیمت، صفر لحاظ می‌شوند.</p>
  </section>`;
}


export interface StockAlertRow {
  code: string; name: string; warehouse: string; location: string;
  quantity: number; min: number | null; max: number | null; expiry: string;
  status: string;
}

/** هشدارها بر اساس موجودی عملیاتی systemQty هستند؛ شمارش موقت مبنا نیست. */
export function getStockAlertRows(): StockAlertRow[] {
  const today = new Date();
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
  return activeList().map((p) => {
    const q = Number(p.systemQty ?? 0);
    const min = p.minQty == null ? null : Number(p.minQty);
    const max = p.maxQty == null ? null : Number(p.maxQty);
    const expiry = p.expiry || '';
    const expiryDate = expiry ? new Date(`${expiry}T00:00:00`) : null;
    const statuses: string[] = [];
    if (min != null && q < min) statuses.push('کم‌موجود');
    else if (min != null && min > 0 && q <= min * 1.2) statuses.push('نزدیک حداقل');
    if (max != null && q > max) statuses.push('بیش‌موجود');
    if (expiryDate && !Number.isNaN(expiryDate.getTime())) {
      if (expiryDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) statuses.push('منقضی‌شده');
      else if (expiryDate <= horizon) statuses.push('انقضای تا ۳۰ روز');
    }
    return { code: p.code || p.sku || '', name: p.name, warehouse: p.warehouse || 'انبار اصلی', location: p.location || '', quantity: q, min, max, expiry, status: statuses.join('، ') };
  }).filter((r) => !!r.status);
}

export function renderStockAlertsPanel(): string {
  const rows = getStockAlertRows();
  const count = (key: string) => rows.filter((r) => r.status.includes(key)).length;
  const escHtml = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
  const body = rows.slice(0, 80).map((r) => `<tr><td>${escHtml(r.name)}</td><td>${escHtml(r.code)}</td><td>${escHtml(r.warehouse)}</td><td>${formatFaNumber(r.quantity)}</td><td>${r.min == null ? '—' : formatFaNumber(r.min)}</td><td>${escHtml(r.expiry || '—')}</td><td>${escHtml(r.status)}</td></tr>`).join('');
  return `<section class="card" style="margin-top:14px;padding:12px"><h3 style="margin:0 0 8px">🔔 هشدار هوشمند موجودی</h3><p class="hint">مبنای هشدار، موجودی ثبت‌شده در سیستم است؛ شمارش موقت تا زمان اعمال نهایی اثری ندارد. نزدیک حداقل یعنی موجودی حداکثر تا ۲۰٪ بالاتر از حداقل باشد؛ هشدار انقضا برای ۳۰ روز آینده است.</p><div class="stats-grid"><div class="stat-card"><div class="stat-value">${formatFaNumber(rows.length)}</div><div class="stat-label">کل هشدارها</div></div><div class="stat-card"><div class="stat-value">${formatFaNumber(count('کم‌موجود'))}</div><div class="stat-label">کم‌موجود</div></div><div class="stat-card"><div class="stat-value">${formatFaNumber(count('نزدیک حداقل'))}</div><div class="stat-label">نزدیک حداقل</div></div><div class="stat-card"><div class="stat-value">${formatFaNumber(count('انقضا'))}</div><div class="stat-label">هشدار انقضا</div></div></div><div class="actions" style="margin:10px 0"><button class="btn btn-success btn-block" id="btnStockAlertsExcel">📊 خروجی Excel هشدارها</button><button class="btn btn-secondary btn-block" id="btnStockAlertsPdf">🖨️ چاپ / ذخیره PDF</button></div>${rows.length ? `<div style="overflow:auto"><table class="data-table"><thead><tr><th>کالا</th><th>کد</th><th>انبار</th><th>موجودی</th><th>حداقل</th><th>انقضا</th><th>وضعیت</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="hint">در حال حاضر هشداری وجود ندارد.</p>'}</section>`;
}

export function exportStockAlertsExcel(): void {
  const rows = getStockAlertRows();
  if (!rows.length) { toast('هشداری برای خروجی وجود ندارد', 'info'); return; }
  const data = [['نام کالا','کد کالا','انبار','محل','موجودی سیستم','حداقل','حداکثر','تاریخ انقضا','وضعیت'], ...rows.map(r => [r.name,r.code,r.warehouse,r.location,r.quantity,r.min ?? '',r.max ?? '',r.expiry,r.status])];
  try {
    const bytes = buildOfflineXlsx([{ name: 'هشدار موجودی', rows: data }]);
    downloadFile(new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), `stock-alerts-${dateStr()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    logAudit('export_stock_alerts_xlsx', {count: rows.length});
    toast(`خروجی ${rows.length} هشدار آماده شد`, 'success');
  } catch (e) { console.error(e); toast('ساخت فایل Excel ناموفق بود', 'error'); }
}

export function printStockAlerts(): void {
  const rows = getStockAlertRows();
  if (!rows.length) { toast('هشداری برای چاپ وجود ندارد', 'info'); return; }
  const escHtml = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
  const w = window.open('', '_blank');
  if (!w) { toast('مرورگر اجازه بازکردن پنجره چاپ را نداد', 'error'); return; }
  const rowsHtml = rows.map(r => `<tr><td>${escHtml(r.name)}</td><td>${escHtml(r.code)}</td><td>${escHtml(r.warehouse)}</td><td>${formatFaNumber(r.quantity)}</td><td>${r.min == null ? '—' : formatFaNumber(r.min)}</td><td>${escHtml(r.expiry || '—')}</td><td>${escHtml(r.status)}</td></tr>`).join('');
  w.document.write(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>گزارش هشدار موجودی انبارین</title><style>body{font-family:Tahoma,sans-serif;padding:20px;color:#18352b}h2{color:#176b4b}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:7px;text-align:right;font-size:12px}th{background:#e7f2ec}@media print{button{display:none}}</style><h2>گزارش هشدار موجودی انبارین</h2><p>تاریخ: ${new Date().toLocaleString('fa-IR')} | تعداد هشدار: ${rows.length}</p><table><thead><tr><th>کالا</th><th>کد</th><th>انبار</th><th>موجودی</th><th>حداقل</th><th>انقضا</th><th>وضعیت</th></tr></thead><tbody>${rowsHtml}</tbody></table><script>window.onload=()=>window.print()<\/script></html>`);
  w.document.close();
  logAudit('print_stock_alerts', {count: rows.length});
}

export function exportStockAlerts(): void {
  const list = activeList().filter((p) => {
    const q = p.countedQty ?? p.systemQty ?? 0;
    if (p.minQty != null && q < p.minQty) return true;
    if (p.maxQty != null && q > p.maxQty) return true;
    return false;
  });
  if (!list.length) {
    toast('هشدار موجودی نیست', 'info');
    return;
  }
  const rows = list.map((p) => {
    const q = p.countedQty ?? p.systemQty ?? 0;
    let status = '';
    if (p.minQty != null && q < p.minQty) status = 'کم‌موجود';
    if (p.maxQty != null && q > p.maxQty) status = status ? status + '+بیش‌موجود' : 'بیش‌موجود';
    return {
      بارکد: p.code || '',
      نام: p.name,
      موجودی: q,
      حداقل: p.minQty ?? '',
      حداکثر: p.maxQty ?? '',
      وضعیت: status,
    };
  });
  downloadFile(rowsToCSV(rows), `stock-alerts-${dateStr()}.csv`, 'text/csv;charset=utf-8');
  toast(`${list.length} هشدار دانلود شد`, 'success');
}

export function copyTextReport(): void {
  const text = buildTextReport();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => toast('گزارش کپی شد', 'success'),
      () => fallbackCopy(text)
    );
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast('گزارش کپی شد', 'success');
  } catch {
    toast('کپی ممکن نشد', 'error');
  }
  document.body.removeChild(ta);
}



/** نمایش تاریخچه محلی عملیات ثبت‌شده؛ این گزارش جایگزین لاگ سرور یا ردپای غیرقابل‌دستکاری نیست. */
export function renderActivityHistoryPanel(): string {
  const entries = [...(auditLog || [])].slice(-100).reverse();
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
  const detailText = (detail: Record<string, unknown> | undefined) => {
    if (!detail) return '';
    try { return Object.entries(detail).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' | '); }
    catch { return ''; }
  };
  const rows = entries.map((e) => ({
    زمان: e.ts || '', کاربر: e.operator || 'نامشخص',
    عملیات: e.action || '', جزئیات: detailText(e.detail),
  }));
  const body = entries.length ? entries.map((e) => `<tr><td>${esc(e.ts)}</td><td>${esc(e.operator || 'نامشخص')}</td><td>${esc(e.action)}</td><td style="white-space:normal;max-width:260px">${esc(detailText(e.detail))}</td></tr>`).join('') :
    '<tr><td colspan="4">هنوز رویدادی در تاریخچه ثبت نشده است.</td></tr>';
  const csv = rowsToCSV(rows);
  return `<section class="card" style="margin-top:14px;padding:12px">
    <h3 style="margin:0 0 6px">🧾 تاریخچه عملیات کاربران</h3>
    <p class="hint">آخرین ۱۰۰ رویداد از گزارش محلی برنامه نمایش داده می‌شود. تاریخچه فعلی محدود به رویدادهایی است که برنامه در audit log ثبت کرده است.</p>
    <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>زمان</th><th>کاربر</th><th>عملیات</th><th>جزئیات</th></tr></thead><tbody>${body}</tbody></table></div>
    <button class="btn btn-secondary btn-block" id="btnActivityHistoryCSV" style="margin-top:8px">خروجی CSV تاریخچه</button>
    <textarea id="activityHistoryCSVData" hidden>${esc(csv)}</textarea>
  </section>`;
}

export function renderReportHTML(): string {
  const s = computeSummary(activeList());
  return `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${formatFaNumber(s.total)}</div><div class="stat-label">کل</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(s.counted)}</div><div class="stat-label">شمارش‌شده</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(s.uncounted)}</div><div class="stat-label">مانده</div></div>
      <div class="stat-card"><div class="stat-value">${s.progressPct}٪</div><div class="stat-label">پیشرفت</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(s.match)}</div><div class="stat-label">تطابق</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(s.diffs)}</div><div class="stat-label">مغایرت</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(s.over)}</div><div class="stat-label">اضافه</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(s.under)}</div><div class="stat-label">کسری</div></div>
    </div>
    <p class="hint" style="margin-top:12px">ارزش تقریبی مغایرت: <strong>${s.valueDiff.toLocaleString('fa-IR')}</strong></p>
  `;
}


export interface CardexRow {
  date: string; action: string; reference: string; before: number | string;
  change: number | string; after: number | string; operator: string; note: string;
}

/** سوابق قابل اتکا از لاگ موجود؛ برای قبل از ثبت لاگ، گردش فرضی ساخته نمی‌شود. */
export function getProductCardex(productId: string): CardexRow[] {
  const p = products.find((item) => item.id === productId);
  if (!p) return [];
  return auditLog
    .filter((entry) => {
      const d = entry.detail || {};
      return String(d.id || '') === productId && ['count', 'count2', 'undo'].includes(entry.action);
    })
    .map((entry) => {
      const d = entry.detail || {};
      const prev = typeof d.prev === 'number' ? d.prev : null;
      const next = typeof d.next === 'number' ? d.next :
        typeof d.restored === 'number' ? d.restored : null;
      const phase = Number(d.phase || (entry.action === 'count2' ? 2 : 1));
      const delta = prev !== null && next !== null ? next - prev : '';
      return {
        date: entry.ts ? new Date(entry.ts).toLocaleString('fa-IR') : '—',
        action: entry.action === 'count2' ? `شمارش فاز ${phase}` : entry.action === 'undo' ? 'بازگردانی' : 'شمارش فاز ۱',
        reference: String(d.id || ''), before: prev ?? 'نامشخص', change: delta,
        after: next ?? 'نامشخص', operator: entry.operator || '—', note: 'ثبت‌شده در سوابق فعالیت',
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date, 'fa'));
}

export function renderCardex(productId: string): void {
  const host = document.getElementById('cardexResult');
  if (!host) return;
  const p = products.find((item) => item.id === productId);
  if (!p) { host.textContent = 'برای مشاهده کاردکس، یک کالا انتخاب کنید.'; return; }
  const rows = getProductCardex(productId);
  host.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = `${p.name} — کاردکس کالا`;
  host.appendChild(title);
  const meta = document.createElement('p');
  meta.className = 'hint';
  meta.textContent = `کد: ${p.code || p.sku || '—'} | انبار: ${p.warehouse || 'انبار اصلی'} | موجودی سیستم فعلی: ${p.systemQty} ${p.unit || ''}`;
  host.appendChild(meta);
  const notice = document.createElement('p');
  notice.className = 'hint';
  notice.textContent = 'توجه: فقط رویدادهایی نمایش داده می‌شوند که در سوابق فعالیت ذخیره شده‌اند؛ سوابق قبل از فعال‌شدن ثبت رویداد ممکن است کامل نباشند.';
  host.appendChild(notice);
  if (!rows.length) {
    const empty = document.createElement('p'); empty.textContent = 'برای این کالا سابقه گردش قابل اتکایی در گزارش فعالیت پیدا نشد.'; host.appendChild(empty); return;
  }
  const table = document.createElement('div'); table.className = 'table-wrap';
  const t = document.createElement('table'); t.className = 'data-table';
  const headers = ['تاریخ', 'عملیات', 'موجودی قبل', 'تغییر', 'مقدار ثبت‌شده', 'کاربر'];
  const thead = document.createElement('thead'); const hr = document.createElement('tr');
  headers.forEach((h) => { const th = document.createElement('th'); th.textContent = h; hr.appendChild(th); }); thead.appendChild(hr); t.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach((r) => { const tr = document.createElement('tr'); [r.date,r.action,String(r.before),String(r.change),String(r.after),r.operator].forEach((v) => { const td=document.createElement('td'); td.textContent=v; tr.appendChild(td); }); tbody.appendChild(tr); });
  t.appendChild(tbody); table.appendChild(t); host.appendChild(table);
}

export function exportProductCardexExcel(productId: string): void {
  const p = products.find((item) => item.id === productId);
  if (!p) { toast('ابتدا کالا را انتخاب کنید', 'error'); return; }
  const rows = getProductCardex(productId).map((r) => ({ تاریخ:r.date, عملیات:r.action, 'موجودی قبل':r.before, تغییر:r.change, 'مقدار ثبت‌شده':r.after, کاربر:r.operator, توضیحات:r.note }));
  const data = rows.length ? rows : [{ پیام: 'برای این کالا سابقه گردش ثبت‌شده‌ای وجود ندارد' }];
  const bytes = buildOfflineXlsx([{ name: 'کاردکس کالا', rows: [Object.keys(data[0]), ...data.map((r) => Object.values(r))] }]);
  downloadFile(new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), `cardex-${dateStr()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  logAudit('export_product_cardex', { id: productId, count: rows.length });
  toast('فایل اکسل کاردکس آماده شد', 'success');
}

export function printProductCardex(productId: string): void {
  const p = products.find((item) => item.id === productId);
  if (!p) { toast('ابتدا کالا را انتخاب کنید', 'error'); return; }
  const rows = getProductCardex(productId);
  const w = window.open('', '_blank');
  if (!w) { toast('پنجره چاپ باز نشد؛ اجازه بازشدن پنجره را فعال کنید', 'error'); return; }
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  w.document.write(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>کاردکس ${esc(p.name)}</title><style>body{font-family:Tahoma,sans-serif;padding:24px;color:#18352b}h2{color:#176b4b}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #bbb;padding:8px;text-align:right}th{background:#e8f3ed}.hint{color:#555;font-size:12px}@media print{button{display:none}}</style><h2>کاردکس کالا — انبارین پرو</h2><p>${esc(p.name)} | کد: ${esc(p.code||p.sku||'—')} | موجودی سیستم فعلی: ${esc(p.systemQty)}</p><p class="hint">سوابق نمایش‌داده‌شده محدود به رویدادهای ثبت‌شده در گزارش فعالیت است و ممکن است تاریخچه قدیمی کامل نباشد.</p><table><thead><tr><th>تاریخ</th><th>عملیات</th><th>قبل</th><th>تغییر</th><th>بعد</th><th>کاربر</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.action)}</td><td>${esc(r.before)}</td><td>${esc(r.change)}</td><td>${esc(r.after)}</td><td>${esc(r.operator)}</td></tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()</script></html>`);
  w.document.close();
  logAudit('print_product_cardex', { id: productId, count: rows.length });
}
