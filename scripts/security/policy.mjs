// Free retains the stricter source and package manifest contract.
export { assertManifest as checkManifest } from '../check-free.mjs';

const version = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const fail = (message) => { throw new Error(message); };

export function checkLock(pkg, lock) {
  if (lock.lockfileVersion !== 3 || !lock.packages?.['']) fail('A v3 npm lockfile is required');
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const declared = pkg[section] || {};
    const locked = lock.packages[''][section] || {};
    if (JSON.stringify(Object.keys(declared).sort()) !== JSON.stringify(Object.keys(locked).sort())) fail(`Lockfile drift in ${section}`);
    for (const [name, spec] of Object.entries(declared)) {
      if (!version.test(spec)) fail(`Use an exact registry version for ${name}`);
      if (locked[name] !== spec || lock.packages[`node_modules/${name}`]?.version !== spec) fail(`Lockfile drift for ${name}`);
    }
  }
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue;
    if (entry.link || !version.test(entry.version)) fail(`Non-registry package: ${path}`);
    let url;
    try { url = new URL(entry.resolved); } catch { fail(`Missing registry URL: ${path}`); }
    if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.port || url.username || url.password) fail(`Untrusted registry: ${path}`);
    if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity)) fail(`Missing SHA-512 integrity: ${path}`);
  }
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) {
    if (pkg.scripts?.[name]) fail(`Automatic lifecycle script requires review: ${name}`);
  }
}

export function checkWorkflow(workflow) {
  const events = typeof workflow.on === 'string' ? [workflow.on] : Array.isArray(workflow.on) ? workflow.on : Object.keys(workflow.on || {});
  const allowedEvents = new Set(['pull_request', 'push', 'schedule', 'workflow_dispatch', 'merge_group']);
  if (!events.length || events.some(event => !allowedEvents.has(event))) fail('Unsafe or unsupported workflow trigger');
  const checkPermissions = permissions => {
    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) fail('Explicit least-privilege permissions are required');
    for (const [scope, value] of Object.entries(permissions)) {
      if (value !== 'none' && !(scope === 'contents' && value === 'read')) fail(`Unexpected token permission: ${scope}:${value}`);
    }
  };
  checkPermissions(workflow.permissions);
  for (const job of Object.values(workflow.jobs || {})) {
    if (job.permissions) checkPermissions(job.permissions);
    const runners = new Set(['ubuntu-latest', 'windows-latest', 'ubuntu-24.04', 'windows-2025']);
    const matrix = job.strategy?.matrix;
    if (job['runs-on'] === '${{ matrix.os }}') {
      if (!Array.isArray(matrix?.os) || !matrix.os.length || matrix.os.some(os => !runners.has(os)) ||
        (matrix.include || []).some(entry => entry.os !== undefined && !runners.has(entry.os))) fail('Untrusted matrix runner');
    } else if (!runners.has(job['runs-on'])) fail('Use an ephemeral GitHub-hosted runner');
    if (!Number.isInteger(job['timeout-minutes']) || job['timeout-minutes'] > 20 || job['timeout-minutes'] < 1) fail('A bounded job timeout is required');
    if (job.container || job.services || job.uses) fail('Containers and reusable jobs need an explicit policy review');
    for (const step of job.steps || []) {
      if (step.uses) {
        if (!/^actions\/(checkout|setup-node)@[a-f0-9]{40}$/.test(step.uses)) fail(`Unapproved or unpinned action: ${step.uses}`);
        if (step.uses.startsWith('actions/checkout@') && step.with?.['persist-credentials'] !== false) fail('Checkout must discard credentials');
      }
      if (step.run?.includes('${{')) fail('Pass expressions through env, never interpolate them into shell scripts');
    }
  }
}

