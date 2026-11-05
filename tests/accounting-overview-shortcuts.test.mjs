import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../src/modules/accounting-ui.ts',import.meta.url),'utf8');
test('overview shortcuts route to their matching accounting workspaces',()=>{
  for(const route of ["people:'aging'","party:'sale'","inventory:'inventory'","invoice:'sale'","receipt:'receipts'","payment:'receipts'","other:'management'","banking:'banking'","cheques:'cheques'"]) assert.ok(ui.includes(route),`missing ${route}`);
  assert.match(ui,/type\.value=action==='payment'\?'payment':'receipt'/);
  assert.match(ui,/panel\.open=true/);
  assert.match(ui,/requestAnimationFrame\(openTarget\)/);
});
