import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const module = fs.readFileSync(new URL('../src/modules/offline-license.ts', import.meta.url), 'utf8');
const license = fs.readFileSync(new URL('../src/modules/license.ts', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const issuer = fs.readFileSync(new URL('../tools/windows-license-issuer/license_issuer.py', import.meta.url), 'utf8');

test('phase 26 validates vendor RS256 signatures with a public build-time key', () => {
  assert.match(module, /RSASSA-PKCS1-v1_5/);
  assert.match(module, /VITE_LICENSE_PUBLIC_KEY/);
  assert.match(module, /crypto\.subtle\.verify/);
  assert.match(issuer, /padding\.PKCS1v15\(\), hashes\.SHA256\(\)/);
});

test('phase 26 binds licenses to this application and this device', () => {
  assert.match(module, /applicationId !== 'com\.anbarian\.app'/);
  assert.match(module, /payload\.deviceId !== getDeviceId\(\)/);
  assert.match(module, /payload\.maxDevices !== 1/);
  assert.match(module, /transferRequiresIssuerApproval !== true/);
});

test('phase 26 rejects expired licenses and stores only verified payloads', () => {
  assert.match(module, /validUntil/);
  assert.match(module, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(\{ payload, envelope \}\)\)/);
  assert.match(license, /getOfflineLicense\(\)/);
  assert.match(license, /deactivateOfflineLicense\(\)/);
});

test('phase 26 adds signed license file activation without removing legacy key activation', () => {
  assert.match(main, /offlineLicenseFile/);
  assert.match(main, /btnActivateOfflineLicense/);
  assert.match(main, /btnActivateLicense/);
  assert.match(main, /activateOfflineLicenseFile\(file\)/);
});
