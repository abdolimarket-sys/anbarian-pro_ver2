import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/modules/accounting-ui.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

test('phase 28 adds compact icon navigation for all accounting workspaces', () => {
  for (const tab of ['overview', 'settings', 'journals', 'accounts', 'fiscal', 'commerce', 'reports']) {
    assert.ok(ui.includes(`id:'${tab}'`) || ui.includes(`data-acc-section="${tab}"`), `missing ${tab} navigation/panel`);
  }
  assert.match(ui, /data-acc-tab/);
  assert.match(ui, /applyAccountingTab\(\)/);
  assert.match(main, /id="accountingCommerceWorkspace"/);
  assert.match(main, /id="accountingReportsWorkspace"/);
});

test('phase 28 hides inactive panels and uses responsive compact icon tiles', () => {
  assert.match(ui, /node\.hidden = node\.dataset\.accSection !== activeAccountingTab/);
  assert.match(css, /\.accounting-shortcuts/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.acc-section\[hidden\].*display: none !important/);
});

test('phase 28 preserves all underlying accounting actions and scanner module', () => {
  for (const id of ['accAddAccount', 'fyCreate', 'jeSave', 'jeSave', 'data-post-journal']) assert.ok(ui.includes(id));
  assert.ok(readFileSync(new URL('../src/modules/scanner.ts', import.meta.url), 'utf8').length > 0);
});
