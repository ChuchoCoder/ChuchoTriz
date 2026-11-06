import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const objectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const zero = /^0+$/;
const privateArtifact = /(?:^|\/)(?:\.playwright-mcp|playwright-report|test-results|browser-profile)(?:\/|$)|(?:^|\/)\.env(?:\.(?!(?:example|sample|template)$)[^/]+)?$|(?:^|\/)(?:(?:storage[-_.]?state|cookies|credentials)\.json|Login Data|Local State|Cookies|\.gitleaksignore)$|\.(?:har|log|sqlite3?|db|dump|csv|tsv|xlsx?|ods|zip|7z|rar|tar|gz|pfx|p12|pem|key)$/i;
const media = /\.(?:png|jpe?g|gif|webp|avif|bmp|tiff?|heic|ico|svg|pdf|docx?|odt|mp4|mov|webm)$/i;

function git(args, input) {
  const result = spawnSync('git', ['--no-replace-objects', ...args], {
    encoding: 'utf8',
    input,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.status !== 0) {
    throw new Error(`No se pudo verificar el push (git ${args[0]}: ${result.error?.code ?? result.status}).`);
  }
  return result.stdout;
}

export function pushRange(remoteUrl) {
  const localIds = new Set();
  const refMetadata = [];
  for (const line of readFileSync(0, 'utf8').trim().split(/\r?\n/).filter(Boolean)) {
    const [, localId, remoteRef, remoteId] = line.split(' ');
    if (!objectId.test(localId) || !objectId.test(remoteId)) throw new Error('Git devolvió referencias de push inválidas.');
    if (zero.test(localId)) continue;
    localIds.add(localId);
    refMetadata.push(remoteRef);
  }
  if (!localIds.size) return { revisions: [], refMetadata };
  const outgoing = [...localIds].map(id => git(['rev-parse', '--verify', `${id}^{commit}`]).trim());
  for (const id of localIds) {
    let object = id;
    while (git(['cat-file', '-t', object]).trim() === 'tag') {
      const tag = git(['cat-file', '-p', object]);
      refMetadata.push(tag);
      object = tag.split('\n', 1)[0].slice('object '.length);
      if (!objectId.test(object)) throw new Error('Git devolvió un tag inválido.');
    }
  }

  // Use the destination's current refs. Local tracking refs can be stale or point to a different remote.
  const advertised = git(['ls-remote', '--refs', '--', remoteUrl]).trim().split('\n')
    .map(line => line.split('\t')[0]).filter(id => objectId.test(id));
  const known = git(['cat-file', '--batch-check=%(objectname) %(objecttype)'],
    [...new Set(advertised)].map(id => `${id}^{commit}\n`).join(''));
  const published = new Set(known.split('\n').filter(line => line.endsWith(' commit')).map(line => line.split(' ')[0]));
  return { revisions: [...outgoing, ...[...published].map(id => `^${id}`)], refMetadata };
}

export function ciRevisions() {
  if (!process.env.GITHUB_EVENT_PATH) return [];
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const base = event.pull_request?.base.sha ?? event.merge_group?.base_sha ?? event.before;
  if (!base) return [];
  const head = process.env.GITHUB_SHA;
  if (!objectId.test(base) || !objectId.test(head)) throw new Error('GitHub devolvió referencias de CI inválidas.');
  return zero.test(base) ? [head] : [head, `^${base}`];
}

export const outgoingDiff = ['--root', '--full-history', '--diff-merges=first-parent', '--no-color', '--no-renames',
  '--no-ext-diff', '--no-textconv'];

export function inspectOutgoing(revisions, reviewed, local) {
  const changes = git(['log', ...outgoingDiff, '--format=', '--raw', '--numstat', '-z', '--no-abbrev',
    '--diff-filter=AMT', ...revisions, '--']).split('\0');
  const findings = new Set();
  const files = [];
  const binaryPaths = new Set();
  for (let index = 0; index < changes.length; index++) {
    const record = changes[index].trimStart();
    if (record.startsWith('-\t-\t')) binaryPaths.add(record.slice(4));
    if (!record.startsWith(':')) continue;
    const [, mode, , blob] = record.split(' ');
    files.push({ path: changes[++index], mode, blob });
  }
  for (const { path, mode, blob } of files) {
    if (privateArtifact.test(path) || mode === '160000') {
      findings.add(`Artefacto privado: ${JSON.stringify(path)}`);
    } else if ((media.test(path) || binaryPaths.has(path)) && !reviewed.get(path)?.includes(blob)) {
      findings.add(`Archivo binario o visual sin revisión: ${JSON.stringify(path)} (blob ${blob})`);
    }
  }
  if (local) for (const finding of findings) console.error(finding);
  if (findings.size) throw new Error(`El control de privacidad bloqueó ${findings.size} archivos del historial saliente por su tipo o falta de revisión.`);

  const commits = git(['log', '--no-notes', '--no-show-signature', '--format=%ae%n%ce%n%B', ...revisions, '--']);
  return [commits, ...new Set(files.map(file => file.path))].join('\n');
}
