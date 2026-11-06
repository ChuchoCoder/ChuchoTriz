import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir, chmod, rm, mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { ciRevisions, inspectOutgoing, outgoingDiff, pushRange } from './outgoing.mjs';

const tools = JSON.parse(await readFile(new URL('./tools.json', import.meta.url), 'utf8'));
const [mode, remoteUrl] = process.argv.slice(2);
if (mode && (mode !== '--pre-push' || !remoteUrl)) throw new Error('Modo de escaneo inválido.');
const prePush = mode === '--pre-push';
const { revisions, refMetadata = [] } = prePush ? pushRange(remoteUrl) : { revisions: ciRevisions() };
if (prePush && !revisions.length) process.exit(0);

// The hook is installed under Git's common dir. Review approvals travel with the checkout.
const approvals = prePush ? join(process.cwd(), 'scripts/security/reviewed-media.json')
  : new URL('./reviewed-media.json', import.meta.url);
let metadata;
if (revisions.length) {
  const json = await readFile(approvals, 'utf8').catch(error => {
    if (prePush && error.code === 'ENOENT') return '{}';
    throw error;
  });
  let reviewed;
  try {
    reviewed = new Map(Object.entries(JSON.parse(json)));
    if ([...reviewed.values()].some(value => !Array.isArray(value))) throw new Error();
  } catch {
    throw new Error('La lista de archivos revisados tiene un formato inválido.');
  }
  metadata = [...refMetadata, inspectOutgoing(revisions, reviewed, prePush)].join('\n');
}

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { stdio: 'inherit', shell: false, timeout: 240_000, ...options });
  if (result.error || result.status !== 0) throw new Error(`${basename(file)} failed (${result.status ?? result.error?.code})`);
}
async function findBinary(dir, name) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return path;
    if (entry.isDirectory()) {
      const found = await findBinary(path, name);
      if (found) return found;
    }
  }
}

async function scan(binary, dir, args, scope, input) {
  const report = join(dir, `${scope}.jsonl`);
  const template = join(dir, 'report.template');
  // Paths can themselves contain private data. Only include them in local diagnostics.
  const location = prePush && scope === 'changes' ? '"file" .File "line" .StartLine' : '';
  await writeFile(template, `{{range .}}{{dict "rule" .RuleID "scope" "${scope}" "commit" .Commit ${location} | toJson}}{{"\\n"}}{{end}}`);
  const options = { stdio: ['pipe', 'ignore', 'ignore'], input,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' } };
  try {
    run(binary, [...args, '--redact=100', '--no-banner', '--report-format=template',
      `--report-template=${template}`, `--report-path=${report}`], options);
  } finally {
    const findings = await readFile(report, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    if (findings.trim()) console.error(findings.trimEnd());
  }
}

// No repository/CI token is passed to these tools. Downloads fail closed on hash mismatch.
for (const name of prePush ? ['gitleaks'] : ['zizmor', 'gitleaks']) {
  const tool = tools[name];
  const asset = tool[process.platform];
  if (!asset || process.arch !== 'x64') throw new Error('Security tools currently support Linux/Windows x64');
  const dir = await mkdtemp(join(tmpdir(), `chuchotriz-${name}-`));
  try {
    const commonDir = prePush && execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    const cache = commonDir && join(commonDir, 'privacy-tools');
    const cachedArchive = cache && join(cache, asset.asset);
    const cachedData = cachedArchive && await readFile(cachedArchive).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
    let data = cachedData;
    if (!data) {
      const url = `https://github.com/${tool.repository}/releases/download/v${tool.version}/${asset.asset}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`Download failed: ${name} HTTP ${response.status}`);
      data = Buffer.from(await response.arrayBuffer());
    }
    if (createHash('sha256').update(data).digest('hex') !== asset.sha256) throw new Error(`SHA-256 mismatch: ${name}`);
    const archive = join(dir, asset.asset);
    await writeFile(archive, data);
    // Git for Windows puts GNU tar first on PATH, but the Windows assets are ZIPs.
    const tar = process.platform === 'win32' ? join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';
    run(tar, ['-xf', asset.asset], { cwd: dir });
    const binary = await findBinary(dir, name + (process.platform === 'win32' ? '.exe' : ''));
    if (!binary) throw new Error(`Missing binary: ${name}`);
    await chmod(binary, 0o755);
    if (cache && !cachedData) {
      await mkdir(cache, { recursive: true });
      await rename(archive, cachedArchive).catch(error => {
        // The Git directory can live on another volume. The scan still uses the verified binary.
        if (!['EXDEV', 'EEXIST', 'EPERM'].includes(error.code)) throw error;
      });
    }
    if (name === 'zizmor') run(binary, ['--offline', '--no-progress', '--min-severity', 'low', '.github/workflows']);
    else {
      if (!prePush) await scan(binary, dir, ['git', '.'], 'history');
      if (revisions.length) {
        const config = ['--config', fileURLToPath(new URL('./outgoing-gitleaks.toml', import.meta.url)), '--ignore-gitleaks-allow'];
        await scan(binary, dir, ['git', ...config, `--log-opts=${[...outgoingDiff, '--format=medium', '--text', ...revisions, '--'].join(' ')}`, '.'], 'changes');
        await scan(binary, dir, ['stdin', ...config], 'metadata', metadata);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
