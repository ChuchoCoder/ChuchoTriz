import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, unlinkSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { StdioClient, toolJSON } from './mcp-stdio.mjs';
import { testPlan } from './test-plan.mjs';
import { fixtureTheme } from './themes.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv.includes('--smoke') ? 'smoke' : 'regression';
const launcher = process.env.CHUCHOTRIZ_BROWSER_LAUNCHER ?? join(process.env.LOCALAPPDATA ?? '', 'AgentBrowsers/ChuchoTriz/Start-Browser.ps1');
const output = join(root, 'test-results', `qa-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`);
mkdirSync(output, { recursive: true });
const report = { mode, startedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  version: JSON.parse(readFileSync(join(root, 'manifest.json'))).version, cases: [], manual: 'See docs/manual-regression.md: installed Matriz, live freshness and human visual review.' };
const lock = join(tmpdir(), 'chuchotriz-free-qa.lock');
let lockFd, client;
const servers = new Map();
const call = async code => toolJSON(await client.request('tools/call', { name: 'browser_run_code_unsafe', arguments: { code } }, 180000));

function fixtureUrl(kind, theme) {
  const key = `${theme}/${kind}`;
  if (servers.has(key)) return servers.get(key).ready;
  const runner = kind === 'ratios' ? 'ratios-fixture.mjs' : 'preview-free.mjs';
  const processArgs = [join(root, 'tools', runner)];
  const child = spawn(process.execPath, processArgs, { cwd: root, env: {
    ...process.env, CHUCHOTRIZ_PREVIEW_PORT: '0', CHUCHOTRIZ_PREVIEW_THEME: theme,
  }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Fixture startup timed out: ${key}`)), 10000);
    let stdout = '', stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Fixture ${key} exited (${code}): ${stderr}`)); });
    child.stdout.on('data', chunk => {
      stdout += chunk;
      const match = stdout.match(/(?:Local preview|Ratios fixture): (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1] + (kind === 'ratios' ? '/fixture' : '/fixture?scenario=regression'));
      }
    });
  });
  servers.set(key, { child, ready });
  return ready;
}

function save() {
  report.finishedAt = new Date().toISOString();
  report.passed = report.cases.filter(c => c.status === 'PASS').length;
  report.failed = report.cases.filter(c => c.status !== 'PASS').length;
  const escape = s => String(s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  report.complete = !report.selectedGroup && report.failed === 0 && report.completedSuites?.length === report.expectedSuites?.length;
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(output, 'report.md'), `# ChuchoTriz ${report.version} — ${mode}${report.selectedGroup ? ' (PARTIAL: ' + report.selectedGroup + ')' : ''}\n\nCommit: ${report.commit}${report.dirty ? ' (working tree modified)' : ''}\n\n${report.passed} PASS / ${report.failed} FAIL. ${report.complete ? 'All suites in this mode completed in both themes.' : 'Incomplete or deliberately partial run.'} Synthetic data only.\n\nExpected suites: ${(report.expectedSuites ?? []).join(', ')}.\nCompleted: ${(report.completedSuites ?? []).join(', ')}.\n\n| Theme | Group | Case | Result | Detail |\n| --- | --- | --- | --- | --- |\n${report.cases.map(c => `| ${escape(c.theme)} | ${escape(c.group)} | ${escape(c.id)} | ${c.status} | ${escape(c.detail)} |`).join('\n')}\n\nManual: ${report.manual}\n`);
}
try {
  const selected = process.argv.find(arg => arg.startsWith('--group='))?.slice(8);
  const suites = testPlan(mode, selected);
  report.expectedSuites = testPlan(mode).map(suite => suite.id);
  report.completedSuites = [];
  if (selected) report.selectedGroup = selected;
  if (process.platform !== 'win32' || !existsSync(launcher)) throw Error('Shared ChuchoTriz launcher unavailable. Set CHUCHOTRIZ_BROWSER_LAUNCHER to Start-Browser.ps1 on Windows. No isolated browser fallback.');
  try { lockFd = openSync(lock, 'wx'); writeFileSync(lockFd, String(process.pid)); }
  catch { throw Error(`Another QA run holds ${lock}. If interrupted, verify that its recorded PID is gone before removing the lock.`); }
  report.zipSHA256 = createHash('sha256').update(readFileSync(join(root, `releases/chuchotriz-free-${report.version}.zip`))).digest('hex');
  client = new StdioClient('pwsh', ['-NoLogo', '-NoProfile', '-File', launcher, '-Mcp']);
  await client.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chuchotriz-free-qa', version: '1.0.0' } });
  client.notify('notifications/initialized');
  const tools = await client.request('tools/list', {});
  if (!tools.tools.some(t => t.name === 'browser_run_code_unsafe')) throw Error('The shared MCP server does not expose browser_run_code_unsafe. Update its configured launcher; no fallback browser will be opened.');
  for (const { id, group, theme, fixture, file, expectedChecks, groupArgument } of suites) {
    console.log(`QA ${id}...`);
    try {
      const url = await fixtureUrl(fixture, theme);
      const origin = new URL(url).origin;
      const suite = readFileSync(join(root, 'tools', file), 'utf8').trim().replace(/;$/, '');
      const result = await call(`async currentPage => {
        const page = await currentPage.context().newPage();
        const errors = [], blocked = [], origin = ${JSON.stringify(origin)};
        let session;
        try {
          session = await page.context().newCDPSession(page);
          page.on('pageerror', error => errors.push(error.message));
          await page.route('**/*', route => {
            const target = new URL(route.request().url()).origin;
            if (target === origin) return route.continue();
            blocked.push(target); return route.abort();
          });
          await page.routeWebSocket('**/*', socket => { blocked.push(new URL(socket.url()).origin); socket.close(); });
          await page.addInitScript(ownedOrigin => {
            if (location.origin !== ownedOrigin || sessionStorage.getItem('ct-qa-started')) return;
            localStorage.clear(); sessionStorage.setItem('ct-qa-started', '1');
          }, origin);
          await session.send('Emulation.setFocusEmulationEnabled', {enabled:true});
          await page.setViewportSize({width:1440,height:1000});
          await page.emulateMedia({colorScheme:${JSON.stringify(theme)}});
          page.setDefaultTimeout(6000);
          await page.goto(${JSON.stringify(url)}, {waitUntil:'domcontentloaded', timeout:15000});
          await page.bringToFront();
          const actual = await page.evaluate(() => ({
            fixture: document.documentElement.dataset.theme,
            scheme: getComputedStyle(document.documentElement).colorScheme,
            media: matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
          }));
          if (actual.fixture !== ${JSON.stringify(fixtureTheme(theme).attribute)}
            || actual.scheme !== ${JSON.stringify(theme)} || actual.media !== ${JSON.stringify(theme)}) {
            throw Error('Unexpected fixture theme: ' + JSON.stringify(actual));
          }
          const result = await (${suite})(page, ${JSON.stringify(groupArgument) ?? 'undefined'});
          if (errors.length) throw Error('Uncaught page errors: ' + errors.join('; '));
          if (blocked.length) throw Error('Unexpected external requests were blocked: ' + blocked.join(', '));
          return result;
        } catch (error) {
          if (new URL(page.url()).origin === origin) await page.screenshot({path:${JSON.stringify(join(output, `${theme}-${group}.png`))}, timeout:5000}).catch(() => {});
          throw error;
        } finally {
          if (session) await session.detach().catch(() => {});
          await page.close();
        }
      }`);
      if (expectedChecks && (result.checks?.length !== expectedChecks || result.passed !== expectedChecks)) throw Error('Incomplete baseline result');
      const cases = result.cases ?? result.checks?.map((detail, i) => ({ id: `${group}-${i + 1}`, status: 'PASS', detail }));
      if (!cases?.length || cases.some(c => !['PASS', 'FAIL'].includes(c.status) || typeof c.detail !== 'string')) throw Error('Incomplete case result');
      report.cases.push(...cases.map(c => ({ ...c, group, theme })));
      report.completedSuites.push(id);
    } catch (error) {
      report.cases.push({ id: group, group, theme, status: 'FAIL', detail: error.message });
    }
    save();
    console.log(`  ${report.passed} PASS / ${report.failed} FAIL (accumulated)`);
  }
} catch (error) {
  report.cases.push({ id: 'infrastructure', status: 'FAIL', detail: error.message });
} finally {
  await client?.close();
  for (const { child } of servers.values()) child.kill();
  if (lockFd !== undefined) { closeSync(lockFd); unlinkSync(lock); }
  save();
}
console.log(`Report: ${join(output, 'report.md')}`);
process.exitCode = report.failed ? 1 : 0;
