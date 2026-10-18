import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ESLint } from 'eslint';
import { parseDocument } from 'yaml';
import { checkLock, checkWorkflow, checkManifest } from './policy.mjs';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const workflow = () => ({ on: { pull_request: null }, permissions: { contents: 'read' }, jobs: {
  scan: { 'runs-on': 'ubuntu-latest', 'timeout-minutes': 10, steps: [
    { uses: `actions/checkout@${'a'.repeat(40)}`, with: { 'persist-credentials': false } },
    { run: 'npm ci --ignore-scripts' },
  ] },
} });

test('accepts committed lock and manifest policy', () => {
  checkLock(pkg, lock);
  checkManifest(manifest);
  checkWorkflow(workflow());
});
test('rejects mutable versions, Git/file dependencies, foreign registries, missing/malformed integrity and lock drift', () => {
  for (const mutate of [
    (p) => { p.dependencies.react = '^18.0.0'; },
    (p) => { p.dependencies.react = 'git+https://example.com/react'; },
    (p, l) => { l.packages['node_modules/react'].resolved = 'https://example.com/react.tgz'; },
    (p, l) => { delete l.packages['node_modules/react'].integrity; },
    (p, l) => { l.packages['node_modules/react'].integrity = 'sha512-invalid'; },
    (p, l) => { l.packages['node_modules/react'].link = true; },
    (p, l) => { l.packages[''].dependencies.react = '0.0.1'; },
    (p) => { p.scripts.postinstall = 'node unreviewed.js'; },
  ]) {
    const p = structuredClone(pkg), l = structuredClone(lock);
    mutate(p, l);
    assert.throws(() => checkLock(p, l));
  }
});
test('rejects mutable actions, persisted tokens, write permissions, privileged triggers and shell interpolation', () => {
  for (const mutate of [
    w => { w.on = { pull_request_target: null }; },
    w => { w.on = { workflow_run: null }; },
    w => { w.permissions = 'write-all'; },
    w => { w.jobs.scan.permissions = { contents: 'write' }; },
    w => { w.jobs.scan.steps[0].uses = 'actions/checkout@v7'; },
    w => { w.jobs.scan.steps[0].with['persist-credentials'] = true; },
    w => { w.jobs.scan.steps[1].run = 'echo "${{ github.event.pull_request.title }}"'; },
    w => { w.jobs.scan['runs-on'] = 'self-hosted'; },
    w => { w.jobs.scan['runs-on'] = '${{ matrix.os }}'; w.jobs.scan.strategy = { matrix: { os: ['self-hosted'] } }; },
    w => { w.jobs.scan['runs-on'] = '${{ matrix.os }}'; w.jobs.scan.strategy = { matrix: { os: ['ubuntu-latest'], include: [{ os: 'self-hosted' }] } }; },
  ]) {
    const w = workflow(); mutate(w);
    assert.throws(() => checkWorkflow(w));
  }
});
test('rejects permission/host expansion, executable remote resources and weakened CSP', () => {
  for (const mutate of [
    m => { m.permissions.push('debugger'); },
    m => { m.host_permissions = ['<all_urls>']; },
    m => { m.externally_connectable = { matches: ['*://*/*'] }; },
    m => { m.content_scripts[0].matches = ['<all_urls>']; },
    m => { m.content_scripts[0].world = 'MAIN'; },
    m => { m.content_scripts[0].js = ['https://example.com/payload.js']; },
    m => { m.content_scripts[0].js = ['../payload.js']; },
    m => { m.web_accessible_resources = [{ matches: m.content_scripts[0].matches, resources: ['*'] }]; },
    m => { m.permissions.push('declarativeNetRequest'); },
    m => { m.background = { service_worker: 'worker.js' }; },
    m => { m.action = { default_popup: 'index.html' }; },
    m => { m.optional_permissions = ['storage']; },
    ...['all_frames', 'match_about_blank', 'match_origin_as_fallback'].map(field => m => { m.content_scripts[0][field] = true; }),
    m => { m.content_security_policy = { extension_pages: "script-src 'self' 'unsafe-eval'" }; },
  ]) {
    const m = structuredClone(manifest); mutate(m);
    assert.throws(() => checkManifest(m));
  }
});

test('preserves Free restrictions in built manifests as well as source', () => {
  const built = structuredClone(manifest);
  built.content_scripts[0].js = ['assets/main.tsx-loader-abc123.js'];
  built.web_accessible_resources = [{ matches: built.content_scripts[0].matches, resources: ['assets/src-main.tsx-abc123.js'] }];
  assert.doesNotThrow(() => checkManifest(built, true));
  for (const mutate of [
    m => { m.permissions.push('declarativeNetRequest'); },
    m => { m.web_accessible_resources[0].extension_ids = ['*']; },
    m => { m.web_accessible_resources[0].resources = ['bridge.js']; },
    m => { m.content_scripts[0].all_frames = true; },
    m => { m.content_security_policy = { extension_pages: "script-src 'self' 'unsafe-eval'" }; },
  ]) {
    const m = structuredClone(built); mutate(m); assert.throws(() => checkManifest(m, true));
  }
});

test('rejects literal remote imports in public code', async () => {
  const eslint = new ESLint();
  for (const source of ['https://example.com/payload.js', 'http://example.com/payload.js', '//example.com/payload.js', 'data:text/javascript,alert(1)', ' \thttps://example.com/payload.js', 'ht\ntps://example.com/payload.js', '\u0001https://example.com/payload.js', '\u0000https://example.com/payload.js']) {
    const literal = JSON.stringify(source);
    for (const code of [`import(${literal})`, `import payload from ${literal}`, `export { payload } from ${literal}`]) {
      const results = await eslint.lintText(code, { filePath: 'public/security-fixture.js' });
      assert.ok(results[0].errorCount > 0, `Remote import accepted: ${code}`);
    }
  }
});

test('rejects computed document write/writeln HTML sinks', async () => {
  const eslint = new ESLint();
  for (const document of ['document', 'window.document', 'window["document"]']) {
    for (const method of ['write', 'writeln']) {
      const code = `${document}["${method}"](input)`;
      const results = await eslint.lintText(code, { filePath: 'public/security-fixture.js' });
      assert.ok(results[0].errorCount > 0, `HTML sink accepted: ${code}`);
    }
  }
});

test('validation and Security run for all PRs, pushes and merge groups without skips', async () => {
  for (const name of ['ci', 'security']) {
    const workflow = parseDocument(await readFile(`.github/workflows/${name}.yml`, 'utf8')).toJS();
    for (const event of ['pull_request', 'push', 'merge_group', 'workflow_dispatch']) {
      assert.ok(Object.hasOwn(workflow.on, event), `Missing ${event} trigger`);
      assert.ok(!workflow.on[event]?.paths && !workflow.on[event]?.['paths-ignore']);
    }
    for (const job of Object.values(workflow.jobs)) assert.ok(!job.if, 'Required checks cannot skip drafts or bots');
    if (name === 'security') assert.ok(workflow.on.schedule.length > 0);
  }
});
test('ownership names only chuchocoder and root-only Dependabot updates remain enabled', async () => {
  const owners = (await readFile('.github/CODEOWNERS', 'utf8')).split('\n').filter(line => line.trim() && !line.startsWith('#'));
  assert.deepEqual(owners, ['* @chuchocoder']);
  const config = parseDocument(await readFile('.github/dependabot.yml', 'utf8')).toJS();
  assert.deepEqual(config.updates.find(update => update['package-ecosystem'] === 'npm').directories, ['/']);
  assert.ok(config.updates.some(update => update['package-ecosystem'] === 'github-actions'));
});
test('AST scanner rejects executable input and HTML injection, accepts plain text and local resources', async () => {
  const eslint = new ESLint();
  for (const code of [
    'eval(input)', '(0, eval)(input)', 'new Function(input)', 'setTimeout(input, 0)',
    'node.innerHTML = input', 'node["innerHTML"] = input',
    'node.insertAdjacentHTML("beforeend", input)', 'document.write(input)',
    'const view = <div dangerouslySetInnerHTML={{ __html: input }} />',
    'import(input)',
    'script.src = input', 'script.src = "https://example.com/payload.js"',
    'let callback = () => {}; callback = input; setTimeout(callback, 0)',
    'const callback = input; window.setTimeout(callback, 0)',
  ]) {
    const results = await eslint.lintText(code, { filePath: 'src/security-fixture.tsx' });
    assert.ok(results[0].errorCount > 0, `Scanner missed ${code}`);
  }
  for (const root of ['src', 'public']) {
    for (const extension of ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']) {
      const results = await eslint.lintText('eval(input)', { filePath: `${root}/security-fixture.${extension}` });
      assert.ok(results[0].errorCount > 0, `Scanner skipped ${root}/*.${extension}`);
    }
  }
  const results = await eslint.lintText('node.textContent = input; script.src = chrome.runtime.getURL("logo48.png"); setTimeout(() => callback(), 100); window.setTimeout(() => callback(), 100);', { filePath: 'src/security-fixture.ts' });
  assert.equal(results[0].errorCount, 0);
  for (const code of [
    'const stop = () => {}; setTimeout(stop, 100)',
    'function stop() {} window.setTimeout(stop, 100)',
    'script.src = chrome.runtime.getURL(scriptFile)',
    'import("./local-module.js")',
    'import { value } from "react"; export { value }',
    'writer.write(input)',
  ]) {
    const safe = await eslint.lintText(code, { filePath: 'src/security-fixture.ts' });
    assert.equal(safe[0].errorCount, 0, code);
  }
});
