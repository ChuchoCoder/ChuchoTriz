import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const hosts = ['https://*.xoms.com.ar/*', 'https://remarkets.matriz.com.ar/*'];
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// Exact filenames require an explicit scope review whenever files are added.
export function assertAllowed(paths, allowed) {
  for (const path of paths) assert(allowed.includes(path), `Unreviewed free-edition file: ${path}`);
}

export function filesIn(directory, base = directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    const stat = lstatSync(path);
    assert(!stat.isSymbolicLink(), `Symbolic links are not allowed: ${path}`);
    return stat.isDirectory() ? filesIn(path, base) : [relative(base, path).replaceAll('\\', '/')];
  });
}

export function assertManifest(manifest, built = false) {
  assert(manifest.manifest_version === 3, 'Manifest V3 required');
  assert(same(manifest.permissions, ['storage']), 'Only the storage permission is allowed');
  for (const key of ['background', 'host_permissions', 'optional_permissions', 'optional_host_permissions',
    'externally_connectable', 'declarative_net_request', 'sandbox', 'devtools_page', 'side_panel', 'update_url', 'key']) {
    assert(!(key in manifest), `Unexpected manifest capability: ${key}`);
  }
  assert(manifest.content_scripts?.length === 1, 'Expected only the presets content script');
  const script = manifest.content_scripts[0];
  assert(same(script.matches, hosts), 'Unexpected content-script hosts');
  assert(!script.world || script.world === 'ISOLATED', 'Content script must use the isolated world');
  assert(script.js?.length === 1, 'Expected a single content-script entry');
  assert(script.run_at === 'document_end', 'Unexpected content-script timing');
  if (!built) {
    assert(same(script.js, ['src/main.tsx']), 'Unexpected content-script entry');
    assert(!manifest.web_accessible_resources, 'Source manifest must not expose page bridges');
  } else {
    assert(/^assets\/main\.tsx-loader-[\w-]+\.js$/.test(script.js[0]), 'Unexpected content loader');
    for (const resource of manifest.web_accessible_resources ?? []) {
      assert(same(resource.matches, hosts), 'Unexpected resource hosts');
      for (const path of resource.resources) {
        assert(/^assets\/(?:src-main\.tsx|InstrumentPresetsRepository)-[\w-]+\.js$/.test(path), 'Unexpected exposed resource');
      }
    }
  }
}

export function assertFreeText(text, path) {
  const forbidden = /\b(?:mep\w*|multileg\w*|multipata\w*|chuchotriz-premium)\b|matriz-bridge|CHUCHOTRIZ_BRIDGE|__matriz|\b(?:WebSocket|XMLHttpRequest|fetch|eval)\s*\(/i;
  assert(!forbidden.test(text), `Excluded functionality or network code found in ${path}`);
  assert(!/sourceMappingURL\s*=|(?:github_pat_|ghp_)[a-zA-Z0-9]{20,}|-----BEGIN [\w ]*PRIVATE KEY-----/.test(text),
    `Source map or possible secret found in ${path}`);
}

export function checkFree({ built = false, directory = root } = {}) {
  const allowed = readJson(join(directory, 'free-files.json'));
  const paths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: directory, encoding: 'utf8' }).split('\0').filter(Boolean);
  assertAllowed(paths, allowed);
  // Also inspect ignored files in build input directories: Git visibility is insufficient.
  for (const folder of ['src', 'public']) {
    const inputs = filesIn(join(directory, folder)).map(path => `${folder}/${path}`);
    assertAllowed(inputs, allowed);
    for (const path of inputs.filter(path => /\.(?:tsx?|css|js|json|txt)$/.test(path))) {
      assertFreeText(readFileSync(join(directory, path), 'utf8'), path);
    }
  }
  assertManifest(readJson(join(directory, 'manifest.json')));
  if (built) {
    const output = join(directory, 'dist');
    const staticFiles = ['manifest.json', 'index.html', ...allowed.filter(path => path.startsWith('public/')).map(path => path.slice(7))];
    const assetPattern = /^assets\/(?:main\.tsx-loader|src-main(?:\.tsx)?|InstrumentPresetsRepository|index(?:\.html)?|manifest)-[\w-]+\.(?:js|css|json)$/;
    const files = filesIn(output);
    for (const path of files) {
      assert(staticFiles.includes(path) || assetPattern.test(path), `Unexpected packaged file: ${path}`);
      if (/\.(?:js|css|json|html|txt)$/.test(path)) assertFreeText(readFileSync(join(output, path), 'utf8'), path);
    }
    const manifest = readJson(join(output, 'manifest.json'));
    assertManifest(manifest, true);
    const input = readJson(join(directory, 'manifest.json'));
    assert(manifest.version === input.version, 'Stale build version');
    const referenced = [manifest.options_page, manifest.action.default_popup, ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon), ...manifest.content_scripts.flatMap(script => [...script.js, ...(script.css ?? [])]),
      ...(manifest.web_accessible_resources ?? []).flatMap(resource => resource.resources)];
    for (const path of referenced) assert(files.includes(path), `Missing packaged resource: ${path}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkFree({ built: process.argv.includes('--dist') });
  console.log('Free-edition scope verified' + (process.argv.includes('--dist') ? ' (source and dist)' : ' (source)'));
}
