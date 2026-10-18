import { readFile, readdir } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { checkLock, checkWorkflow, checkManifest } from './policy.mjs';

const json = async path => JSON.parse(await readFile(path, 'utf8'));
for (const dir of ['.']) {
  checkLock(await json(`${dir}/package.json`), await json(`${dir}/package-lock.json`));
}
for (const name of await readdir('.github/workflows')) {
  if (!/\.ya?ml$/.test(name)) continue;
  const doc = parseDocument(await readFile(`.github/workflows/${name}`, 'utf8'), { uniqueKeys: true });
  if (doc.errors.length) throw new Error(`${name}: invalid workflow YAML`);
  checkWorkflow(doc.toJS());
}
checkManifest(await json('manifest.json'));
if (process.argv.includes('--dist')) checkManifest(await json('dist/manifest.json'), true);
console.log('Security policy passed: lockfiles, workflow permissions/pins/triggers, extension manifest.');
