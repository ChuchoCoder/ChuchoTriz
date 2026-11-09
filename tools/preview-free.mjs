// Local, simulated data only. Serves the verified production package for UI review.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkFree, filesIn } from '../scripts/check-free.mjs';

checkFree({ built: true });
const dist = new URL('../dist/', import.meta.url);
const number = (field, id, value) => `<div class="ant-form-item ${field}"><div class="ant-input-number-input-wrap"><input id="${id}" value="${value}"></div></div>`;
function renderFixture(regression) {
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
<script src="/market-fixture.js${regression ? '?scenario=regression' : ''}"></script><script type="module" src="/${main}"></script></body></html>`;
}

// This harness runs only on loopback; it is never included in the extension ZIP.
function installMarketFixture(regression) {
  const listeners = new Set();
  const storageKey = regression ? 'ct-demo-regression' : 'ct-demo-ggal';
  const readStorage = () => JSON.parse(localStorage.getItem(storageKey) || '{}');
  window.chrome = { runtime: { getURL: path => '/' + path }, storage: {
    local: {
      get: async key => { const data = readStorage(); return typeof key === 'string' ? { [key]: data[key] } : data; },
      set: async value => { localStorage.setItem(storageKey, JSON.stringify({ ...readStorage(), ...value })); listeners.forEach(listener => listener(Object.fromEntries(Object.entries(value).map(([key, newValue]) => [key, { newValue }])), 'local')); },
    }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
  } };
  const expiry = new Date(); expiry.setDate(expiry.getDate() + 30);
  const maturityDateStr = `${expiry.getFullYear()}${String(expiry.getMonth() + 1).padStart(2, '0')}${String(expiry.getDate()).padStart(2, '0')}`;
  const spot = regression ? 100 : 5000;
  const step = regression ? 10 : 200;
  const levels = regression ? 3 : 12;
  const strikes = Array.from({ length: 2 * levels + 1 }, (_, index) => spot + (index - levels) * step);
  const spotSpread = regression ? .1 : 1;
  const underlying = { id: 'DEMO-GGAL', symbolStr: 'GGAL', currency: 'ARS', marketId: 'bm', cfiCode: 'ESXXXX', change: 1.25,
    md: { lst: spot, seq: 10, bid: spot - spotSpread, bsz: 100, ask: spot + spotSpread, asz: 100 } };
  const options = strikes.flatMap(strike => ['call', 'put'].map(kind => {
    const distance = Math.abs(strike - spot) / step;
    const intrinsic = Math.max(0, kind === 'call' ? spot - strike : strike - spot);
    const timeValue = regression ? 2 + Math.max(0, 6 - distance * 2) : Math.max(2, 200 * Math.exp(-distance / 2.75));
    const price = Math.round((intrinsic + timeValue) * 100) / 100;
    const spread = regression ? .1 : Math.max(.5, Math.round(price / 100) / 2);
    return { id: `${kind}-${strike}`, fixSymbol: `DEMO FIX ${kind} ${strike}`, symbolStr: `DEMO ${kind.toUpperCase()} ${strike}`, marketId: 'bm', underlying: underlying.id, currency: 'ARS', settlementType: '2', cfiCode: kind === 'call' ? 'OCASPS' : 'OPASPS',
      refData: { strikePrice: strike, maturityDateStr, totalAmountFactor: 1, contractMultiplier: 1, roundLot: 100 },
      impliedVolatility: 35 + distance * (regression ? 5 : 1.5), greeks: { ggd: kind === 'call' ? .5 : -.5 }, change: (strike - spot) / step,
      md: { lst: price, bid: price - spread, bsz: 200, ask: price + spread, asz: 150, seq: 10, von: strike * 10, lstdStr: new Date(Date.now() - (strike === strikes[0] ? 45 : 2) * 60000).toISOString() },
    };
  }));
  const positionReport = { lastCalculation: new Date(), types: [{ type: 'STOCK_OPTION_CALL', securitiesDetailed: [
    { detailedPositions: [{ tradingSymbol: `DEMO FIX call ${spot}`, totalCurrentSize: 2, totalCollateralSize: 0 }] },
    { detailedPositions: [{ tradingSymbol: `DEMO FIX call ${spot + step}`, totalCurrentSize: -1, totalCollateralSize: 0 }] },
  ] }, { type: 'STOCK', securitiesDetailed: [{ symbolReference: underlying.symbolStr, security: underlying, instrumentCurrentSize: 100,
    detailedPositions: [{ security: underlying, totalCurrentSize: 100 }] }] }] };
  const executionPriceScale = regression ? 1 : 20;
  const execution = { account: 'DEMO-NO-BROKER', eventSubtype: 'execution_report', execType: 'F', ordStatus: '2',
    side: '1', securityId: `call-${spot}`, transactTime: new Date().toISOString(), lastQty: 2, lastPx: 10 * executionPriceScale };
  const executions = [
    { ...execution, id: 1 },
    { ...execution, id: 2, lastQty: 6, lastPx: 16 * executionPriceScale },
    { ...execution, id: 3, side: '2', lastQty: 3, lastPx: 12 * executionPriceScale },
    { ...execution, id: 4, securityId: `put-${spot}`, side: '2', lastQty: 1, lastPx: 9 * executionPriceScale },
  ];
  const cauciones = [7, 6, 5, 4, 3].map(days => ({
    id: `bm_MERV_PESOS_${days}D`, marketId: 'bm', cfiCode: 'RPXXXX', currency: 'ARS', symbolStr: `PESOS - ${days}D`,
    md: { lst: regression ? 1e-10 : 30 - (7 - days) / 2, lstdStr: new Date(Date.now() - 2 * 60000).toISOString() },
  }));
  const securities = new Map([underlying, ...options, ...cauciones].map(s => [s.id, s]));
  window.mainStore = { orderEventStore: { getOrderEventsForAccountReport: async () => executions },
    securityStore: { options, underlyingsForMatrix: [underlying], findSecurityFromId: id => securities.get(id), getSecurity: async id => securities.get(id) },
    portfolioStore: { detailedPositionReport: positionReport, getDetailedPositionReport: async () => { positionReport.lastCalculation = new Date(); return positionReport; } },
    dmaWebSocket: { addSubscription() {} }, profileStore: { activeAccount: 'DEMO-NO-BROKER' }, webSocketConnectionStatus: true };
}

const mime = { js: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json', png: 'image/png', ico: 'image/x-icon' };
const previewPort = Number(process.env.CHUCHOTRIZ_PREVIEW_PORT ?? 0);
if (!Number.isInteger(previewPort) || previewPort < 0 || previewPort > 65535) throw Error('Invalid preview port');
createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname.slice(1) || 'index.html';
  const regression = url.searchParams.get('scenario') === 'regression';
  if (path === 'market-fixture.js') { response.setHeader('Content-Type', 'text/javascript; charset=utf-8'); response.end(`(${installMarketFixture.toString()})(${regression});`); return; }
  if (path === 'fixture') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(renderFixture(regression)); return; }
  const files = filesIn(fileURLToPath(dist));
  if (!files.includes(path)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', (mime[path.split('.').pop()] ?? 'text/plain') + '; charset=utf-8');
  response.end(readFileSync(new URL(path, dist)));
}).listen(previewPort, '127.0.0.1', function () {
  console.log(`Local preview: http://127.0.0.1:${this.address().port}`);
  console.log('Open /fixture for a simulated Matriz chain and local preferences. No broker connection.');
});
