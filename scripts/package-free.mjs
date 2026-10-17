import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { checkFree, filesIn } from './check-free.mjs';

checkFree({ built: true });
const dist = new URL('../dist/', import.meta.url);
const files = Object.fromEntries(filesIn(fileURLToPath(dist)).map(path => [path, new Uint8Array(readFileSync(new URL(path, dist)))]));
const version = JSON.parse(readFileSync(new URL('manifest.json', dist), 'utf8')).version;
mkdirSync(new URL('../releases/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../releases/chuchotriz-free-${version}.zip`, import.meta.url), zipSync(files));
console.log(`Created releases/chuchotriz-free-${version}.zip from verified dist (${Object.keys(files).length} files)`);
