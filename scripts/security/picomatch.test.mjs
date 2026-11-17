import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertVendoredPicomatch } from './vendored-picomatch.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
assertVendoredPicomatch();
const pm = require('picomatch');

test('tooling resolves the reviewed local implementation and retains ordinary glob APIs', () => {
  assert.equal(require.resolve('picomatch'), join(root, 'vendor/picomatch/index.js'));
  const lock = require('../../package-lock.json');
  assert.deepEqual(Object.keys(lock.packages).filter(p => /(?:^|\/)node_modules\/picomatch$/.test(p)), ['node_modules/picomatch']);
  assert.equal(pm('src/**/*.test.{ts,tsx}')('src/ratios/model.test.ts'), true);
  assert.equal(pm('src/**/*.test.{ts,tsx}')('src/ratios/model.ts'), false);
  assert.equal(pm('**/*.?(c|m)[jt]s?(x)')('src/model.test.tsx'), true);
  assert.equal(pm('**/*.@(js|ts)')('src/model.ts'), true);
  assert.equal(pm('!**/node_modules/**')('src/model.ts'), true);
  assert.equal(pm.makeRe('*.js').test('index.js'), true);
  assert.equal(pm.scan('src/**/*.ts').base, 'src');
  assert.equal(typeof pm.parse('src/**/*.ts').output, 'string');
  assert.equal(require('picomatch/posix')('src/*.ts')('src/a.ts'), true);
});

test('unbounded repeated extglobs are literal and cannot stall the tooling process', () => {
  // Run outside the test process: a regression must fail within a fixed limit.
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const pm = require('picomatch');
    const cases = ['+(*)', '+(*a)', '*(*a)', '*(*)', '+(a*)', '+(*a|b)', '*(*a|b)', '+(@(*a))', '+(+(a|aa))'];
    for (const options of [{}, { maxExtglobRecursion: false }]) {
      for (const pattern of cases) {
        assert.equal(pm(pattern, options)('a'.repeat(10000) + '!'), false);
        assert.equal(pm(pattern, options)(pattern), true);
      }
    }
  `], { cwd: root, encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});

test('source pinning rejects edited and additional vendor files', t => {
  const directory = mkdtempSync(join(tmpdir(), 'chuchotriz-picomatch-test-'));
  t.after(() => {
    if (!resolve(directory).startsWith(join(resolve(tmpdir()), 'chuchotriz-picomatch-test-'))) throw Error('Unexpected temporary path');
    rmSync(directory, { recursive: true, force: true });
  });
  cpSync(join(root, 'vendor/picomatch'), directory, { recursive: true });
  assert.doesNotThrow(() => assertVendoredPicomatch(directory));
  writeFileSync(join(directory, 'extra.js'), '');
  assert.throws(() => assertVendoredPicomatch(directory), /Unreviewed/);
  rmSync(join(directory, 'extra.js'));
  writeFileSync(join(directory, 'lib/parse.js'), 'changed');
  assert.throws(() => assertVendoredPicomatch(directory), /changed/);
});
