import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const storage = fs.readFileSync(new URL('../src/modules/storage.ts', import.meta.url), 'utf8');
const io = fs.readFileSync(new URL('../src/modules/import-export.ts', import.meta.url), 'utf8');
const state = fs.readFileSync(new URL('../src/modules/state.ts', import.meta.url), 'utf8');

test('automatic backup rotation retains five timestamped recovery points', () => {
  assert.match(storage, /autobackup_history/);
  assert.match(storage, /slice\(-5\)/);
  assert.match(storage, /idb-autobackup-history-/);
});

test('external backup contains full core app state and a checksum', () => {
  for (const field of ['products', 'settings', 'session', 'auditLog', 'recentScans', 'inventoryDocs']) {
    assert.match(io, new RegExp(`\\b${field}\\s*,`));
  }
  assert.match(io, /checksum: backupChecksum\(body\)/);
  assert.match(io, /data\.version >= 4 && typeof data\.checksum !== 'string'/);
  assert.match(io, /checksum !== backupChecksum\(body\)/);
});

test('restore rejects invalid checksum before offering replacement', () => {
  const checksumCheck = io.indexOf('صحت فایل پشتیبان تأیید نشد');
  const importMode = io.indexOf('const mode = await askImportMode()', checksumCheck);
  assert.ok(checksumCheck >= 0 && importMode > checksumCheck);
});

test('replace restore updates settings, session, audit, scans and inventory documents', () => {
  for (const token of ['Object.assign(settings, data.settings)', 'restoreSession(data.session)', 'auditLog.splice', 'recentScans.splice', 'inventoryDocs.splice']) {
    assert.ok(io.includes(token), `missing ${token}`);
  }
  assert.match(state, /export function restoreSession/);
});
