import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, unlinkSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { StdioClient, toolJSON } from './mcp-stdio.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv.includes('--smoke') ? 'smoke' : 'regression';
const launcher = process.env.CHUCHOTRIZ_BROWSER_LAUNCHER ?? join(process.env.LOCALAPPDATA ?? '', 'AgentBrowsers/ChuchoTriz/Start-Browser.ps1');
const output = join(root, 'test-results', `qa-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`);
mkdirSync(output, { recursive: true });
const report = { mode, startedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  version: JSON.parse(readFileSync(join(root, 'manifest.json'))).version, cases: [], manual: 'See docs/manual-regression.md: installed Matriz, live freshness and human visual review.' };
const lock = join(tmpdir(), 'chuchotriz-free-qa.lock');
let lockFd, client, server, fixture;
const groups = ['opening', 'presets', 'autocomplete', 'quotes', 'columns', 'tooltip', 'preload', 'position', 'operations', 'analysis'];
if (mode === 'regression') groups.push('oracle', 'editing', 'accounting', 'scope', 'roll', 'limits', 'reader-errors', 'layout');
const call = async code => toolJSON(await client.request('tools/call', { name: 'browser_run_code_unsafe', arguments: { code } }, 180000));
function save() {
  report.finishedAt = new Date().toISOString();
  report.passed = report.cases.filter(c => c.status === 'PASS').length;
  report.failed = report.cases.filter(c => c.status !== 'PASS').length;
  const escape = s => String(s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  report.complete = !report.selectedGroup && report.failed === 0 && report.completedSuites?.length === report.expectedSuites?.length;
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(output, 'report.md'), `# ChuchoTriz ${report.version} — ${mode}${report.selectedGroup ? ' (PARTIAL: ' + report.selectedGroup + ')' : ''}\n\nCommit: ${report.commit}${report.dirty ? ' (working tree modified)' : ''}\n\n${report.passed} PASS / ${report.failed} FAIL. ${report.complete ? 'All suites in this mode completed.' : 'Incomplete or deliberately partial run.'} Synthetic data only; not broker validation.\n\nExpected suites: ${(report.expectedSuites ?? []).join(', ')}.\nCompleted: ${(report.completedSuites ?? []).join(', ')}.\n\n| Case | Result | Detail |\n| --- | --- | --- |\n${report.cases.map(c => `| ${escape(c.id)} | ${c.status} | ${escape(c.detail)} |`).join('\n')}\n\nManual: ${report.manual}\n`);
}
try {
  if (process.platform !== 'win32' || !existsSync(launcher)) throw Error('Shared ChuchoTriz launcher unavailable. Set CHUCHOTRIZ_BROWSER_LAUNCHER to Start-Browser.ps1 on Windows. No isolated browser fallback.');
  try { lockFd = openSync(lock, 'wx'); writeFileSync(lockFd, String(process.pid)); }
  catch { throw Error(`Another QA run holds ${lock}. If interrupted, verify that its recorded PID is gone before removing the lock.`); }
  report.zipSHA256 = createHash('sha256').update(readFileSync(join(root, `releases/chuchotriz-free-${report.version}.zip`))).digest('hex');
  client = new StdioClient('pwsh', ['-NoLogo', '-NoProfile', '-File', launcher, '-Mcp']);
  await client.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chuchotriz-free-qa', version: '1.0.0' } });
  client.notify('notifications/initialized');
  const tools = await client.request('tools/list', {});
  if (!tools.tools.some(t => t.name === 'browser_run_code_unsafe')) throw Error('The shared MCP server does not expose browser_run_code_unsafe. Update its configured launcher; no fallback browser will be opened.');
  server = spawn(process.execPath, [join(root, 'tools/preview-free.mjs')], { cwd: root, env: { ...process.env, CHUCHOTRIZ_PREVIEW_PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  fixture = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Fixture startup timed out')), 10000);
    let data = '';
    server.on('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', () => { clearTimeout(timer); reject(Error('Fixture exited before startup')); });
    server.stdout.on('data', chunk => { data += chunk; const match = data.match(/Local preview: (http:\/\/127\.0\.0\.1:\d+)/); if (match) { clearTimeout(timer); resolve(match[1] + '/fixture?scenario=regression'); } });
    server.stderr.on('data', () => {});
  });
  await call(`async page => {
    const testPage = await page.context().newPage();
    testPage.qaBlockedOrigins = [];
    await testPage.route('**/*', route => {
      const origin = new URL(route.request().url()).origin;
      if (origin === ${JSON.stringify(new URL(fixture).origin)}) return route.continue();
      testPage.qaBlockedOrigins.push(origin); return route.abort();
    });
    await testPage.routeWebSocket('**/*', socket => {
      testPage.qaBlockedOrigins.push(new URL(socket.url()).origin); socket.close();
    });
    await testPage.goto(${JSON.stringify(fixture)}); return { ready: true };
  }`);
  const source = readFileSync(join(root, 'tools/qa/browser-cases.js'), 'utf8');
  let suites = mode === 'regression' ? ['baseline', ...groups] : groups;
  report.expectedSuites = [...suites]; report.completedSuites = [];
  const selected = process.argv.find(arg => arg.startsWith('--group='))?.slice(8);
  if (selected) {
    if (!suites.includes(selected)) throw Error(`Unknown group: ${selected}`);
    report.selectedGroup = selected;
    suites = [selected];
  }
  for (const group of suites) {
    console.log(`QA ${group}...`);
    const suite = group === 'baseline' ? readFileSync(join(root, 'tools/validate-options-simulator.playwright.js'), 'utf8') : source;
    try {
      const result = await call(`async currentPage => {
        const page = currentPage.context().pages().find(p => p.url() === ${JSON.stringify(fixture)});
        if (!page) throw Error('The owned fixture tab is no longer available.');
        const session = await page.context().newCDPSession(page);
        const viewport = page.viewportSize();
        const errors = [];
        const onError = error => errors.push(error.message);
        page.on('pageerror', onError);
        try {
          await session.send('Emulation.setFocusEmulationEnabled', {enabled:true});
          await page.setViewportSize({width:1440,height:1000});
          page.setDefaultTimeout(6000);
          const result = await (${suite})(page, ${JSON.stringify(group)});
          if (errors.length) throw Error('Uncaught page errors: ' + errors.join('; '));
          if (page.qaBlockedOrigins.length) throw Error('Unexpected external requests were blocked: ' + page.qaBlockedOrigins.join(', '));
          return result;
        } catch (error) {
          if (page.url() === ${JSON.stringify(fixture)}) await page.screenshot({path:${JSON.stringify(join(output, group + '.png'))}}).catch(() => {});
          throw error;
        } finally {
          page.removeListener('pageerror', onError);
          if (viewport) await page.setViewportSize(viewport);
          else await session.send('Emulation.clearDeviceMetricsOverride');
          await session.send('Emulation.setFocusEmulationEnabled', {enabled:false});
          await session.detach();
        }
      }`);
      if (group === 'baseline') {
        if (result.passed !== 34 || result.checks?.length !== 34) throw Error('Incomplete baseline result');
        report.cases.push(...result.checks.map((detail, i) => ({ id: `BASE-${i + 1}`, status: 'PASS', detail })));
      } else {
        if (!result?.cases?.length || result.cases.some(c => !['PASS', 'FAIL'].includes(c.status))) throw Error('Incomplete case result');
        report.cases.push(...result.cases);
      }
      report.completedSuites.push(group);
    } catch (error) {
      report.cases.push({ id: group, status: 'FAIL', detail: error.message });
    }
    save();
    console.log(`  ${report.passed} PASS / ${report.failed} FAIL (accumulated)`);
  }
} catch (error) {
  report.cases.push({ id: 'infrastructure', status: 'FAIL', detail: error.message });
} finally {
  if (client && fixture) {
    try { await call(`async page => { const own = page.context().pages().find(p => p.url() === ${JSON.stringify(fixture)}); if (own) await own.close(); return {closedOwnedTab:!!own}; }`); }
    catch (error) { report.cases.push({ id: 'cleanup', status: 'FAIL', detail: error.message }); }
  }
  await client?.close();
  server?.kill();
  if (lockFd !== undefined) { closeSync(lockFd); unlinkSync(lock); }
  save();
}
console.log(`Report: ${join(output, 'report.md')}`);
process.exitCode = report.failed ? 1 : 0;
