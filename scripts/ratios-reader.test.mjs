import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../public/ratios-reader.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

test('saves dollar widgets independently, resolves exact species, and preserves other widgets on close', async () => {
  const f = fixture();
  const add = await f.request('dollarAdd', await f.args());
  const initial = add.result.dollarWidgets[0];
  assert.deepEqual([initial.config.kind, initial.config.bond, initial.config.term], ['MEP', 'AL30', '24h']);
  assert.deepEqual([initial.pair.a.id, initial.pair.b.id], ['a', 'b']);
  await f.add();
  const editArgs = { ...await f.args(), widgetId: initial.config.id, revision: 0, kind: 'CCL', bond: 'AL30', term: 'CI' };
  assert.match((await f.request('dollarEdit', { ...editArgs, kind: 'CANJE' })).error, /inválida/);
  assert.equal((await f.request('dollarEdit', editArgs)).result.dollarWidgets[0].pair, undefined, 'no substitution from 24h');
  f.securities.push({ ...f.securities.find(s => s.id === 'c'), id: 'ci-c', symbolStr: 'AL30C (CI)', settlementType: '1' });
  const snapshot = await f.state();
  const saved = snapshot.dollarWidgets[0];
  assert.deepEqual([saved.pair.a.id, saved.pair.b.id], ['ci', 'ci-c']);
  assert.deepEqual((await f.ds.getDashboard()).layout.find(w => w.settings?.chuchotrizIntradayDollar).settings.chuchotrizIntradayDollar, saved.config);
  assert.match((await f.request('dollarEdit', editArgs)).error, /cambió/);
  const closed = (await f.request('ratiosRemove', { ...await f.args(), widgetId: saved.config.id, revision: 1 })).result;
  assert.equal(closed.dollarWidgets.length, 0);
  assert.equal(closed.widgets.length, 1);
  assert.ok(f.controls.every(control => f.d.layout.includes(control)));
});

test('reads the current Argentina session and shares native history while keeping live quotes and errors independent', async () => {
  const f = fixture();
  const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' });
  const start = Date.parse(calendar.format(Date.now()) + 'T00:00:00-03:00');
  const stamp = new Date(start).toISOString();
  const older = new Date(start - 60000).toISOString();
  const seen = [];
  f.ms.seriesStore = { async getIntradayTodaySeries(id) {
    seen.push(id);
    if (id === 'b' && seen.filter(s => s === 'b').length === 1) throw { response: { status: 401 } };
    return { series: [{ date: older, close: 99 }, { date: stamp, close: 120 }, { date: stamp, close: null }] };
  } };
  f.securities[0].md.lstdStr = stamp;
  f.securities[1].md.lstdStr = older;
  const ids = ['a', 'b'];
  const live = (await f.request('ratioIntradayQuotes', { ids })).result;
  assert.deepEqual(live.points, { a: { at: start, value: 120 } });
  assert.deepEqual(live.start, start);
  await f.request('ratioIntradayQuotes', { ids });
  assert.deepEqual(f.calls.filter(Array.isArray), [['md', ['md.a', 'md.b']]]);
  const read = (await f.request('ratioIntradayHistory', { ids })).result;
  assert.equal(read.revision, live.revision);
  assert.deepEqual(read.series.a, { points: [{ at: start, value: 120 }] });
  assert.equal(read.series.b.issue, 'Histórico no disponible (HTTP 401)');
  await f.request('ratioIntradayHistory', { ids: ['a', 'b', 'unknown'] });
  assert.deepEqual(seen, ['a', 'b']);
  const recovered = (await f.request('ratioIntradayHistory', { ids, refresh: true })).result;
  assert.deepEqual(recovered.series.b, { points: [{ at: start, value: 120 }] });
  f.ms.webSocketConnectionStatus = false;
  assert.deepEqual((await f.request('ratioIntradayQuotes', { ids })).result.points, {});
  f.ms.profileStore.activeAccount = 'other';
  const switched = (await f.request('ratioIntradayHistory', { ids })).result;
  assert.notEqual(switched.revision, live.revision);
  assert.deepEqual(seen, ['a', 'b', 'a', 'b', 'a', 'b']);
  for (const invalid of [[], ['a', 'a'], ['a', 'b', 'c', 'd'], ['a', '']]) {
    assert.match((await f.request('ratioIntradayHistory', { ids: invalid })).error, /inválidos/);
  }
});

test('a stalled native series times out and can be retried without changing accounts', async () => {
  const f = fixture();
  let calls = 0;
  f.ms.seriesStore = { getIntradayTodaySeries() {
    calls++;
    return calls === 1 ? new Promise(() => {}) : Promise.resolve({ series: [{ date: new Date().toISOString(), close: 120 }] });
  } };
  const stuck = (await f.request('ratioIntradayHistory', { ids: ['a'] })).result;
  assert.match(stuck.series.a.issue, /no respondió a tiempo/);
  const recovered = (await f.request('ratioIntradayHistory', { ids: ['a'], refresh: true })).result;
  assert.equal(recovered.series.a.points[0].value, 120);
  assert.equal(recovered.revision, stuck.revision);
});

test('reads closed daily bars by exact widget pair, follows nextTime and reuses instrument history', async () => {
  const day = 86400000, to = Date.UTC(2026, 10, 26), from = to - 10 * day;
  const f = fixture(class extends Date { static now() { return to + day + 9 * 3600000; } });
  const requested = [];
  f.ms.seriesStore = { async getDailySeries(id, start, end) {
    requested.push({ id, start, end });
    if (end < to / 1000) return { series: [{ date: new Date(to - 4 * day).toISOString(), close: 100 }] };
    return { nextTime: new Date(to - 4 * day).toISOString(), series: [
      { date: new Date(to + day).toISOString(), close: 987 },
      { date: new Date(to + 3600000 * 12).toISOString(), close: 121 },
      { date: new Date(to - 2 * day).toISOString(), close: 119 },
      { date: new Date(to - 3 * day).toISOString(), close: null },
    ] };
  } };
  await f.add();
  const widget = (await f.state()).widgets[0].config;
  const params = { ...await f.args(), widgetId: widget.id, pairId: widget.pairs[0].id, from, to };
  const answer = await f.request('ratioDailyHistory', params);
  assert.equal(answer.error, undefined);
  assert.deepEqual(Object.keys(answer.result), ['a', 'b']);
  assert.deepEqual(answer.result.a.points, [{ day: to - 4 * day, value: 100 }, { day: to - 2 * day, value: 119 }, { day: to, value: 121 }]);
  assert.equal(requested.length, 4);
  assert.equal(requested[0].start, (from - 90 * day) / 1000);
  assert.equal(requested[0].end, (to + day) / 1000 - 1);
  assert.equal(requested[2].end, (to - 3 * day) / 1000 - 1);
  await f.request('ratioDailyHistory', { ...params, pairId: widget.pairs[1].id });
  assert.deepEqual(requested.slice(4).map(call => call.id), ['c', 'c']);
  for (const invalid of [{ to: to + day }, { from: to - 367 * day }, { from: from + 1 }, { pairId: 'missing' }]) {
    assert.ok((await f.request('ratioDailyHistory', { ...params, ...invalid })).error);
  }
  assert.equal(requested.length, 6);
  await f.request('ratioDailyHistory', { ...params, older: true });
  assert.deepEqual(requested.slice(6), ['a', 'b'].map(id => ({
    id, start: (from - 365 * day) / 1000, end: (from - 90 * day) / 1000 - 1,
  })));
});

test('rejects a daily result across account changes and retries HTTP failures', async () => {
  const day = 86400000, to = Date.UTC(2026, 10, 26), from = to - 7 * day;
  const f = fixture(class extends Date { static now() { return to + 2 * day; } });
  let calls = 0, switched = false;
  f.ms.seriesStore = { async getDailySeries(id) {
    calls++;
    if (id === 'a' && !switched) {
      switched = true;
      f.ms.profileStore.activeAccount = 'other';
    }
    if (id === 'b' && calls === 4) throw { response: { status: 401 } };
    return { series: [{ date: new Date(to).toISOString(), close: 42 }] };
  } };
  await f.add();
  const widget = (await f.state()).widgets[0].config;
  const params = { ...await f.args(), widgetId: widget.id, pairId: widget.pairs[0].id, from, to };
  assert.match((await f.request('ratioDailyHistory', params)).error, /Cambió el dashboard/);
  const after = { ...params, ...await f.args() };
  assert.equal((await f.request('ratioDailyHistory', after)).result.b.issue, 'Histórico diario no disponible (HTTP 401)');
  assert.equal(calls, 4);
  assert.equal((await f.request('ratioDailyHistory', { ...after, refresh: true })).result.b.points[0].value, 42);
  assert.equal(calls, 6);
});

test('book previews use the native today series for the exact instrument and reuse it while updating the latest trade', async () => {
  const f = fixture();
  const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' });
  const start = Date.parse(`${calendar.format(Date.now())}T00:00:00-03:00`);
  const date = at => new Date(at).toISOString();
  const calls = [];
  f.ms.seriesStore = {
    getIntradaySeries() { throw Error('The book must not request previous sessions'); },
    async getIntradayTodaySeries(id) {
      calls.push(id);
      return { series: id === 'ci' ? [
        { date: date(start - 60000), close: 88 }, { date: date(start + 10), close: 49 },
        { date: date(start), close: 48 }, { date: date(start + 10), close: 49.1 },
      ] : [] };
    },
  };
  const ci = f.securities.find(s => s.id === 'ci');
  ci.settlementOrClose = 47.5;
  const timestamp = date(start + 20);
  Object.assign(ci.md, { lstdStr: timestamp, lst: 49.4 });
  const first = (await f.request('bookIntraday', { id: 'ci' })).result;
  assert.deepEqual(first, { points: [{ at: start, value: 48 }, { at: start + 10, value: 49.1 }, { at: start + 20, value: 49.4 }], reference: 47.5 });
  ci.md.lst = 49.5;
  assert.equal((await f.request('bookIntraday', { id: 'ci' })).result.points.at(-1).value, 49.5);
  assert.deepEqual((await f.request('bookIntraday', { id: 'a' })).result.points, []);
  assert.match((await f.request('bookIntraday', { id: 'absent' })).error, /instrumento/);
  assert.deepEqual(calls, ['ci', 'a']);
  assert.deepEqual(f.calls.filter(Array.isArray), []);
});

test('updates a provisional book bar at the same timestamp and preserves a completed bar', async () => {
  const minute = Date.parse('2026-11-26T16:10:00Z');
  const f = fixture(class extends Date { static now() { return minute + 20000; } });
  const previous = new Date(minute - 60000).toISOString(), current = new Date(minute).toISOString();
  f.ms.seriesStore = { async getIntradayTodaySeries(id) {
    return { series: [{ date: previous, close: 48 }, ...(id === 'ci' ? [{ date: current, close: 49 }] : [])] };
  } };
  const ci = f.securities.find(s => s.id === 'ci'), other = f.securities.find(s => s.id === 'a');
  Object.assign(ci.md, { lstdStr: current, lst: 49 });
  assert.equal((await f.request('bookIntraday', { id: 'ci' })).result.points.at(-1).value, 49);
  ci.md.lst = 50;
  assert.deepEqual((await f.request('bookIntraday', { id: 'ci' })).result.points, [{ at: minute - 60000, value: 48 }, { at: minute, value: 50 }]);
  Object.assign(other.md, { lstdStr: previous, lst: 47 });
  assert.deepEqual((await f.request('bookIntraday', { id: 'a' })).result.points, [{ at: minute - 60000, value: 48 }]);
});

test('keeps the history scope when subscribing fails and discards regressing quote sequences', async () => {
  const f = fixture();
  const stamp = new Date().toISOString();
  const instrument = f.securities.find(s => s.id === 'a');
  instrument.md.lstdStr = stamp;
  f.ms.seriesStore = { async getIntradayTodaySeries() {
    return { series: [{ date: stamp, close: 120 }] };
  } };
  const ids = ['a'];
  const subscribe = f.ms.dmaWebSocket.addSubscription;
  f.ms.dmaWebSocket.addSubscription = () => { throw Error('native feed error'); };
  const unavailable = (await f.request('ratioIntradayQuotes', { ids })).result;
  assert.deepEqual(unavailable.available, ids);
  assert.match(unavailable.issue, /Suscripciones de mercado no disponibles/);
  assert.deepEqual(unavailable.points, {});
  const history = (await f.request('ratioIntradayHistory', { ids })).result;
  assert.equal(history.revision, unavailable.revision);
  assert.equal(history.series.a.points[0].value, 120);
  f.ms.dmaWebSocket.addSubscription = subscribe;
  assert.equal((await f.request('ratioIntradayQuotes', { ids })).result.points.a.value, 120);
  Object.assign(instrument.md, { seq: instrument.md.seq - 1, lst: 999 });
  assert.deepEqual((await f.request('ratioIntradayQuotes', { ids })).result.points, {});
  f.ms.webSocketConnectionStatus = false;
  await f.request('ratioIntradayQuotes', { ids });
  f.ms.webSocketConnectionStatus = true;
  assert.equal((await f.request('ratioIntradayQuotes', { ids })).result.points.a.value, 999);
  assert.deepEqual(f.calls.filter(Array.isArray), [['md', ['md.a']], ['md', ['md.a']]]);
});

test('finds older native intraday bars when the today endpoint is empty', async () => {
  const f = fixture();
  const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = Date.parse(calendar.format(Date.now()) + 'T00:00:00-03:00');
  const yesterday = today - 86400000;
  const at = yesterday + 12 * 3600000;
  const rangeCalls = [];
  f.ms.seriesStore = {
    async getIntradayTodaySeries() { return { series: [] }; },
    async getIntradaySeries(...args) { rangeCalls.push(args); return { series: [{ date: new Date(at).toISOString(), close: 160000 }] }; },
  };
  const result = (await f.request('ratioIntradayHistory', { ids: ['a', 'b', 'c'] })).result;
  assert.deepEqual(result.series.c, { points: [{ at, value: 160000 }] });
  assert.deepEqual(rangeCalls.map(([id, from, , resolution]) => [id, from, resolution]), ['a', 'b', 'c'].map(id => [id, today / 1000 - 6 * 86400, '1']));
});

test('stores an independent reference and divisor on an existing dollar widget', async () => {
  const f = fixture();
  const { config } = (await f.request('dollarAdd', await f.args())).result.dollarWidgets[0];
  const selection = { ...await f.args(), widgetId: config.id, ...config };
  assert.match((await f.request('dollarEdit', { ...selection, cDivisor: 100 })).error, /Divisor inválido/);
  assert.match((await f.request('dollarEdit', { ...selection, c: 'unknown' })).error, /catálogo/);
  const reference = (await f.request('dollarEdit', { ...selection, c: 'c', cDivisor: 100 })).result.dollarWidgets[0];
  assert.equal(reference.config.schema, 2);
  assert.equal(reference.pair.c.id, 'c');
  assert.equal(reference.pair.cDivisor, 100);
  const saved = (await f.ds.getDashboard()).layout.find(w => w.settings?.chuchotrizIntradayDollar).settings.chuchotrizIntradayDollar;
  assert.deepEqual(saved, reference.config);
  f.securities.splice(f.securities.findIndex(s => s.id === 'c'), 1);
  const changed = (await f.request('dollarEdit', { ...selection, revision: 1, c: 'c', cDivisor: 100 })).result.dollarWidgets[0];
  assert.equal(changed.config.c.id, 'c', 'a saved reference can survive changes to other settings if it expires');
  const cleared = (await f.request('dollarEdit', { ...selection, revision: 2 })).result.dollarWidgets[0];
  assert.equal(cleared.config.schema, 1);
  assert.equal(cleared.pair.c, undefined);
});

test('allows a custom intraday pair with exact IDs and carries over the saved reference', async () => {
  const f = fixture();
  const { config } = (await f.request('dollarAdd', await f.args())).result.dollarWidgets[0];
  const args = { ...await f.args(), widgetId: config.id, revision: 0 };
  const reference = (await f.request('dollarEdit', { ...args, c: 'c', cDivisor: 100 })).result.dollarWidgets[0];
  assert.equal(reference.config.schema, 2);
  const edit = { ...args, revision: 1, a: 'ci', b: 'a' };
  assert.match((await f.request('dollarEdit', { ...edit, b: 'ci' })).error, /diferentes/);
  assert.match((await f.request('dollarEdit', { ...edit, b: 'portfolio' })).error, /catálogo/);
  const custom = (await f.request('dollarEdit', edit)).result.dollarWidgets[0];
  assert.deepEqual([custom.pair.a.id, custom.pair.b.id, custom.pair.c.id, custom.pair.cDivisor], ['ci', 'a', 'c', 100]);
  assert.equal(custom.config.schema, 3);
  const saved = (await f.ds.getDashboard()).layout.find(w => w.settings?.chuchotrizIntradayDollar).settings.chuchotrizIntradayDollar;
  assert.deepEqual(saved, custom.config);
  assert.match((await f.request('dollarEdit', { ...args, revision: 2, kind: 'MEP', bond: 'AL30', term: '24h' })).error, /Recargá Matriz/);
  const cleared = (await f.request('dollarEdit', { ...args, revision: 2, c: undefined })).result.dollarWidgets[0];
  assert.deepEqual([cleared.pair.a.id, cleared.pair.b.id], ['ci', 'a']);
  assert.equal(cleared.pair.c, undefined);
});

test('column visibility defaults to visible, persists per widget, and survives pair edits by legacy clients', async () => {
  const f = fixture(); await f.add(); await f.add();
  const initial = (await f.state()).widgets[0];
  assert.deepEqual(initial.columns, { revision: 0, visible: { lastA: true, lastB: true, referenceC: true } });
  const base = { ...await f.args(), widgetId: initial.config.id, revision: initial.config.revision, columnsRevision: 0 };
  const visible = { lastA: false, lastB: false, referenceC: false };
  const saved = await f.request('ratiosColumns', { ...base, columns: visible });
  assert.equal(saved.error, undefined);
  assert.deepEqual(saved.result.widgets[0].columns, { revision: 1, visible });
  assert.deepEqual(saved.result.widgets[0].config, initial.config, 'display preferences do not change formulas or their editing revision');
  assert.equal(saved.result.widgets[1].columns.visible.lastA, true, 'the other widget keeps its own preferences');
  const native = (await f.ds.getDashboard()).layout.find(w => w.settings?.chuchotrizRatios?.id === initial.config.id);
  assert.deepEqual(native.settings.chuchotrizRatiosColumns, { revision: 1, visible });
  assert.match((await f.request('ratiosColumns', { ...base, columns: { ...visible, lastA: true } })).error, /Las columnas cambiaron/);
  for (const invalid of [null, [], { lastA: true }, { ...visible, lastB: 'false' }, { ...visible, extra: true }]) {
    assert.match((await f.request('ratiosColumns', { ...base, columnsRevision: 1, columns: invalid })).error, /columnas visibles/);
  }
  const edit = await f.request('ratiosEdit', { ...base, pairs: [{ id: 'edited', a: 'a', b: 'b' }] });
  assert.equal(edit.error, undefined);
  assert.deepEqual(edit.result.widgets[0].columns, { revision: 1, visible });
  const restore = await f.request('ratiosColumns', { ...base, revision: 1, columnsRevision: 1, columns: { ...visible, lastA: true } });
  assert.deepEqual(restore.result.widgets[0].columns.visible, { ...visible, lastA: true });
});
test('does not acknowledge an unconfirmed column save and rejects changes after a dashboard switch', async () => {
  const f = fixture(); await f.add(); const widget = (await f.state()).widgets[0];
  const params = { ...await f.args(), widgetId: widget.config.id, revision: widget.config.revision, columnsRevision: 0, columns: { lastA: false, lastB: true, referenceC: true } };
  f.failSave();
  assert.match((await f.request('ratiosColumns', params)).error, /confirmar el guardado/);
  f.ms.profileStore.activeAccount = 'changed';
  assert.match((await f.request('ratiosColumns', { ...params, columnsRevision: 1 })).error, /dashboard/);
});
test('persists a three-price MEP comparison and subscribes to the official dollar spot', async () => {
  const f = fixture();
  f.securities.push({ id: 'rx_DDF_DLR_SPOT', symbolStr: 'DLR/SPOT', marketId: 'rx', currency: 'ARS', settlementType: null, md: { lst: 1572.5, refp: 1565, seq: 1 } });
  for (const query of ['Dólar oficial', 'Dolar USA', 'DLR/SPOT']) {
    const r = await f.request('ratiosSearch', { ...await f.args(), query });
    assert.equal(r.result[0].id, 'rx_DDF_DLR_SPOT'); assert.equal(r.result[0].monitorOnly, true);
  }
  await f.add(); const cfg = (await f.state()).widgets[0].config;
  const params = { ...await f.args(), widgetId: cfg.id, revision: 0, schema: 2, pairs: [
    { id: 'mep', a: 'a', b: 'b', format: 'number' },
    { id: 'spread', a: 'a', b: 'b', c: 'rx_DDF_DLR_SPOT', format: 'percent' }
  ] };
  const saved = await f.request('ratiosEdit', params); assert.equal(saved.error, undefined);
  const pair = saved.result.widgets[0].config.pairs[1];
  assert.equal(saved.result.widgets[0].config.schema, 2, 'old schema-1 readers cannot accept a composite widget');
  assert.equal(pair.c.id, 'rx_DDF_DLR_SPOT'); assert.equal(saved.result.quotes[pair.c.id].last, 1572.5);
  assert.ok(f.calls.some(call => Array.isArray(call) && call[1].includes('md.rx_DDF_DLR_SPOT')));
  assert.deepEqual((await f.ds.getDashboard()).layout.find(w => w.component === 'ChuchoTrizRatiosWidget').settings.chuchotrizRatios.pairs[1], pair);
  const legacy = await f.request('ratiosEdit', { ...params, schema: undefined, revision: 1, pairs: params.pairs.map(({ c, ...p }) => p) });
  assert.match(legacy.error, /versión actual/);
  assert.equal((await f.state()).widgets[0].config.pairs[1].c.id, pair.c.id);
  const duplicate = await f.request('ratiosEdit', { ...params, revision: 1, pairs: [params.pairs[1], { ...params.pairs[1], id: 'dup' }] });
  assert.match(duplicate.error, /ya está agregado/);
  const invalid = await f.request('ratiosEdit', { ...params, revision: 1, pairs: [{ ...params.pairs[1], c: null }] });
  assert.match(invalid.error, /inválido/);
});
test('round-trips a divisor by row and protects scaled comparisons from legacy edits', async () => {
  const f = fixture(); await f.add();
  const { id: widgetId } = (await f.state()).widgets[0].config;
  const base = { ...await f.args(), widgetId, schema: 3 };
  const raw = { id: 'raw', a: 'a', b: 'b', c: 'c', format: 'percent' };
  const scaled = { ...raw, id: 'scaled', cDivisor: 100 };
  const saved = await f.request('ratiosEdit', { ...base, revision: 0, pairs: [raw, scaled] });
  assert.equal(saved.error, undefined);
  assert.equal(saved.result.widgets[0].config.schema, 3);
  assert.deepEqual((await f.state()).widgets[0].config.pairs.map(p => p.cDivisor), [undefined, 100]);
  const native = (await f.ds.getDashboard()).layout.find(w => w.component === 'ChuchoTrizRatiosWidget');
  assert.equal(native.settings.chuchotrizRatios.pairs[1].cDivisor, 100);
  assert.match((await f.request('ratiosEdit', { ...base, schema: 2, revision: 1, pairs: [raw] })).error, /versión actual/);
  for (const invalid of [{ ...scaled, c: undefined }, { ...scaled, cDivisor: '100' }, { ...scaled, cDivisor: 10 }]) {
    assert.match((await f.request('ratiosEdit', { ...base, revision: 1, pairs: [invalid] })).error, /Divisor inválido/);
  }
  assert.match((await f.request('ratiosEdit', { ...base, revision: 1, pairs: [scaled, { ...scaled, id: 'dup' }] })).error, /ya está agregado/);
  const cleared = await f.request('ratiosEdit', { ...base, revision: 1, pairs: [raw] });
  assert.equal(cleared.result.widgets[0].config.schema, 2);
});
test('persists an exact A3 future reference with null settlement and uses its native quote', async () => {
  const f = fixture();
  const future = { id: 'rx_DDF_DLR_DIC26', symbolStr: 'DLR/DIC26', marketId: 'rx', currency: 'ARS', cfiCode: 'FXXXSX', settlementType: null,
    refData: { contractMultiplier: 1000 }, md: { lst: 1600, refp: 1590, seq: 1 } };
  f.securities.push(future, { ...future, id: 'rx_DDF_DLR_NOV26', symbolStr: 'DLR/NOV26', cfiCode: 'FXXXXX', settlementType: undefined },
    { ...future, id: 'future-product', isProduct: true }, { ...future, id: 'future-portfolio', isPortfolio: true });
  const search = (await f.request('ratiosSearch', { ...await f.args(), query: 'DLR/' })).result;
  assert.deepEqual(search.map(s => s.id).sort(), ['rx_DDF_DLR_DIC26', 'rx_DDF_DLR_NOV26']);
  assert.ok(search.every(s => s.settlement === 'Futuro' && s.monitorOnly === true));
  await f.add(); const cfg = (await f.state()).widgets[0].config;
  const saved = await f.request('ratiosEdit', { ...await f.args(), widgetId: cfg.id, revision: 0, schema: 2,
    pairs: [{ id: 'mep-future', a: 'a', b: 'b', c: future.id, format: 'percent' }] });
  assert.equal(saved.error, undefined);
  assert.equal(saved.result.widgets[0].config.pairs[0].c.id, future.id);
  assert.equal(saved.result.quotes[future.id].last, 1600);
  const persisted = (await f.ds.getDashboard()).layout.find(w => w.component === 'ChuchoTrizRatiosWidget').settings.chuchotrizRatios;
  assert.deepEqual(persisted.pairs[0].c, search.find(s => s.id === future.id));
  future.md = { lst: 1610, refp: 1590, seq: 2 };
  assert.equal((await f.state()).quotes[future.id].last, 1610);
  assert.ok(f.calls.some(call => Array.isArray(call) && call[1].includes('md.' + future.id)));
});

function fixture(clock = Date) {
  let receive, id = 0, persisted, failSave = false, saveTimer;
  const calls = [], replies = [];
  const sec = (id, symbol, currency = 'ARS', settlementType = '2') => ({ id, symbolStr: symbol, marketId: 'bm', currency, settlementType, md: { lst: 120, refp: 100, seq: 10, lstdStr: '2026-11-13T15:00:00Z' } });
  const securities = [sec('a', 'AL30'), sec('b', 'AL30D', 'USD'), sec('c', 'AL30C', 'EXT'), sec('ci', 'AL30 CI', 'ARS', '1'), { ...sec('portfolio', 'AL30'), isPortfolio: true }];
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
  runInNewContext(source, { window, document, Date: clock, location: { origin: 'https://remarkets.matriz.com.ar' }, CSS: { escape: x => x }, crypto: { randomUUID: () => 'uuid-' + (++id) }, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 1)), clearTimeout });
  const message = data => receive({ source: window, data });
  async function request(method, params = {}) { const key = 'request-' + (++id); await message({ channel: 'test', kind: 'request', id: key, method, params }); return replies.find(r => r.id === key); }
  const state = async () => (await request('ratiosState')).result;
  const args = async () => { const s = await state(); return { context: s.context, dashboardId: s.dashboardId }; };
  const add = async () => request('ratiosAdd', await args());
  return { ms, ds, d, controls, originalUpdate, securities, document, window, request, state, args, add, calls, failSave: () => { failSave = true; } };
}
const defaultNames = ['AL30/AL30D', 'AL30/AL30C', 'AL30D/AL30C', 'GD30/AL30', 'BMA/GGAL', 'ALUA/TXAR', 'PESOS - 7D/PESOS - 1D', '(AL30/AL30D) / DLR/SPOT', '(AL30/AL30C) / DLR/SPOT'];
const pairName = p => p.c ? `(${p.a.symbol}/${p.b.symbol}) / ${p.c.symbol}` : `${p.a.symbol}/${p.b.symbol}`;
function completeDefaultCatalog(f) {
  f.securities.push({ id: 'rx_DDF_DLR_SPOT', symbolStr: 'DLR/SPOT', marketId: 'rx', currency: 'ARS', settlementType: null, md: { lst: 1572.5, refp: 1565, seq: 1 } });
  f.securities.find(s => s.id === 'c').currency = 'USD';
  for (const symbol of ['GD30', 'BMA', 'GGAL', 'ALUA', 'TXAR', 'PESOS - 7D', 'PESOS - 1D']) {
    f.securities.push({ ...f.securities[0], id: symbol, symbolStr: symbol, settlementType: symbol.startsWith('PESOS') ? null : '2' });
  }
}
test('new widgets save all nine defaults in order with native IDs, currencies and independent pair identities', async () => {
  const f = fixture(); completeDefaultCatalog(f);
  f.securities.push({ ...f.securities.find(s => s.id === 'BMA'), id: 'rx-bma', marketId: 'rx' });
  await f.add(); const first = (await f.state()).widgets[0].config;
  assert.deepEqual(first.pairs.map(pairName), defaultNames);
  assert.deepEqual(first.pairs.map(p => p.format), ['number', 'number', 'percent', 'percent', 'percent', 'percent', 'percent', 'percent', 'percent']);
  assert.equal(first.pairs[4].a.id, 'BMA');
  assert.equal(first.pairs[6].a.settlement, '');
  assert.equal(new Set(first.pairs.map(p => p.id)).size, 9);
  const saved = (await f.ds.getDashboard()).layout.find(w => w.component === 'ChuchoTrizRatiosWidget');
  assert.deepEqual(saved.settings.chuchotrizRatios, first);
  await f.add(); const state = await f.state();
  assert.deepEqual(state.widgets[0].config, first);
  assert.equal(new Set(state.widgets.flatMap(w => w.config.pairs.map(p => p.id))).size, 18);
  const args = { ...await f.args(), widgetId: first.id, schema: 2 };
  await f.request('ratiosEdit', { ...args, revision: 0, pairs: first.pairs.slice(1).map(p => ({ ...p, a: p.a.id, b: p.b.id, ...(p.c ? { c: p.c.id } : {}) })) });
  assert.equal((await f.state()).widgets[0].config.pairs.length, 8);
  await f.request('ratiosEdit', { ...args, revision: 1, pairs: [] });
  assert.equal((await f.state()).widgets[0].config.pairs.length, 0, 'saved empty widgets are never repopulated');
  assert.equal((await f.state()).widgets[1].config.pairs.length, 9);
});
test('missing native spot omits only both dollar spreads and never substitutes a matching symbol', async () => {
  const f = fixture(); completeDefaultCatalog(f);
  f.securities.find(s => s.id === 'rx_DDF_DLR_SPOT').id = 'unverified-spot';
  await f.add(); const widget = (await f.state()).widgets[0];
  assert.deepEqual(widget.config.pairs.map(pairName), defaultNames.slice(0, 7));
  assert.equal(widget.config.schema, 1);
  assert.match(widget.issue, /\(AL30\/AL30D\) \/ DLR\/SPOT/);
  assert.match(widget.issue, /\(AL30\/AL30C\) \/ DLR\/SPOT/);
});
test('missing or ambiguous defaults are reported without substituting other instruments', async () => {
  const f = fixture(); completeDefaultCatalog(f);
  f.securities.splice(f.securities.findIndex(s => s.id === 'GGAL'), 1);
  f.securities.push({ ...f.securities[0], id: 'another-al30' }, { id: 'invalid', symbolStr: 123, marketId: 'bm' });
  await f.add(); const widget = (await f.state()).widgets[0];
  assert.deepEqual(widget.config.pairs.map(pairName), [defaultNames[2], ...defaultNames.slice(5, 7)]);
  assert.match(widget.issue, /AL30\/AL30D/); assert.match(widget.issue, /BMA\/GGAL/);
  await f.request('ratiosEdit', { ...await f.args(), widgetId: widget.config.id, revision: 0, pairs: [] });
  assert.equal((await f.state()).widgets[0].issue, undefined);
});

test('multiple full panels and replaced pairs do not exhaust a cumulative subscription budget', async () => {
  const f = fixture();
  for (let i = 0; i < 400; i++) f.securities.push({ ...f.securities[0], id: 'bulk-' + i, symbolStr: 'BULK' + i });
  await f.add(); await f.add(); await f.add();
  const cfgs = (await f.state()).widgets.map(w => w.config);
  const pairs = start => Array.from({ length: 50 }, (_, n) => ({ id: 'pair-' + (start + n), a: 'bulk-' + (start + n * 2), b: 'bulk-' + (start + n * 2 + 1) }));
  for (const [index, cfg] of cfgs.entries()) {
    const saved = await f.request('ratiosEdit', { ...await f.args(), widgetId: cfg.id, revision: 0, pairs: pairs(index * 100) });
    assert.equal(saved.error, undefined);
  }
  assert.equal(Object.keys((await f.state()).quotes).length, 300);
  const callsBefore = f.calls.filter(Array.isArray).length;
  await f.state();
  assert.equal(f.calls.filter(Array.isArray).length, callsBefore, 'unchanged instruments are not resubscribed');
  for (const [revision, start] of [[1, 300], [2, 0]]) {
    const saved = await f.request('ratiosEdit', { ...await f.args(), widgetId: cfgs[0].id, revision, pairs: pairs(start) });
    assert.equal(saved.error, undefined);
    assert.equal(Object.keys(saved.result.quotes).length, 300);
  }
  assert.ok(f.calls.filter(Array.isArray).every(([topic, ids]) => topic === 'md' && ids.length <= 100));
  f.ms.webSocketConnectionStatus = false;
  assert.equal(Object.keys((await f.state()).quotes).length, 0);
  const beforeReconnect = f.calls.filter(Array.isArray).length;
  f.ms.webSocketConnectionStatus = true;
  assert.equal(Object.keys((await f.state()).quotes).length, 300);
  assert.deepEqual(f.calls.filter(Array.isArray).slice(beforeReconnect).map(([, ids]) => ids.length), [100, 100, 100]);
});

test('projects quotes and subscribes only for visible widgets without losing hidden configurations', async () => {
  const f = fixture();
  await f.add(); await f.add();
  const [{ config: first }, { config: second }] = (await f.state()).widgets;
  const args = await f.args();
  const firstEdit = await f.request('ratiosEdit', { ...args, widgetId: first.id, revision: 0, pairs: [{ id: 'first-row', a: 'a', b: 'b' }] });
  const secondEdit = await f.request('ratiosEdit', { ...args, widgetId: second.id, revision: 0, pairs: [{ id: 'second-row', a: 'c', b: 'ci' }] });
  assert.equal(firstEdit.error, undefined);
  assert.equal(secondEdit.error, undefined);
  const dollar = (await f.request('dollarAdd', args)).result.dollarWidgets[0].config;
  f.ms.dmaWebSocket = { addSubscription: (...args) => f.calls.push(args) };
  f.calls.length = 0;
  let catalogueReads = 0;
  const security = f.securities[0], originalSymbol = security.symbolStr;
  Object.defineProperty(security, 'symbolStr', { get() { catalogueReads++; return originalSymbol; } });

  const reply = visibleWidgetIds => f.request('ratiosState', { visibleWidgetIds });
  const hidden = (await reply([])).result;
  assert.equal(hidden.widgets.length, 2);
  assert.deepEqual(hidden.quotes, {});
  assert.deepEqual(f.calls, []);
  assert.equal(catalogueReads, 0, 'the hidden legacy dollar widget does not scan the catalogue');
  const onlyDollar = (await reply([dollar.id])).result;
  assert.equal(onlyDollar.dollarWidgets[0].pair.a.id, 'a');
  assert.deepEqual(onlyDollar.quotes, {}, 'a visible dollar widget does not fetch hidden ratio quotes');
  assert.deepEqual(Object.keys((await reply([second.id])).result.quotes), ['c', 'ci']);
  assert.deepEqual(clone(f.calls), [['md', ['md.c', 'md.ci']]]);
  assert.deepEqual(Object.keys((await reply([first.id])).result.quotes), ['a', 'b']);
  assert.deepEqual(Object.keys((await reply([second.id])).result.quotes), ['c', 'ci']);
  assert.equal(f.calls.length, 2, 'revealing a previously subscribed widget does not resubscribe');
});

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
test('resizes a dollar widget without changing its instruments or other widget sizes', async () => {
  const f = fixture(); await f.add();
  const { config } = (await f.request('dollarAdd', await f.args())).result.dollarWidgets[0];
  const edit = await f.request('dollarEdit', { ...await f.args(), widgetId: config.id, revision: 0, a: 'a', b: 'b', c: 'c', cDivisor: 100 });
  const before = edit.result.dollarWidgets[0];
  const otherSizes = () => Array.from(f.d.layout.slice(0, -1), w => [w.w, w.h]);
  const beforeSizes = otherSizes();
  const args = { ...await f.args(), widgetId: config.id, revision: before.config.revision, width: 250, height: 260.4 };
  assert.match((await f.request('ratiosResize', { ...args, revision: 0 })).error, /cambió/);
  const resize = await f.request('ratiosResize', args);
  assert.deepEqual(resize.result.dollarWidgets[0], { ...before, width: 360, height: 260 });
  const saved = (await f.ds.getDashboard()).layout.find(w => w.settings?.chuchotrizIntradayDollar?.id === config.id);
  assert.deepEqual(saved.settings.chuchotrizRatiosSize, { width: 360, height: 260 });
  assert.deepEqual(saved.settings.chuchotrizIntradayDollar, before.config);
  assert.deepEqual(otherSizes(), beforeSizes);
});
test('prevents a dollar resize from growing an overlap or crossing the grid edge', async () => {
  const f = fixture();
  const { config, width, height } = (await f.request('dollarAdd', await f.args())).result.dollarWidgets[0];
  const widget = f.d.layout.find(w => w.settings?.chuchotrizIntradayDollar?.id === config.id);
  const args = { ...await f.args(), widgetId: config.id, revision: config.revision };
  widget.x = 0;
  widget.y = 4;
  f.controls[1].y = 4;
  assert.match((await f.request('ratiosResize', { ...args, width: 620, height })).error, /No hay espacio/);
  widget.x = 210;
  assert.match((await f.request('ratiosResize', { ...args, width: 560, height })).error, /No hay espacio/);
  assert.deepEqual([widget.w, widget.h], [width, height]);
  widget.x = 0;
  f.controls[1].x = 94;
  assert.match((await f.request('ratiosResize', { ...args, width: 620, height })).error, /No hay espacio/);
  assert.equal((await f.request('ratiosResize', { ...args, width: 460, height })).result.dollarWidgets[0].width, 460);
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
test('accepts future or absent version labels while rejecting missing dashboard functions and unlisted methods', async () => {
  const f = fixture(); assert.match((await f.request('arbitraryMethod')).error, /no permitido/);
  for (const footer of ['Versión: 4.24.5', 'Versión: 999.0-beta', '']) {
    f.document.body.innerText = footer;
    assert.ok((await f.request('ratiosState')).result, footer || 'no footer');
  }
  f.ds.getDashboard = undefined;
  assert.match((await f.request('ratiosState')).error, /Esperando el catálogo/);
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
test('persists per-pair formats, defaults legacy pairs to number and preserves format on old-client edits', async () => {
  const f = fixture(); await f.add(); const cfg = (await f.state()).widgets[0].config;
  const params = { ...await f.args(), widgetId: cfg.id };
  const first = await f.request('ratiosEdit', { ...params, revision: 0, pairs: [{ id: 'legacy', a: 'a', b: 'b' }, { id: 'pct', a: 'b', b: 'c', format: 'percent' }] });
  assert.equal(first.result.widgets[0].config.pairs[0].format, 'number');
  assert.equal(first.result.widgets[0].config.pairs[1].format, 'percent');
  const saved = await f.ds.getDashboard();
  assert.equal(saved.layout.find(w => w.component === 'ChuchoTrizRatiosWidget').settings.chuchotrizRatios.pairs[1].format, 'percent');
  const updated = await f.request('ratiosEdit', { ...params, revision: 1, pairs: [{ id: 'legacy', a: 'a', b: 'b' }, { id: 'pct', a: 'c', b: 'b' }] });
  assert.equal(updated.result.widgets[0].config.pairs[1].format, 'percent');
  assert.match((await f.request('ratiosEdit', { ...params, revision: 2, pairs: [{ id: 'bad', a: 'a', b: 'b', format: 'arbitrary' }] })).error, /Formato|formato/);
});
test('search treats CI parentheses and a plain CI suffix as equivalent', async () => {
  const f = fixture(); f.securities.find(s => s.id === 'ci').symbolStr = 'AL30 (CI)';
  const result = await f.request('ratiosSearch', { ...await f.args(), query: 'al30 ci' });
  assert.equal(result.result.length, 1); assert.equal(result.result[0].id, 'ci');
});
