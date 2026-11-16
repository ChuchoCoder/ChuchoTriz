import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../public/ratios-reader.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  let receive, id = 0, persisted, failSave = false, saveTimer;
  const calls = [], replies = [];
  const sec = (id, symbol, currency = 'ARS', settlementType = '2') => ({ id, symbolStr: symbol, marketId: 'bm', currency, settlementType, md: { lst: 120, refp: 100, seq: 10, lstdStr: '2026-11-13T15:00:00Z' } });
  const securities = [sec('a', 'AL30'), sec('b', 'AL30D', 'USD'), sec('c', 'AL30C', 'EXT'), sec('ci', 'AL30', 'ARS', '1'), { ...sec('portfolio', 'AL30'), isPortfolio: true }];
  function widget(data, dashboard, index) {
    return { ...clone(data), dashboard, key: data.component + '-' + index,
      settings: clone(data.settings || {}), selectionCriteria: { securities: [], ...(data.selectionCriteria || {}) },
      cols() { return this.w / 5; }, rows() { return this.h / 25; } };
  }
  const d = { id: 'scratch', name: 'Scratch', width: 1600, cols: 320, rowHeight: 25, layout: [], widgetsDicts: new Map(),
    onSave() { calls.push('save'); clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (!failSave) persisted = { layout: this.layout.map(({ component, x, y, w, h, settings, selectionCriteria }) => clone({ component, x, y, w, h, settings, selectionCriteria })) }; }, 0); },
    addWidget(w) { this.layout.push(w); this.widgetsDicts.set(w.key, w); this.onSave(); },
    updateLayout(layout) { for (const n of layout) { const w = this.widgetsDicts.get(n.i); w.x = n.x; w.y = n.y; w.w = n.w * 5 + 1; w.h = n.h * 25; } this.onSave(); }
  };
  const controls = [0, 1].map(i => widget({ component: 'MiniPlanePricePanelWidget', x: i * 100, y: 0, w: 400, h: 85, settings: { control: i } }, d, i));
  controls.forEach(w => { d.layout.push(w); d.widgetsDicts.set(w.key, w); });
  persisted = { layout: controls.map(({ component, x, y, w, h, settings, selectionCriteria }) => clone({ component, x, y, w, h, settings, selectionCriteria })) };
  const originalUpdate = d.updateLayout;
  const ds = { currentDashboard: d, dashboards: [d], widgetsLimit: 10,
    createDashboard(data) { return { layout: data.layout.map((w, i) => widget(w, d, d.layout.length + i)) }; },
    async getDashboard() { calls.push('readSaved'); return clone(persisted); }
  };
  const ms = { dashboardStore: ds, securityStore: { securities, getSecurity: async id => securities.find(s => s.id === id) }, webSocketConnectionStatus: true,
    profileStore: { activeAccount: 'test' }, dmaWebSocket: { addSubscription: (...args) => calls.push(args) } };
  for (const name of ['orderStore', 'positionStore', 'balanceStore']) Object.defineProperty(ms, name, { get() { throw Error('Forbidden capability: ' + name); } });
  const window = { mainStore: ms, addEventListener: (_, fn) => { receive = fn; }, postMessage: msg => replies.push(clone(msg)) };
  const document = { currentScript: { dataset: { channel: 'test' } }, body: { innerText: 'Versión: 4.23.16' }, querySelector: selector => selector === '.CustomDashboard' ? {} : null };
  runInNewContext(source, { window, document, location: { origin: 'https://remarkets.matriz.com.ar' }, CSS: { escape: x => x }, crypto: { randomUUID: () => 'uuid-' + (++id) }, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 1)), clearTimeout });
  const message = data => receive({ source: window, data });
  async function request(method, params = {}) { const key = 'request-' + (++id); await message({ channel: 'test', kind: 'request', id: key, method, params }); return replies.find(r => r.id === key); }
  const state = async () => (await request('ratiosState')).result;
  const args = async () => { const s = await state(); return { context: s.context, dashboardId: s.dashboardId }; };
  const add = async () => request('ratiosAdd', await args());
  return { ms, ds, d, controls, originalUpdate, securities, document, window, request, state, args, add, calls, failSave: () => { failSave = true; } };
}
test('search separates market/currency/settlement, excludes portfolios, exposes no account data', async () => {
  const f = fixture(); const result = await f.request('ratiosSearch', { ...await f.args(), query: 'AL30' });
  assert.equal(result.result.length, 4);
  assert.deepEqual(result.result.find(i => i.id === 'c'), { id: 'c', symbol: 'AL30C', market: 'bm', currency: 'EXT', settlement: '2' });
  assert.equal(result.result.find(i => i.id === 'ci').settlement, '1');
  assert.equal((await f.request('ratiosSearch', { ...await f.args(), query: '' })).result.length, 0);
});
test('adds and removes only the selected empty widget and preserves all native controls', async () => {
  const f = fixture(), before = clone(f.controls.map(({ settings, x, y, w, h }) => ({ settings, x, y, w, h })));
  await f.add(); await f.add();
  assert.equal(f.d.layout.length, 4);
  const s = await f.state(); const cfg = s.widgets[0].config;
  assert.equal(s.widgets[0].width, 560);
  const result = await f.request('ratiosRemove', { ...await f.args(), widgetId: cfg.id, revision: cfg.revision });
  assert.equal(result.result.widgets.length, 1); assert.equal(f.d.layout.length, 3);
  assert.deepEqual(clone(f.controls.map(({ settings, x, y, w, h }) => ({ settings, x, y, w, h }))), before);
  const last = result.result.widgets[0].config;
  await f.request('ratiosRemove', { ...await f.args(), widgetId: last.id, revision: last.revision });
  assert.equal(f.d.updateLayout, f.originalUpdate); assert.equal(f.d.layout.length, 2);
});
test('validates instruments and revisions, rejects duplicates and prevents stale dashboard writes', async () => {
  const f = fixture(); await f.add(); const cfg = (await f.state()).widgets[0].config;
  const base = { ...await f.args(), widgetId: cfg.id, revision: 0 };
  const saved = await f.request('ratiosEdit', { ...base, pairs: [{ id: 'pair', a: 'a', b: 'b' }] });
  assert.equal(saved.result.widgets[0].config.revision, 1);
  assert.equal(saved.result.widgets[0].config.pairs[0].b.currency, 'USD');
  assert.match((await f.request('ratiosEdit', { ...base, pairs: [] })).error, /cambió/);
  assert.match((await f.request('ratiosEdit', { ...base, revision: 1, pairs: [{ id: 'one', a: 'a', b: 'b' }, { id: 'two', a: 'a', b: 'b' }] })).error, /ya está/);
  assert.match((await f.request('ratiosEdit', { ...base, revision: 1, pairs: [{ id: 'one', a: 'a', b: 'missing' }] })).error, /catálogo/);
  f.ms.profileStore.activeAccount = 'changed';
  assert.match((await f.request('ratiosRemove', { ...base, revision: 1 })).error, /dashboard/);
  assert.equal(f.d.layout.length, 3);
});
test('preserves native pixel sizes when Matriz round-trips unchanged dimensions', async () => {
  const f = fixture(); await f.add(); await f.state();
  const before = f.d.layout.map(w => [w.w, w.h]);
  f.d.updateLayout(f.d.layout.map(w => ({ i: w.key, x: w.x, y: w.y, w: w.cols(), h: w.rows() })));
  assert.deepEqual(f.d.layout.map(w => [w.w, w.h]), before);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual((await f.ds.getDashboard()).layout.map(w => [w.w, w.h]), before);
  const cfg = (await f.state()).widgets[0].config;
  const resized = await f.request('ratiosResize', { ...await f.args(), widgetId: cfg.id, revision: cfg.revision, width: 640, height: 260 });
  assert.equal(resized.result.widgets[0].width, 640); assert.equal(resized.result.widgets[0].height, 260);
  assert.deepEqual(f.controls.map(w => [w.w, w.h]), before.slice(0, 2));
  const own = f.d.layout.find(w => w.component === 'ChuchoTrizRatiosWidget');
  own.w++;
  assert.equal((await f.state()).widgets[0].width, 640);
  assert.deepEqual(f.controls.map(w => [w.w, w.h]), before.slice(0, 2));
});
test('does not acknowledge failed persistence or allow overlapping mutations', async () => {
  const f = fixture(); f.failSave();
  const pending = f.add();
  const overlap = await f.add();
  assert.match(overlap.error, /guardándose/);
  assert.match((await pending).error, /confirmar el guardado/);
});
test('reads only published last and daily reference, invalidates disconnected and regressing data', async () => {
  const f = fixture(); await f.add(); const cfg = (await f.state()).widgets[0].config;
  await f.request('ratiosEdit', { ...await f.args(), widgetId: cfg.id, revision: 0, pairs: [{ id: 'pair', a: 'a', b: 'b' }] });
  const s = await f.state(); assert.equal(s.quotes.a.last, 120); assert.equal(s.quotes.a.reference, 100);
  assert.ok(f.calls.some(c => Array.isArray(c) && c[0] === 'md'));
  f.securities[0].md.seq = 9; assert.match((await f.state()).quotes.a.issue, /actuales/);
  f.ms.webSocketConnectionStatus = false; assert.deepEqual((await f.state()).quotes, {});
  f.ms.webSocketConnectionStatus = true; f.securities[0].md.seq = 1;
  assert.equal((await f.state()).quotes.a.last, 120);
});
test('rejects unreviewed versions and all unlisted methods', async () => {
  const f = fixture(); assert.match((await f.request('arbitraryMethod')).error, /no permitido/);
  f.document.body.innerText = 'Versión: 999.0'; assert.match((await f.request('ratiosState')).error, /compatible/);
});
test('expired saved instruments do not prevent editing or deleting other rows', async () => {
  const f = fixture(); await f.add(); const cfg = (await f.state()).widgets[0].config;
  const params = { ...await f.args(), widgetId: cfg.id };
  await f.request('ratiosEdit', { ...params, revision: 0, pairs: [{ id: 'first', a: 'a', b: 'b' }, { id: 'expired', a: 'c', b: 'b' }] });
  f.securities.splice(f.securities.findIndex(s => s.id === 'c'), 1);
  assert.match((await f.state()).quotes.c.issue, /no disponible/);
  const result = await f.request('ratiosEdit', { ...params, revision: 1, pairs: [{ id: 'expired', a: 'c', b: 'b' }] });
  assert.equal(result.result.widgets[0].config.pairs[0].a.currency, 'EXT');
  const removed = await f.request('ratiosEdit', { ...params, revision: 2, pairs: [] });
  assert.equal(removed.result.widgets[0].config.pairs.length, 0);
});
