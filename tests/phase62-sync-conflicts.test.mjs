import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const sync = fs.readFileSync(new URL('../src/modules/team-sync.ts', import.meta.url), 'utf8');
const scanner = fs.readFileSync(new URL('../src/modules/scanner.ts', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

test('phase62 provides a read-only preflight analyzer for duplicate and metadata conflicts', () => {
  assert.match(sync, /export function analyzeTeamSyncConflicts/);
  assert.match(sync, /duplicateIncoming/);
  assert.match(sync, /ambiguousLocal/);
  assert.match(sync, /duplicateTargets/);
  assert.match(sync, /metadataMismatch/);
});

test('phase62 blocks duplicate incoming identities and ambiguous local identities before mutation', () => {
  const preflight = sync.indexOf('const conflicts = analyzeTeamSyncConflicts(data.counts)');
  const firstMutation = sync.indexOf('products.push(np)', preflight);
  assert.ok(preflight > 0 && firstMutation > preflight);
  assert.ok(sync.indexOf('if (conflicts.duplicateIncoming.length)', preflight) < firstMutation);
  assert.ok(sync.indexOf('if (conflicts.ambiguousLocal.length)', preflight) < firstMutation);
  assert.ok(sync.indexOf('if (conflicts.duplicateTargets.length)', preflight) < firstMutation);
});

test('phase62 asks for explicit approval on metadata mismatch and records conflict details', () => {
  assert.match(sync, /if \(!confirm\(`هشدار تعارض اطلاعات پایه/);
  assert.match(sync, /conflictExamples: conflicts\.metadataMismatch\.slice\(0, 20\)/);
  assert.match(sync, /metadataConflictCount: onlineMetadataConflicts\.size/);
});

test('phase62 validates import size and declared count before merging', () => {
  assert.match(sync, /data\.counts\.length > 50000/);
  assert.match(sync, /data\.countTotal !== data\.counts\.length/);
});

test('phase62 preserves scanner implementation byte-for-byte', () => {
  const digest = crypto.createHash('sha256').update(scanner).digest('hex');
  assert.equal(digest, '483979e3ec3ddc323a8e9d4efb3e002e095fada019093a78be25b6c57ab50b70');
});
