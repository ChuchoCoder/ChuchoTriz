import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowed, assertManifest, assertFreeText } from './check-free.mjs';

const manifest = () => ({ manifest_version: 3, permissions: ['storage'], content_scripts: [{
  matches: ['https://*.xoms.com.ar/*', 'https://remarkets.matriz.com.ar/*'], js: ['src/main.tsx'], run_at: 'document_end',
}] });

test('rejects an extra source file, including an unused module', () => {
  assert.throws(() => assertAllowed(['src/main.tsx', 'src/extra.ts'], ['src/main.tsx']), /Unreviewed/);
});
test('accepts the minimal manifest and rejects extra capabilities', () => {
  assert.doesNotThrow(() => assertManifest(manifest()));
  for (const change of [{ permissions: ['storage', 'tabs'] }, { background: {} }, { web_accessible_resources: [] },
    { host_permissions: ['<all_urls>'] }, { optional_permissions: ['scripting'] },
    { content_scripts: [{ ...manifest().content_scripts[0], world: 'MAIN' }] },
    { content_scripts: [{ ...manifest().content_scripts[0], matches: ['<all_urls>'] }] }]) {
    assert.throws(() => assertManifest({ ...manifest(), ...change }));
  }
});
test('rejects excluded UI, page bridges, network code, secrets and source maps', () => {
  for (const text of ['MepView', 'MultilegView', 'Multipata', 'matriz-bridge.js', 'ChuchoTriz-premium',
    'new WebSocket(url)', 'fetch(url)', 'eval(code)', '//# sourceMappingURL=main.js.map', 'ghp_' + 'x'.repeat(36)]) {
    assert.throws(() => assertFreeText(text, 'fixture.js'));
  }
  assert.doesNotThrow(() => assertFreeText('const presets = [{ cantidad: 100, mostrar: 0 }];', 'fixture.js'));
});
