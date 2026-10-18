import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const tools = JSON.parse(await readFile(new URL('./tools.json', import.meta.url), 'utf8'));
function run(file, args) {
  const result = spawnSync(file, args, { stdio: 'inherit', shell: false, timeout: 240_000 });
  if (result.error || result.status !== 0) throw new Error(`${file} failed (${result.status ?? result.error?.code})`);
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
// No repository/CI token is passed to these tools. Downloads fail closed on hash mismatch.
for (const name of ['zizmor', 'gitleaks']) {
  const tool = tools[name];
  const asset = tool[process.platform];
  if (!asset || process.arch !== 'x64') throw new Error('Security tools currently support Linux/Windows x64');
  const dir = await mkdtemp(join(tmpdir(), `chuchotriz-${name}-`));
  try {
    const url = `https://github.com/${tool.repository}/releases/download/v${tool.version}/${asset.asset}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Download failed: ${name} HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(data).digest('hex') !== asset.sha256) throw new Error(`SHA-256 mismatch: ${name}`);
    const archive = join(dir, asset.asset);
    await writeFile(archive, data);
    run('tar', ['-xf', archive, '-C', dir]);
    const binary = await findBinary(dir, name + (process.platform === 'win32' ? '.exe' : ''));
    if (!binary) throw new Error(`Missing binary: ${name}`);
    await chmod(binary, 0o755);
    if (name === 'zizmor') run(binary, ['--offline', '--no-progress', '--min-severity', 'low', '.github/workflows']);
    else {
      const report = join(dir, 'findings.json');
      try {
        run(binary, ['git', '--redact=100', '--no-banner', '--report-format=json', `--report-path=${report}`, '.']);
      } finally {
        // Print locations, never matched lines or secret values, even on a failed scan.
        const findings = JSON.parse(await readFile(report, 'utf8').catch(error => {
          if (error.code === 'ENOENT') return '[]';
          throw error;
        }));
        for (const finding of findings) console.error(JSON.stringify({ rule: finding.RuleID, file: finding.File, line: finding.StartLine, fingerprint: finding.Fingerprint }));
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
