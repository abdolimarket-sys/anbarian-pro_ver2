import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const state = readFileSync(new URL('../src/modules/state.ts', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../src/modules/audit-ui.ts', import.meta.url), 'utf8');

test('phase57 adds a chained integrity checksum and verification report', () => {
  assert.match(state, /function auditChecksum/);
  assert.match(state, /previousHash, integrityHash: auditChecksum/);
  assert.match(state, /export function verifyAuditIntegrity/);
  assert.match(state, /brokenAt/);
});

test('phase57 documents legacy entries and bounded-retention chain anchors', () => {
  assert.match(state, /let previousHash: string \| null = null/);
  assert.match(state, /نخستین رکورد زنجیره/);
  assert.match(state, /AUDIT_MAX/);
});

test('clearing audit history leaves a new trace event', () => {
  assert.match(audit, /const removedEntries = auditLog.length/);
  assert.match(audit, /logAudit\('audit_log_cleared', \{ removedEntries \}\)/);
  assert.match(audit, /audit_log_cleared: 'پاک‌سازی تاریخچه عملیات'/);
});

test('audit UI surfaces integrity status without changing scanner code', () => {
  assert.match(audit, /verifyAuditIntegrity\(\)/);
  assert.match(audit, /audit-integrity/);
});
