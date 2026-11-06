import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const customHooks = spawnSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' });
if (customHooks.error || customHooks.status !== 1) {
  throw new Error('Ya hay un core.hooksPath configurado o no se pudo consultar. Conservá tus hooks y encadená el control de privacidad.');
}
const commonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
const hooks = join(commonDir, 'hooks');
const target = join(commonDir, 'chuchotriz-privacy');
const hook = join(hooks, 'pre-push');
const source = await readFile(new URL('../../.githooks/pre-push', import.meta.url), 'utf8');
const existing = await readFile(hook, 'utf8').catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
if (existing !== null && existing !== source) throw new Error('Ya hay un pre-push instalado. Conservá ese hook y encadená el control de privacidad.');

await mkdir(hooks, { recursive: true });
await mkdir(target, { recursive: true });
for (const file of ['run-tools.mjs', 'outgoing.mjs', 'tools.json', 'outgoing-gitleaks.toml']) {
  await writeFile(join(target, file), await readFile(new URL(file, import.meta.url)));
}
if (existing === null) await writeFile(hook, source, { flag: 'wx', mode: 0o755 });
await chmod(hook, 0o755);
console.log('Pre-push de privacidad instalado para este clon y sus worktrees.');
