import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reviewed original npm 4.0.7 plus the documented fail-closed parser change.
// CRLF/LF checkout differences are normalized; all other content is pinned.
const expected = {
  "index.js": "02ae26406508e28f9ba0865be16cf77f0b33de6c4d4d49c212c4176df1d5625a",
  "lib/constants.js": "c28f952d2758261fe5428a121add485cc25b03e0193633f649de903dc0e5e222",
  "lib/parse.js": "0c6fd62e76d9ae91957e59629f4ea8e579c87e45dcd2174187fdf6509ce99aa8",
  "lib/picomatch.js": "fdd249d7ffff853f3bb1c77eafc8baa1a437bea85a94c35877b83c6a40d9ca94",
  "lib/scan.js": "6457a1764e5c2e543cc3a0c00ce12ebb3764097628868198370b64d4e642aaae",
  "lib/utils.js": "f04604f70cd1a3f6ace80b84766468674ff38b4bb83818d2ef1d81fc6355f935",
  "LICENSE": "d0cd141b0c322fded5dfad1d4645bb2fedfc05b7321fe1009469638190d59ef9",
  "package.json": "92bb80d4fc1a3dbf1348af086dfcc06c036bc05606fd492907c39e36778a336f",
  "posix.js": "5695ff5dfcd5a338a40630bd506056f2950bcb08fe1cc068519cbbfe60add480",
  "README.md": "3e4b453eb4dc5f0467d9dd72453b5277f599159cd751b12e9513c970ad40c28f"
};

export function assertVendoredPicomatch(directory = new URL('../../vendor/picomatch/', import.meta.url)) {
  const root = directory instanceof URL ? fileURLToPath(directory) : resolve(directory);
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw Error('Vendored picomatch must be a real directory');
  const found = [];
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error('Vendored picomatch cannot contain symlinks');
      const path = prefix + entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), path + '/');
      else if (entry.isFile()) found.push(path);
      else throw Error('Unsupported vendored picomatch entry');
    }
  };
  walk(root);
  if (JSON.stringify(found.sort()) !== JSON.stringify(Object.keys(expected).sort())) throw Error('Unreviewed vendored picomatch files');
  for (const path of found) {
    const text = readFileSync(join(root, path), 'utf8').replaceAll('\r\n', '\n');
    if (createHash('sha256').update(text).digest('hex') !== expected[path]) throw Error('Vendored picomatch changed: ' + path);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertVendoredPicomatch();
  console.log('Reviewed vendored picomatch verified');
}
