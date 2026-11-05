/** اسناد پایه انبار: پیش‌نویس، تأیید یک‌باره و ثبت گردش در موجودی */
import type { InventoryDocument, InventoryDocumentKind, InventoryDocumentLine, Product } from '@/types';
import { inventoryDocs, products, settings, logAudit, save } from './state';
import { getOperatorName } from './storage';
import { toast } from './ui';
import { esc, dateStr } from '@/utils/helpers';
import { rowsToCSV } from './import-export';
import { downloadFile } from '@/utils/helpers';

const kindLabels: Record<InventoryDocumentKind, string> = {
  receipt: 'رسید ورود', issue: 'حواله خروج', adjustment: 'اصلاح موجودی', transfer: 'انتقال انبار',
};
const $ = (id: string) => document.getElementById(id);

function warehouseOf(p: Product): string { return p.warehouse || 'انبار اصلی'; }
function nextNumber(): string {
  const year = new Date().toLocaleDateString('fa-IR-u-nu-latn').split('/')[0] || String(new Date().getFullYear());
  const seq = inventoryDocs.length + 1;
  return `ANB-${year}-${String(seq).padStart(5, '0')}`;
}
function selectedProduct(): Product | undefined {
  const id = ($('invDocProduct') as HTMLSelectElement | null)?.value;
  return products.find((p) => p.id === id);
}
function renderDocuments(): void {
  const host = $('inventoryDocumentsList');
  if (!host) return;
  const docs = [...inventoryDocs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!docs.length) { host.innerHTML = '<p class="hint">هنوز سندی ثبت نشده است.</p>'; return; }
  host.innerHTML = docs.slice(0, 100).map((d) => `
    <article class="card" style="padding:10px;margin:8px 0;border:1px solid var(--border-light)">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <strong>${esc(d.number)} — ${kindLabels[d.kind]}</strong>
        <span class="hint">${d.status === 'approved' ? 'تأییدشده' : 'پیش‌نویس'}</span>
      </div>
      <div class="hint">${esc(new Date(d.createdAt).toLocaleString('fa-IR'))} · ${esc(d.operator)} · ${esc(d.warehouse)}</div>
      <div style="margin-top:5px">${d.lines.map((l) => `${esc(l.productName)}: ${l.qty} (${l.beforeQty} ← ${l.afterQty})`).join('<br>')}</div>
      ${d.destinationWarehouse ? `<div class="hint">مقصد: ${esc(d.destinationWarehouse)}</div>` : ''}
      ${d.reason ? `<div class="hint">علت: ${esc(d.reason)}</div>` : ''}
      ${d.status === 'draft' ? `<button class="btn btn-success btn-block" data-approve-doc="${esc(d.id)}" style="margin-top:8px">تأیید و اعمال سند</button>` : `<div class="hint">تأیید: ${esc(d.approvedAt ? new Date(d.approvedAt).toLocaleString('fa-IR') : '—')}</div>`}
    </article>`).join('');
  host.querySelectorAll<HTMLButtonElement>('[data-approve-doc]').forEach((btn) => btn.addEventListener('click', () => approveDocument(btn.dataset.approveDoc || '')));
}
function refreshSelects(): void {
  const productSelect = $('invDocProduct') as HTMLSelectElement | null;
  if (productSelect) {
    const current = productSelect.value;
    productSelect.replaceChildren(new Option('انتخاب کالا...', ''));
    products.forEach((p) => productSelect.add(new Option(`${p.name} — ${p.code || p.sku || p.id}`, p.id)));
    if (products.some((p) => p.id === current)) productSelect.value = current;
  }
  const dest = $('invDocDestination') as HTMLSelectElement | null;
  if (dest) {
    const current = dest.value;
    const warehouses = new Set([...(settings.warehouses || []), ...products.map(warehouseOf)]);
    dest.replaceChildren(new Option('انتخاب انبار مقصد', ''));
    [...warehouses].filter(Boolean).forEach((w) => dest.add(new Option(w, w)));
    if ([...warehouses].includes(current)) dest.value = current;
  }
}
function createDraft(): void {
  const kind = ($('invDocKind') as HTMLSelectElement | null)?.value as InventoryDocumentKind;
  const product = selectedProduct();
  const qtyRaw = Number(($('invDocQty') as HTMLInputElement | null)?.value);
  const reason = (($('invDocReason') as HTMLInputElement | null)?.value || '').trim();
  if (!product) { toast('ابتدا کالا را انتخاب کنید', 'error'); return; }
  if (!Number.isFinite(qtyRaw) || qtyRaw === 0) { toast('مقدار معتبر وارد کنید', 'error'); return; }
  if (kind !== 'adjustment' && qtyRaw < 0) { toast('مقدار باید مثبت باشد', 'error'); return; }
  const qty = Math.abs(qtyRaw);
  const before = Number(product.systemQty) || 0;
  let after = before;
  if (kind === 'receipt') after = before + qty;
  if (kind === 'issue') after = before - qty;
  if (kind === 'adjustment') after = before + qtyRaw;
  if (kind === 'issue' && after < 0) { toast('موجودی برای این حواله کافی نیست', 'error'); return; }
  const destination = ($('invDocDestination') as HTMLSelectElement | null)?.value || '';
  if (kind === 'transfer') {
    if (!destination) { toast('انبار مقصد را انتخاب کنید', 'error'); return; }
    if (destination === warehouseOf(product)) { toast('انبار مقصد با انبار مبدأ یکسان است', 'error'); return; }
    // مدل فعلی کالا فقط یک فیلد انبار دارد؛ انتقال جزئی بدون مدل موجودی چندانباره مجاز نیست.
    if (qty !== before) { toast('در این نسخه انتقال فقط برای کل موجودی کالا ممکن است؛ انتقال جزئی پس از تکمیل مدل چندانباره فعال می‌شود', 'warning'); return; }
  }
  if (kind === 'adjustment' && after < 0) { toast('موجودی پس از اصلاح نمی‌تواند منفی شود', 'error'); return; }
  const line: InventoryDocumentLine = {
    productId: product.id, productName: product.name, code: product.code || product.sku || '', qty: kind === 'adjustment' ? qtyRaw : qty,
    beforeQty: before, afterQty: kind === 'transfer' ? before : after,
    fromWarehouse: warehouseOf(product), toWarehouse: kind === 'transfer' ? destination : undefined,
  };
  const doc: InventoryDocument = {
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    number: nextNumber(), kind, status: 'draft', createdAt: new Date().toISOString(), operator: getOperatorName(),
    warehouse: warehouseOf(product), destinationWarehouse: kind === 'transfer' ? destination : undefined,
    reason, lines: [line],
  };
  inventoryDocs.push(doc);
  logAudit('inventory_doc_create', { number: doc.number, kind, product: product.name, qty: line.qty });
  save(true);
  const qtyInput = $('invDocQty') as HTMLInputElement | null; if (qtyInput) qtyInput.value = '';
  const reasonInput = $('invDocReason') as HTMLInputElement | null; if (reasonInput) reasonInput.value = '';
  renderDocuments();
  toast(`پیش‌نویس ${doc.number} ایجاد شد؛ برای تغییر موجودی آن را تأیید کنید`, 'success');
}
function approveDocument(id: string): void {
  const doc = inventoryDocs.find((d) => d.id === id);
  if (!doc || doc.status !== 'draft') { toast('سند وجود ندارد یا قبلاً تأیید شده است', 'error'); return; }
  if (settings.role !== 'admin') { toast('تأیید اسناد فقط برای مدیر مجاز است', 'error'); return; }
  const line = doc.lines[0];
  const product = products.find((p) => p.id === line.productId);
  if (!product) { toast('کالای سند دیگر در فهرست وجود ندارد؛ سند تأیید نشد', 'error'); return; }
  // کنترل هم‌زمانی: اگر موجودی پس از ایجاد پیش‌نویس تغییر کرده باشد، سند باید دوباره بررسی شود.
  if ((Number(product.systemQty) || 0) !== line.beforeQty || warehouseOf(product) !== (line.fromWarehouse || doc.warehouse)) {
    toast('موجودی یا انبار کالا از زمان ایجاد پیش‌نویس تغییر کرده است؛ سند جدید بسازید', 'error'); return;
  }
  if (doc.kind === 'issue' && product.systemQty < line.qty) { toast('موجودی فعلی برای حواله کافی نیست', 'error'); return; }
  if (doc.kind === 'receipt') product.systemQty += line.qty;
  else if (doc.kind === 'issue') product.systemQty -= line.qty;
  else if (doc.kind === 'adjustment') product.systemQty += line.qty;
  else if (doc.kind === 'transfer') product.warehouse = doc.destinationWarehouse || product.warehouse;
  line.afterQty = Number(product.systemQty) || 0;
  doc.status = 'approved';
  doc.approvedAt = new Date().toISOString();
  logAudit('inventory_doc_approve', { number: doc.number, kind: doc.kind, product: product.name, before: line.beforeQty, after: line.afterQty, destination: doc.destinationWarehouse || '' });
  save(true);
  renderDocuments();
  toast(`سند ${doc.number} تأیید و اعمال شد`, 'success');
  window.dispatchEvent(new CustomEvent('anbarin:inventory-changed'));
}
export function exportInventoryDocuments(): void {
  const rows = inventoryDocs.map((d) => ({ شماره: d.number, نوع: kindLabels[d.kind], وضعیت: d.status === 'approved' ? 'تأییدشده' : 'پیش‌نویس', تاریخ: d.createdAt, تأیید: d.approvedAt || '', ثبت_کننده: d.operator, کالا: d.lines.map((l) => l.productName).join('، '), مقدار: d.lines.map((l) => l.qty).join('، '), انبار: d.warehouse, مقصد: d.destinationWarehouse || '', علت: d.reason }));
  if (!rows.length) { toast('سندی برای خروجی وجود ندارد', 'info'); return; }
  downloadFile('\uFEFF' + rowsToCSV(rows), `inventory-documents-${dateStr()}.csv`, 'text/csv;charset=utf-8');
}
export function initInventoryDocumentsUI(): void {
  refreshSelects();
  renderDocuments();
  $('invDocKind')?.addEventListener('change', () => {
    const kind = ($('invDocKind') as HTMLSelectElement).value;
    const wrap = $('invDocDestinationWrap'); if (wrap) wrap.hidden = kind !== 'transfer';
    const qty = $('invDocQty') as HTMLInputElement | null;
    if (qty) qty.placeholder = kind === 'adjustment' ? 'مثبت=افزایش، منفی=کاهش' : kind === 'transfer' ? 'کل موجودی کالا' : 'مقدار';
  });
  $('btnCreateInvDoc')?.addEventListener('click', createDraft);
  $('btnExportInventoryDocs')?.addEventListener('click', exportInventoryDocuments);
  window.addEventListener('anbarin:inventory-changed', refreshSelects);
}
