/**
 * فیلتر مکان/انبار + اعمال نقش در کل UI
 * هدف: بدون عقبگرد نسبت به نسخه قدیم + کنترل یکدست‌تر
 */

import { products, settings, filterByActiveWarehouse } from './state';
import type { Product } from '@/types';
import { toast } from './ui';
import { authorizeLocally, type Permission } from './authorization';

export let locationFilter = '';
export let warehouseFilterMode: 'active' | 'all' = 'active';

export function setLocationFilter(loc: string): void {
  locationFilter = (loc || '').trim();
}

export function setWarehouseFilterMode(mode: 'active' | 'all'): void {
  warehouseFilterMode = mode;
}

/** همه محل‌های یکتا (از کالاها) */
export function collectLocations(): string[] {
  const set = new Set<string>();
  for (const p of products) {
    const loc = (p.location || '').trim();
    if (loc) set.add(loc);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fa'));
}

export function collectWarehouses(): string[] {
  const set = new Set<string>(settings.warehouses || []);
  for (const p of products) {
    const w = (p.warehouse || '').trim();
    if (w) set.add(w);
  }
  if (settings.currentWarehouse) set.add(settings.currentWarehouse);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fa'));
}

/** فیلتر ترکیبی انبار + محل + اختیاری جستجو */
export function filterProductsAdvanced(
  opts: {
    query?: string;
    location?: string;
    onlyWarehouse?: boolean;
    countFilter?: 'all' | 'counted' | 'uncounted' | 'diff';
  } = {}
): Product[] {
  let list =
    opts.onlyWarehouse === false || warehouseFilterMode === 'all'
      ? [...products]
      : filterByActiveWarehouse(products);

  const loc = (opts.location ?? locationFilter).trim().toLowerCase();
  if (loc) {
    list = list.filter((p) => (p.location || '').toLowerCase().includes(loc));
  }

  const cf = opts.countFilter;
  if (cf === 'counted') list = list.filter((p) => p.countedQty != null);
  else if (cf === 'uncounted') list = list.filter((p) => p.countedQty == null);
  else if (cf === 'diff')
    list = list.filter((p) => p.countedQty != null && p.countedQty !== p.systemQty);

  const q = (opts.query || '').trim().toLowerCase();
  if (q) {
    list = list.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.code && String(p.code).toLowerCase().includes(q)) ||
        (p.sku && String(p.sku).toLowerCase().includes(q)) ||
        (p.location && String(p.location).toLowerCase().includes(q)) ||
        (p.note && String(p.note).toLowerCase().includes(q))
    );
  }
  return list;
}

export function isViewer(): boolean {
  return settings.role === 'viewer';
}

export function isAdmin(): boolean {
  return settings.role === 'admin' || !settings.role;
}

export function isCounter(): boolean {
  return settings.role === 'counter' || isAdmin();
}

/** اعمال محدودیت نقش روی دکمه‌ها و فرم‌ها */
export function applyRoleUI(): void {
  const admin = isAdmin();
  const permissionSelectors: Partial<Record<Permission, string[]>> = {
    'inventory.read': [],
    'inventory.count': ['#btnOpenScanner', '#btnQuickCount', '#qtyConfirm', '#btnClearCounts', '#btnZeroUncounted', '#btnApplySystem', '#btnResetToSystem'],
    'inventory.edit': ['#btnAddProduct', '#btnTakePhoto'],
    'inventory.import': ['#btnImport', '#btnImportPhotos'],
    'inventory.export': ['#btnExportExcel', '#btnExportDiff', '#btnExportCsv', '#btnExportJson', '#btnExportPhotos', '#btnExportDiffs', '#btnExportCountedProducts', '#btnExportInventoryDocs', '#btnExportPartial', '#btnExportMergeReport'],
    'session.start': ['#btnStartSession'],
    'session.close': ['#btnCloseSession'],
    'team.sync': ['#btnExportTeam', '#btnImportTeam', '#btnJoinSession', '#btnSyncTeamOnline'],
    'audit.read': ['#btnExportAudit'],
    'audit.clear': ['#btnClearAudit'],
    'license.manage': ['#btnActivateLicense', '#btnDeactivateLicense', '#btnActivateOfflineLicense'],
    'settings.manage': ['#btnSaveSettings'],
  };
  for (const [permission, selectors] of Object.entries(permissionSelectors) as [Permission, string[]][]) {
    const allowed = authorizeLocally(settings, permission).allowed;
    for (const selector of selectors) document.querySelectorAll<HTMLButtonElement>(selector).forEach(button => {
      button.disabled = !allowed;
      button.title = allowed ? '' : `مجوز لازم: ${permission}`;
      button.classList.toggle('role-locked', !allowed);
    });
  }
  // حذف لاگ و مدیریت حساب‌ها فقط برای مدیر مجاز است.
  ['#btnClearAudit', '#localAddUser'].forEach(selector => document.querySelectorAll<HTMLButtonElement>(selector).forEach(button => {
    const allowed = authorizeLocally(settings, selector === '#btnClearAudit' ? 'audit.clear' : 'users.manage').allowed;
    button.disabled = !allowed; button.classList.toggle('role-locked', !allowed);
  }));
  const badge = document.getElementById('roleBadge');
  if (badge) badge.textContent = settings.role === 'viewer' ? 'مشاهده‌گر' : settings.role === 'counter' ? 'شمارنده' : 'مدیر';
  const usersPanel = document.getElementById('localUsersPanel');
  if (usersPanel) usersPanel.classList.toggle('role-locked', !authorizeLocally(settings, 'users.manage').allowed);
}

/** بررسی یک مجوز محلی برای یکسان‌سازی کنترل‌های رابط کاربری.
 * این بررسی جایگزین احراز هویت یا کنترل دسترسی سمت سرور نیست.
 */
export function guardPermission(permission: Permission, feature = 'این عمل'): boolean {
  const decision = authorizeLocally(settings, permission);
  if (!decision.allowed) {
    toast('نقش فعلی اجازه «' + feature + '» را ندارد', 'error');
    return false;
  }
  return true;
}

/** نگه‌داشتن رفتار قبلی: شمارنده و مدیر مجازند؛ مشاهده‌گر فقط خواندنی است. */
export function guardWrite(feature = 'این عمل'): boolean {
  return guardPermission('inventory.count', feature);
}

/** پر کردن select محل‌ها */
export function fillLocationSelect(selectId = 'locationFilterSelect'): void {
  const sel = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!sel) return;
  const current = sel.value;
  const locs = collectLocations();
  // Treat location names as untrusted text: never interpolate them into innerHTML.
  sel.replaceChildren();
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'همه محل‌ها';
  sel.appendChild(allOption);
  for (const location of locs) {
    const option = document.createElement('option');
    option.value = location;
    option.textContent = location;
    sel.appendChild(option);
  }
  if (current && locs.includes(current)) sel.value = current;
  else if (locationFilter && locs.includes(locationFilter)) sel.value = locationFilter;
}
