import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/ratio-chart-reader.js', import.meta.url), 'utf8');
function fixture({ c, ready = true, version = '4.23.16', create } = {}) {
  const calls = [], replies = [], listeners = new Set(), studies = new Map();
  let id = 0, resolution = 'D', chartType = 2, present = ready;
  const params = { a: 'a', b: 'b', ...(c ? { c } : {}) };
  const url = new URL('https://remarkets.matriz.com.ar/security/a?ctRatio=b' + (c ? '&ctRatioC=' + c : ''));
  const securities = ['a', 'b', 'c'].map(id => ({ id, symbol: id.toUpperCase(), symbolStr: id.toUpperCase() }));
  const scale = () => { let mode = 2; return { setMode(value) { mode = value; }, getMode: () => mode, setAutoScale() {} }; };
  const mainScale = scale();
  function add(name, inputs, options) {
    const key = 'study-' + (++id), priceScale = scale();
    studies.set(key, { name, inputs, options, scale: priceScale, visible: false }); return key;
  }
  const chart = {
    symbol: () => 'A', resolution: () => resolution, chartType: () => chartType,
    async setResolution(value) { resolution = value; }, setChartType(value) { chartType = value; },
    getSeries: () => ({ priceScale: () => mainScale, changePriceScale(value) { calls.push({ mainScale: value }); } }),
    getAllStudies: () => [...studies].map(([id, s]) => ({ id, name: s.name })),
    getStudyById(id) { const s = studies.get(id); return {
      getInputValues: () => Object.entries(s.inputs).map(([id, value]) => ({ id, value })),
      priceScale: () => s.scale, changePriceScale(value) { s.options = { priceScale: value }; },
      setVisible(value) { s.visible = value; },
      paneIndex: () => s.pane ?? (s.name === 'Overlay' ? 0 : 1),
    }; },
    async createStudy(name, forceOverlay, lock, inputs, overrides, options) {
      calls.push({ name, forceOverlay, inputs, options });
      if (create) await create(name);
      return add(name, inputs, options);
    },
    removeEntity(id) { studies.delete(id); },
  };
  const element = { __reactFiberTest: { stateNode: { props: { security: { id: 'a' } }, widget: { activeChart: () => chart } } } };
  const ms = { securityStore: { securities } };
  for (const key of ['orderStore', 'positionStore', 'balanceStore']) Object.defineProperty(ms, key, { get() { throw Error('Forbidden: ' + key); } });
  const window = { mainStore: ms, postMessage: msg => replies.push(msg), addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  const document = { currentScript: { dataset: { channel: 'test' } }, body: { innerText: 'Versión: ' + version }, getElementById: () => present ? element : null };
  const location = { get href() { return url.href; }, origin: url.origin };
  runInNewContext(source, { window, document, location, URL, Error, setTimeout, clearTimeout });
  const message = data => Promise.all([...listeners].map(fn => fn({ source: window, origin: location.origin, data: { channel: 'test', ...data } })));
  const request = async () => { const id = 'request-' + (++idCounter); await message({ kind: 'request', method: 'ratioChart', id, params }); return replies.find(r => r.id === id); };
  let idCounter = 0;
  return { request, message, calls, studies, add, params, replies, securities, url, listeners, mainScale, chart, showChart() { present = true; } };
}

test('opens A/B with B compared on a new left numeric scale and 5-minute candles', async () => {
  const f = fixture(); const response = await f.request();
  assert.deepEqual(JSON.parse(JSON.stringify(response.result)), { a: 'A', b: 'B', comparison: 'B' });
  assert.equal(f.chart.resolution(), '5'); assert.equal(f.chart.chartType(), 1); assert.equal(f.mainScale.getMode(), 0);
  assert.equal(f.calls[0].mainScale, 'new-right');
  assert.equal(f.calls[1].name, 'Ratio'); assert.equal(f.calls[1].inputs.symbol2, 'B');
  const overlay = f.calls[2]; assert.equal(overlay.name, 'Overlay'); assert.equal(overlay.inputs.symbol, 'B');
  assert.equal(overlay.forceOverlay, true); assert.equal(overlay.options.priceScale, 'new-left');
  assert([...f.studies.values()].every(s => s.scale.getMode() === 0));
  assert([...f.studies.values()].every(s => s.visible));
});

test('compares C on the left while the native Ratio remains A/B', async () => {
  const f = fixture({ c: 'c' }); const r = await f.request();
  assert.equal(r.result.comparison, 'C');
  assert.equal(f.calls[1].inputs.symbol2, 'B'); assert.equal(f.calls[2].inputs.symbol, 'C');
});

test('keeps unrelated studies and reuses the requested studies without duplicates on retry', async () => {
  const f = fixture(); const existing = f.add('Ratio', { source: 'close', symbol2: 'OTHER' });
  await f.request(); await f.request();
  assert.equal(f.studies.size, 3); assert.equal(f.calls.filter(c => c.name).length, 2); assert(f.studies.has(existing));
  assert.equal(f.studies.get(existing).visible, false);
  assert.equal([...f.studies.values()].find(s => s.name === 'Overlay').options.priceScale, 'new-left');
});

test('does not reuse an overlay placed in another pane as the main comparison', async () => {
  const f = fixture(); const saved = f.add('Overlay', { symbol: 'B' }); f.studies.get(saved).pane = 2;
  await f.request();
  assert.equal([...f.studies.values()].filter(s => s.name === 'Overlay').length, 2);
  assert.equal(f.studies.get(saved).visible, false);
});

test('waits for the native chart and never creates a study after navigation', async () => {
  const f = fixture({ ready: false }); const pending = f.request();
  f.url.pathname = '/security/other'; f.showChart();
  const r = await pending; assert.match(r.error, /canceló/); assert.equal(f.calls.length, 0);
});

test('refuses an ambiguous native ticker rather than selecting another settlement', async () => {
  const f = fixture(); f.securities.push({ id: 'b-ci', symbol: 'B' });
  assert.match((await f.request()).error, /liquidación o mercado/); assert.equal(f.calls.length, 0);
});

test('checks C, route identity and supported native versions before any creation', async () => {
  const missing = fixture({ c: 'missing' }); assert.match((await missing.request()).error, /no está disponible/);
  const badRoute = fixture(); badRoute.url.searchParams.set('ctRatio', 'other'); assert.match((await badRoute.request()).error, /canceló/);
  const version = fixture({ version: 'unknown' }); assert.match((await version.request()).error, /versión/);
  assert.equal(missing.calls.length + badRoute.calls.length + version.calls.length, 0);
});

test('cleans up a study whose creation completes after the caller detached', async () => {
  let finish; const waiting = new Promise(resolve => { finish = resolve; });
  const f = fixture({ create: () => waiting }); const pending = f.request();
  await f.message({ kind: 'detach' }); finish(); await pending;
  assert.equal(f.studies.size, 0); assert.equal(f.replies.length, 0); assert.equal(f.listeners.size, 0);
});

test('removes only newly created studies when adding the comparison fails', async () => {
  const f = fixture({ create: name => { if (name === 'Overlay') throw Error('No overlay'); } });
  const saved = f.add('Volume', {}); assert.match((await f.request()).error, /No overlay/);
  assert.equal(f.studies.size, 1); assert(f.studies.has(saved));
});
