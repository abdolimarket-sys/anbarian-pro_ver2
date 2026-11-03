import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('phase 27 release-critical modules remain present', () => {
  for (const file of [
    'src/modules/scanner.ts',
    'src/modules/inventory-costing.ts',
    'src/modules/accounting.ts',
    'src/modules/accounting-reports.ts',
    'src/modules/offline-license.ts',
    'src/modules/license-platform.ts',
  ]) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), true, `${file} missing`);
});

test('phase 27 records release blockers instead of claiming APK validation', () => {
  const report = read('PHASE27_RELEASE_VALIDATION_FA.md');
  assert.match(report, /آماده انتشار نهایی نیست/);
  assert.match(report, /npm ci/);
  assert.match(report, /تست عملی/);
});

test('release package remains version 1.5.7', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '1.5.7');
});
