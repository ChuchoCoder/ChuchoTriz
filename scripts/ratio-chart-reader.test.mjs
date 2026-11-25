import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/ratio-chart-reader.js', import.meta.url), 'utf8');
function fixture({ c, ready = true, version = '4.23.16', create, comparisons = ['Overlay'], hiddenComparisons = false, widgetReady = true } = {}) {
  const calls = [], replies = [], listeners = new Set(), studies = new Map(), shapes = new Set(['inherited-drawing']);
  let id = 0, resolution = 'D', chartType = 2, present = ready;
  const params = { a: 'a', b: 'b', ...(c ? { c } : {}) };
  const url = new URL('https://remarkets.matriz.com.ar/security/a?ctRatio=b' + (c ? '&ctRatioC=' + c : ''));
  const securities = ['a', 'b', 'c'].map(id => ({ id, symbol: id.toUpperCase(), symbolStr: id.toUpperCase() }));
  const scale = () => { let mode = 2; return { setMode(value) { mode = value; }, getMode: () => mode, setAutoScale() {} }; };
  const mainScale = scale();
  function add(name, inputs, options) {
    const key = 'study-' + (++id), priceScale = scale();
    const pane = ['Overlay', 'Compare'].includes(name) ? 0 : 1;
    studies.set(key, { name, inputs, scale: priceScale, scalePosition: options?.priceScale, visible: false, pane }); return key;
  }
  const chart = {
    symbol: () => 'A', resolution: () => resolution, chartType: () => chartType,
    async setResolution(value) { resolution = value; }, setChartType(value) { chartType = value; },
    getSeries: () => ({ priceScale: () => mainScale, changePriceScale(value) { calls.push({ mainScale: value }); } }),
    getAllStudies: () => [...studies].map(([id, s]) => ({ id, name: s.name })),
    getStudyById(id) { const s = studies.get(id); return {
      getInputValues: () => Object.entries(s.inputs).map(([id, value]) => ({ id, value })),
      priceScale: () => s.scale, changePriceScale(value) { s.scalePosition = value; },
      setVisible(value) { s.visible = value; }, applyOverrides(value) { s.overrides = value; },
      paneIndex: () => s.pane,
      unmergeDown() {
        const nextPane = s.pane + 1;
        for (const other of studies.values()) if (other.pane >= nextPane) other.pane++;
        s.pane = nextPane;
        s.scalePosition = undefined;
      },
    }; },
    async createStudy(name, forceOverlay, lock, inputs, overrides, options) {
      calls.push({ name, forceOverlay, inputs, options });
      if (name !== 'Ratio' && !comparisons.includes(name)) throw Error('Comparison indicator unavailable: ' + name);
      if (create) await create(name);
      const id = add(name, inputs, options); studies.get(id).overrides = overrides; return id;
    },
    removeEntity(id) { studies.delete(id); },
    removeAllStudies() { studies.clear(); }, removeAllShapes() { shapes.clear(); },
  };
  const widget = { _ready: widgetReady, activeChart: () => chart, getStudiesList: () => ['Ratio', ...(hiddenComparisons ? [] : comparisons)],
    getStudyInputs(name) { if (comparisons.includes(name)) return [{ id: 'symbol' }]; throw Error('Unknown indicator'); } };
  const element = { __reactFiberTest: { stateNode: { props: { security: { id: 'a' } }, widget } } };
  const ms = { securityStore: { securities } };
  for (const key of ['orderStore', 'positionStore', 'balanceStore']) Object.defineProperty(ms, key, { get() { throw Error('Forbidden: ' + key); } });
  const window = { mainStore: ms, postMessage: msg => replies.push(msg), addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  const document = { currentScript: { dataset: { channel: 'test' } }, body: { innerText: 'Versión: ' + version }, getElementById: () => present ? element : null };
  const location = { get href() { return url.href; }, origin: url.origin };
  runInNewContext(source, { window, document, location, URL, Error, setTimeout, clearTimeout });
  const message = data => Promise.all([...listeners].map(fn => fn({ source: window, origin: location.origin, data: { channel: 'test', ...data } })));
  const request = async () => { const id = 'request-' + (++idCounter); await message({ kind: 'request', method: 'ratioChart', id, params }); return replies.find(r => r.id === id); };
  let idCounter = 0;
  return { request, message, calls, studies, shapes, add, params, replies, securities, url, listeners, mainScale, chart, widget, showChart() { present = true; } };
}

test('opens A/B with B compared on a new left numeric scale and 5-minute candles', async () => {
  const f = fixture(); const response = await f.request();
  assert.deepEqual(JSON.parse(JSON.stringify(response.result)), { a: 'A', b: 'B', comparison: 'B' });
  assert.equal(f.chart.resolution(), '5'); assert.equal(f.chart.chartType(), 1); assert.equal(f.mainScale.getMode(), 0);
  assert.equal(f.calls[0].mainScale, 'new-right');
  assert.equal(f.calls[1].name, 'Ratio'); assert.equal(f.calls[1].inputs.symbol2, 'B');
  const overlay = f.calls[2]; assert.equal(overlay.name, 'Overlay'); assert.equal(overlay.inputs.symbol, 'B');
  assert.equal(overlay.forceOverlay, true); assert.equal(overlay.options.priceScale, 'new-left');
  assert.deepEqual([...f.studies.values()].map(s => s.pane), [1, 0]);
  assert([...f.studies.values()].every(s => s.scale.getMode() === 0));
  assert([...f.studies.values()].every(s => s.visible));
});

test('opens with only the requested studies instead of inherited default instruments and ratios', async () => {
  const f = fixture();
  f.add('Ratio', { source: 'close', symbol2: 'OTHER' }); f.add('Overlay', { symbol: 'OTHER' }); f.add('Moving Average', { length: 20 });
  const result = await f.request(); assert.equal(result.error, undefined);
  assert.equal(f.studies.size, 2, 'Only the requested Ratio and comparison should remain');
  assert.equal(f.shapes.size, 0, 'Inherited drawings should not remain on the new chart');
  assert([...f.studies.values()].every(s => s.inputs.symbol2 === 'B' || s.inputs.symbol === 'B'));
});

test('loads the requested ratio with an explicitly white line', async () => {
  const f = fixture(); await f.request();
  const style = [...f.studies.values()].find(s => s.name === 'Ratio').overrides;
  assert.equal(style?.['plot.color'], '#FFFFFF'); assert.equal(style['plot.plottype'], 0); assert.equal(style['plot.transparency'], 0);
});

test('cleans the default layout restored during interval initialization without touching another chart', async () => {
  const f = fixture(), other = fixture(); const saved = other.add('Ratio', { symbol2: 'OTHER' });
  f.chart.setResolution = async () => { f.add('Ratio', { source: 'close', symbol2: 'DEFAULT' }); f.chart.resolution = () => '5'; };
  assert.equal((await f.request()).error, undefined);
  assert.equal(f.studies.size, 2); assert(other.studies.has(saved)); assert.equal(other.shapes.size, 1);
});

test('does not add requested studies when native layout cleanup is unavailable or fails', async () => {
  for (const broken of ['missing', 'failed']) {
    const f = fixture(); f.add('Ratio', { source: 'close', symbol2: 'OTHER' });
    if (broken === 'missing') f.chart.removeAllShapes = undefined;
    else f.chart.removeAllStudies = () => {};
    assert.match((await f.request()).error, /diseño en blanco|limpiar los indicadores/);
    assert.equal(f.calls.filter(c => c.name).length, 0); assert.equal(f.studies.size, 1);
  }
});

test('opens C on its own numeric pane between the candles and the A/B ratio', async () => {
  for (const name of ['Overlay', 'Compare']) {
    const f = fixture({ c: 'c', comparisons: [name] }); const r = await f.request();
    assert.equal(r.result?.comparison, 'C');
    const [ratio, comparison] = [...f.studies.values()];
    assert.equal(ratio.inputs.symbol2, 'B'); assert.equal(ratio.pane, 2);
    assert.equal(comparison.inputs.symbol, 'C'); assert.equal(comparison.pane, 1);
    assert.equal(comparison.scalePosition, 'new-right'); assert.equal(comparison.scale.getMode(), 0);
  }
});

test('cleans up both studies when Matriz cannot open a separate pane for C', async () => {
  for (const unmergeDown of [undefined, () => {}]) {
    const f = fixture({ c: 'c' }), getStudy = f.chart.getStudyById;
    f.chart.getStudyById = id => {
      const study = getStudy(id);
      if (study.paneIndex() === 0) study.unmergeDown = unmergeDown;
      return study;
    };
    assert.match((await f.request()).error, /panel (propio|de Referencia C)/);
    assert.equal(f.studies.size, 0);
  }
});

test('uses the available comparison indicator when Matriz offers Compare instead of Overlay', async () => {
  const f = fixture({ comparisons: ['Compare'] });
  assert.equal((await f.request()).result?.comparison, 'B');
  const comparison = [...f.studies.values()].find(s => s.name === 'Compare');
  assert.equal(comparison.inputs.symbol, 'B'); assert.equal(comparison.inputs.source, 'close');
  assert.equal(comparison.scalePosition, 'new-left'); assert.equal(comparison.scale.getMode(), 0);
  await f.request(); assert.equal(f.studies.size, 2);
});

test('keeps the captured request when Matriz canonicalizes its URL while setting the interval', async () => {
  const f = fixture({ c: 'c' }), original = f.chart.setResolution;
  f.chart.setResolution = async value => { await original(value); f.url.search = '?interval=5'; };
  assert.equal((await f.request()).result?.comparison, 'C');
});

test('reports missing comparison capability without changing the chart', async () => {
  const f = fixture({ comparisons: [] });
  assert.match((await f.request()).error, /indicadores Ratio y comparación/);
  assert.equal(f.calls.length, 0);
});

test('detects hidden comparison indicators by their native input metadata', async () => {
  const f = fixture({ hiddenComparisons: true });
  assert.equal((await f.request()).result?.comparison, 'B');
});

test('waits for the native widget to finish initializing before touching the chart', async () => {
  const f = fixture({ widgetReady: false }); const pending = f.request();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.calls.length, 0);
  f.widget._ready = true;
  assert.equal((await pending).result?.comparison, 'B');
});

test('clears unrelated studies and rebuilds only the requested pair without duplicates on retry', async () => {
  const f = fixture(); const existing = f.add('Ratio', { source: 'close', symbol2: 'OTHER' });
  await f.request(); await f.request();
  assert.equal(f.studies.size, 2); assert.equal(f.calls.filter(c => c.name).length, 4); assert(!f.studies.has(existing));
  assert.equal([...f.studies.values()].find(s => s.name === 'Overlay').scalePosition, 'new-left');
});

test('removes an inherited overlay placed in another pane before the main comparison', async () => {
  const f = fixture(); const saved = f.add('Overlay', { symbol: 'B' }); f.studies.get(saved).pane = 2;
  await f.request();
  assert.equal([...f.studies.values()].filter(s => s.name === 'Overlay').length, 1);
  assert.equal(f.studies.has(saved), false);
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

test('checks C and route identity before any creation', async () => {
  const missing = fixture({ c: 'missing' }); assert.match((await missing.request()).error, /no está disponible/);
  const badRoute = fixture(); badRoute.url.searchParams.set('ctRatio', 'other'); assert.match((await badRoute.request()).error, /canceló/);
  assert.equal(missing.calls.length + badRoute.calls.length, 0);
});

test('configures the native chart regardless of the release or absent version label', async () => {
  for (const version of ['4.24.5', '99.0-beta', '']) {
    const f = fixture({ version });
    assert.equal((await f.request()).result?.comparison, 'B', version || 'no footer');
    assert.equal(f.chart.resolution(), '5');
  }
});

test('cleans up a study whose creation completes after the caller detached', async () => {
  let finish; const waiting = new Promise(resolve => { finish = resolve; });
  const f = fixture({ create: () => waiting }); const pending = f.request();
  await f.message({ kind: 'detach' }); finish(); await pending;
  assert.equal(f.studies.size, 0); assert.equal(f.replies.length, 0); assert.equal(f.listeners.size, 0);
});

test('leaves the transient chart clean when adding the comparison fails', async () => {
  const f = fixture({ create: name => { if (name === 'Overlay') throw Error('No overlay'); } });
  const saved = f.add('Volume', {}); assert.match((await f.request()).error, /No overlay/);
  assert.equal(f.studies.size, 0); assert(!f.studies.has(saved));
});
