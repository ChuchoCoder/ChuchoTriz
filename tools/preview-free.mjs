// Local, simulated data only. Serves the verified production package for UI review.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkFree, filesIn } from '../scripts/check-free.mjs';

checkFree({ built: true });
const dist = new URL('../dist/', import.meta.url);
const files = filesIn(fileURLToPath(dist));
const main = files.find(path => /^assets\/src-main\.tsx-[\w-]+\.js$/.test(path));
const css = files.find(path => /^assets\/src-main-[\w-]+\.css$/.test(path));
const number = (field, id, value) => `<div class="ant-form-item ${field}"><div class="ant-input-number-input-wrap"><input id="${id}" value="${value}"></div></div>`;
const fixture = `<!doctype html><html lang="es"><meta charset="utf-8"><title>ChuchoTriz gratuito · SIMULACIÓN</title>
<link rel="stylesheet" href="/${css}"><body style="background:#202122;color:white;font:16px sans-serif">
<h1>Mini Order Form · DATOS SIMULADOS</h1><p>Esta página no se conecta a ningún broker.</p>
<div id="MiniOrderForm" class="ExpandedForm"><form><input id="rc_select_2" value="AL30 (CI)" aria-label="Instrumento">
${number('MiniOrderFormQuantity-price-input', 'precio', '70000')}
${number('MiniOrderFormQuantity-amount-input', 'cantidad', '')}
${number('amount-show__div', 'mostrar', '')}</form>
<div class="MiniOrderForm_buttonsBlock"><button class="ButtonLimpiar" onclick="document.querySelector('#cantidad').value='';document.querySelector('#mostrar').value=''">Limpiar</button></div></div>
<script type="module" src="/${main}"></script></body></html>`;

const mime = { js: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json', png: 'image/png', ico: 'image/x-icon' };
createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (path === 'fixture') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(fixture); return; }
  if (!files.includes(path)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', (mime[path.split('.').pop()] ?? 'text/plain') + '; charset=utf-8');
  response.end(readFileSync(new URL(path, dist)));
}).listen(0, '127.0.0.1', function () {
  console.log(`Local free-edition preview: http://127.0.0.1:${this.address().port}`);
  console.log('UI harness must supply a simulated chrome.storage API before loading these pages.');
});
