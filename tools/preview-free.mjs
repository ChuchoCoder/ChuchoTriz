// Local, simulated data only. Serves the verified production package for UI review.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkFree, filesIn } from '../scripts/check-free.mjs';

checkFree({ built: true });
const dist = new URL('../dist/', import.meta.url);
const number = (field, id, value) => `<div class="ant-form-item ${field}"><div class="ant-input-number-input-wrap"><input id="${id}" value="${value}"></div></div>`;
function renderFixture() {
  const files = filesIn(fileURLToPath(dist));
  const main = files.find(path => /^assets\/src-main\.tsx-[\w-]+\.js$/.test(path));
  const styles = JSON.parse(readFileSync(new URL('manifest.json', dist), 'utf8')).content_scripts[0].css
    .map(path => `<link rel="stylesheet" href="/${path}">`).join('');
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ChuchoTriz · SIMULACIÓN</title>
${styles}<style>@media(max-width:600px){#ToolPanel{display:none}#MiniOrderForm{right:0!important}}</style><body style="background:#202122;color:white;font:16px sans-serif">
<header class="HeaderDMA" style="position:fixed;left:0;top:0;right:0;height:40px">ChuchoTriz · DATOS SIMULADOS · Sin conexión a broker</header>
<nav class="DirectAccessBar" style="position:fixed;left:0;top:40px;bottom:0;width:40px;background:#303843"><a class="Item" href="#favoritos" style="color:white">F</a></nav>
<aside id="ToolPanel" style="position:fixed;right:0;top:40px;bottom:0;width:180px;background:#303843">Herramientas simuladas</aside>
<main style="margin:50px 190px 150px 50px"><h1>Mini Order Form · DATOS SIMULADOS</h1><p>Esta página no se conecta a ningún broker.</p><p>Versión: 4.24.4</p></main>
<div id="MiniOrderForm" class="ExpandedForm" style="position:fixed;bottom:0;left:40px;right:180px;height:130px"><form><input id="rc_select_2" value="AL30 (CI)" aria-label="Instrumento">
${number('MiniOrderFormQuantity-price-input', 'precio', '70000')}
${number('MiniOrderFormQuantity-amount-input', 'cantidad', '')}
${number('amount-show__div', 'mostrar', '')}</form>
<div class="MiniOrderForm_buttonsBlock"><button class="ButtonLimpiar" onclick="document.querySelector('#cantidad').value='';document.querySelector('#mostrar').value=''">Limpiar</button></div></div>
<script src="/market-fixture.js"></script><script type="module" src="/${main}"></script></body></html>`;
}

// This harness runs only on loopback; it is never included in the extension ZIP.
function installMarketFixture() {
  const listeners = new Set();
  window.chrome = { runtime: { getURL: path => '/' + path }, storage: {
    local: {
      get: async key => { const data = JSON.parse(localStorage.getItem('ct-demo') || '{}'); return typeof key === 'string' ? { [key]: data[key] } : data; },
      set: async value => { const data = JSON.parse(localStorage.getItem('ct-demo') || '{}'); localStorage.setItem('ct-demo', JSON.stringify({ ...data, ...value })); listeners.forEach(listener => listener(Object.fromEntries(Object.entries(value).map(([key, newValue]) => [key, { newValue }])), 'local')); },
    }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
  } };
  const expiry = new Date(); expiry.setDate(expiry.getDate() + 30);
  const maturityDateStr = `${expiry.getFullYear()}${String(expiry.getMonth() + 1).padStart(2, '0')}${String(expiry.getDate()).padStart(2, '0')}`;
  const underlying = { id: 'DEMO-GGAL', symbolStr: 'GGAL', currency: 'ARS', cfiCode: 'ESXXXX', md: { lst: 100, seq: 10, bid: 99.9, bsz: 100, ask: 100.1, asz: 100 } };
  const options = [70, 80, 90, 100, 110, 120, 130].flatMap(strike => ['call', 'put'].map(kind => {
    const price = Math.max(0, kind === 'call' ? 100 - strike : strike - 100) + 2 + Math.max(0, 6 - Math.abs(100 - strike) / 5);
    return { id: `${kind}-${strike}`, symbolStr: `DEMO ${kind.toUpperCase()} ${strike}`, marketId: 'bm', underlying: underlying.id, currency: 'ARS', settlementType: '2', cfiCode: kind === 'call' ? 'OCASPS' : 'OPASPS',
      refData: { strikePrice: strike, maturityDateStr, totalAmountFactor: 1, contractMultiplier: 1, roundLot: 100 },
      impliedVolatility: 35 + Math.abs(100 - strike) / 2, greeks: { ggd: kind === 'call' ? .5 : -.5 }, change: (strike - 100) / 10,
      md: { lst: price, bid: price - .1, bsz: 200, ask: price + .1, asz: 150, seq: 10, von: strike * 10, lstdStr: new Date(Date.now() - (strike === 70 ? 45 : 2) * 60000).toISOString() },
    };
  }));
  window.mainStore = { securityStore: { options, underlyingsForMatrix: [underlying], getSecurity: async id => [underlying, ...options].find(s => s.id === id) },
    dmaWebSocket: { addSubscription() {} }, profileStore: { activeAccount: 'DEMO-NO-BROKER' }, webSocketConnectionStatus: true };
}

const mime = { js: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json', png: 'image/png', ico: 'image/x-icon' };
const previewPort = Number(process.env.CHUCHOTRIZ_PREVIEW_PORT ?? 0);
if (!Number.isInteger(previewPort) || previewPort < 0 || previewPort > 65535) throw Error('Invalid preview port');
createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const path = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (path === 'market-fixture.js') { response.setHeader('Content-Type', 'text/javascript; charset=utf-8'); response.end(`(${installMarketFixture.toString()})();`); return; }
  if (path === 'fixture') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(renderFixture()); return; }
  const files = filesIn(fileURLToPath(dist));
  if (!files.includes(path)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', (mime[path.split('.').pop()] ?? 'text/plain') + '; charset=utf-8');
  response.end(readFileSync(new URL(path, dist)));
}).listen(previewPort, '127.0.0.1', function () {
  console.log(`Local preview: http://127.0.0.1:${this.address().port}`);
  console.log('Open /fixture for a simulated Matriz chain and local preferences. No broker connection.');
});
