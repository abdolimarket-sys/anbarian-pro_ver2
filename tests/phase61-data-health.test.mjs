import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const health = fs.readFileSync(new URL('../src/modules/data-health.ts', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const scanner = fs.readFileSync(new URL('../src/modules/scanner.ts', import.meta.url), 'utf8');

test('phase61 health checks are read-only and gather each domain independently', () => {
  assert.match(health, /loadAccountingData\(\)/);
  assert.match(health, /loadCommerceData\(\)/);
  assert.match(health, /loadInventoryCostData\(\)/);
  assert.match(health, /verifyAuditIntegrity\(\)/);
  assert.match(health, /idbGet<unknown>\('autobackup'\)/);
  assert.doesNotMatch(health, /idbPut|saveAccountingData|saveCommerceData|saveInventoryCostData/);
});

test('phase61 detects duplicate product identifiers and barcodes, invalid quantities and unbalanced posted journals', () => {
  assert.match(health, /شناسه کالای خالی یا تکراری/);
  assert.match(health, /بارکدهای تکراری/);
  assert.match(health, /مقادیر موجودی نامعتبر/);
  assert.match(health, /اسناد قطعی نامتوازنه/);
});

test('phase61 exposes health center and refresh action in navigation', () => {
  assert.match(main, /data-page="health"/);
  assert.match(main, /btnRunDataHealth/);
  assert.match(main, /page === 'health'.*renderDataHealth/s);
});

test('phase61 leaves barcode scanner source unchanged from phase60 baseline', () => {
  const digest = crypto.createHash('sha256').update(scanner).digest('hex');
  assert.equal(digest, '483979e3ec3ddc323a8e9d4efb3e002e095fada019093a78be25b6c57ab50b70');
});
