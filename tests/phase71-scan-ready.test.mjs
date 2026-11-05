import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../src/modules/accounting-commerce-ui.ts',import.meta.url),'utf8');
const scanner=fs.readFileSync(new URL('../src/modules/scanner.ts',import.meta.url),'utf8');
test('camera invoice scan adds a product without scrolling away or closing the scanner',()=>{
 assert.match(ui,/addProductToInvoice\(product\.id,true\)/);
 assert.match(ui,/__anbarinInvoiceScanActive=true;openScanner\(\{title:'اسکن پیوسته بارکد کالا برای فاکتور'\}\)/);
 assert.match(scanner,/opts\.onScan\(\{ code, source, at: lastScanTime \}\)/);
});
test('barcode input is cleared and refocused after each manual or camera scan',()=>{
 assert.match(ui,/if\(keepScanReady\)[\s\S]*?input\.value='';input\.focus\(\{preventScroll:true\}\)/);
 assert.match(ui,/const addByBarcode=\(\)=>[\s\S]*?addProductToInvoice\(product\.id,true\)/);
});
test('scan feedback remains visible and accessible while the next scan is ready',()=>{
 assert.match(ui,/<small id="invoiceScanStatus" class="hint" role="status" aria-live="polite">/);
 assert.match(ui,/آماده اسکن بعدی/);
});
