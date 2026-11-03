import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const auth = readFileSync(new URL('../src/modules/authorization.ts', import.meta.url), 'utf8');
const localAuth = readFileSync(new URL('../src/modules/local-auth.ts', import.meta.url), 'utf8');
const roles = readFileSync(new URL('../src/modules/filters-roles.ts', import.meta.url), 'utf8');

test('phase56 defines a complete named permission catalogue', () => {
  for (const permission of ['inventory.read','inventory.count','inventory.edit','inventory.import','inventory.export','session.start','session.close','team.sync','users.manage','roles.assign','audit.read','audit.clear','license.manage','settings.manage']) {
    assert.ok(auth.includes(`'${permission}'`), `missing ${permission}`);
  }
  assert.match(auth, /PERMISSION_LABELS/);
});

test('legacy accounts retain role defaults and custom overrides are validated', () => {
  assert.match(auth, /activeOverrides\[permission\] \?\? roleAllows\(role, permission\)/);
  assert.match(auth, /isKnownPermission\(key\)/);
  assert.match(localAuth, /permissionOverrides\?: PermissionOverrides/);
  assert.match(localAuth, /setLocalPermissionOverrides\(user\.permissionOverrides\)/);
});

test('user editor supports role, explicit permission choices, and audit events', () => {
  assert.match(localAuth, /function openUserEditor/);
  assert.match(localAuth, /name="permission"/);
  assert.match(localAuth, /تغییر مجوز کاربر/);
  assert.match(localAuth, /غیرفعال‌سازی کاربر/);
});

test('role UI maps high-impact controls to permission checks', () => {
  for (const selector of ['#btnOpenScanner','#btnAddProduct','#btnImport','#btnStartSession','#btnCloseSession','#btnClearAudit','#btnSaveSettings']) {
    assert.ok(roles.includes(selector), `missing UI permission mapping for ${selector}`);
  }
  assert.match(roles, /authorizeLocally\(settings, permission\)/);
});

test('critical data mutation and settings entry points enforce local permissions', () => {
  const products = readFileSync(new URL('../src/modules/products-ui.ts', import.meta.url), 'utf8');
  const sessions = readFileSync(new URL('../src/modules/session-settings.ts', import.meta.url), 'utf8');
  const imports = readFileSync(new URL('../src/modules/import-export.ts', import.meta.url), 'utf8');
  const audit = readFileSync(new URL('../src/modules/audit-ui.ts', import.meta.url), 'utf8');
  assert.match(products, /guardPermission\('inventory\.edit'/);
  assert.match(sessions, /guardPermission\('session\.start'/);
  assert.match(sessions, /guardPermission\('session\.close'/);
  assert.match(sessions, /guardPermission\('settings\.manage'/);
  assert.match(imports, /guardPermission\('inventory\.import'/);
  assert.match(imports, /guardPermission\('inventory\.export'/);
  assert.match(audit, /guardPermission\('audit\.clear'/);
});
