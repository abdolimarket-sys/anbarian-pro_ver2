import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const gradle = read('android/app/build.gradle');

test('release versions stay synchronized', () => {
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages?.['']?.version);
  assert.ok(gradle.includes(`versionName "${pkg.version}"`));
  assert.match(gradle, /versionCode\s+19\b/);
  assert.match(gradle, /applicationId\s+"com\.anbarian\.app"/);
});

test('local account flow retains password hashing and disabled-account checks', () => {
  const auth = read('src/modules/local-auth.ts');
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /iterations:\s*180000/);
  assert.match(auth, /!u\.disabled/);
  assert.match(auth, /password\.length\s*<\s*8/);
});

test('counting flow retains quantity validation and undo support', () => {
  const count = read('src/modules/count.ts');
  assert.match(count, /export function updateCount\(/);
  assert.match(count, /export function undoLast\(/);
  assert.match(count, /export function confirmQtyModal\(/);
  assert.match(count, /!isNaN\(v\)/);
});

test('backup recovery retains snapshot validation and queued-save flush', () => {
  const storage = read('src/modules/storage.ts');
  const state = read('src/modules/state.ts');
  assert.match(storage, /autobackup_prev/);
  assert.match(storage, /isStateSnapshot/);
  assert.match(state, /export function flushSave\(/);
});

test('scanner and inventory export modules remain present', () => {
  assert.ok(fs.existsSync(new URL('../src/modules/scanner.ts', import.meta.url)));
  const scanner = read('src/modules/scanner.ts');
  assert.match(scanner, /html5-qrcode/);
  assert.ok(fs.existsSync(new URL('../src/modules/import-export.ts', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../src/modules/reports.ts', import.meta.url)));
});

test('license implementation is not silently replaced by this smoke-test phase', () => {
  const license = read('src/modules/license.ts');
  assert.match(license, /ANB3|ANBAR/);
  assert.ok(license.length > 500);
});
