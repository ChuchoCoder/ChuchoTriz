import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = readFileSync(new URL('../public/ratio-operations-reader.js', import.meta.url), 'utf8');
test('finds the dollar header spot by aliases with null settlement and subscribes only to its native price', async () => {
  const f = fixture(), c = await f.context();
  f.securities.push({ id: 'rx_DDF_DLR_SPOT', symbolStr: 'DLR/SPOT', marketId: 'rx', currency: 'ARS', settlementType: null, cfiCode: 'MRIXXX', md: { lst: 1572.5, refp: 1565, refdStr: '2026-11-19', seq: 1 } },
    { id: 'rx_DDF_BCRA_A3500', symbolStr: 'Dólar USA', isProduct: true, marketId: 'rx', md: {} });
  for (const query of ['Dólar oficial', 'Dolar USA', 'DLR/SPOT']) {
    const r = await f.request('ratioSearch', { contextId: c.contextId, query });
    assert.equal(r.result.length, 1); assert.equal(r.result[0].id, 'rx_DDF_DLR_SPOT'); assert.equal(r.result[0].monitorOnly, true);
    assert.equal(r.result[0].amountFactor, undefined);
  }
  const q = (await f.quotes(['rx_DDF_DLR_SPOT'])).result.instruments.rx_DDF_DLR_SPOT;
  assert.equal(q.last, 1572.5); assert.equal(q.reference, 1565); assert.equal(q.referenceDate, '2026-11-19');
  assert.deepEqual(f.subscriptions, [['md', ['md.rx_DDF_DLR_SPOT']]]);
  f.securities.at(-2).md.lst = 1573;
  assert.equal((await f.quotes(['rx_DDF_DLR_SPOT'])).result.instruments.rx_DDF_DLR_SPOT.last, 1573);
});
function fixture() {
  let receive, id = 0;
  const replies = [], subscriptions = [];
  const s = (id, cfiCode, currency = 'ARS', factor = 1) => ({ id, symbolStr: id, currency, cfiCode, marketId: 'bm', settlementType: '2',
    refData: { totalAmountFactor: factor, contractMultiplier: 1, roundLot: 1 }, md: { lst: 100, seq: 10, bid: 99, bsz: 500, ask: 101, asz: 400 } });
  const securities = [s('BMA', 'ESXXXX'), s('SPY', 'EMXXXX'), s('AL30', 'DBXXXX', 'ARS', .01), s('AL30D', 'DBXXXX', 'USD', .01), s('LETRA', 'DYXTXR'), s('UNKNOWN', '???'), s('CAUCION', 'RPXXXX')];
  const ms = { profileStore: { activeAccount: 'opaque-test-A' }, webSocketConnectionStatus: true,
    securityStore: { securities, getSecurity: async id => securities.find(s => s.id === id) }, dmaWebSocket: { addSubscription: (...args) => subscriptions.push(args) } };
  for (const name of ['orderStore', 'positionStore', 'balanceStore', 'executionStore']) Object.defineProperty(ms, name, { get() { throw Error('Forbidden capability'); } });
  const window = { mainStore: ms, addEventListener: (_, fn) => { receive = fn; }, postMessage: data => replies.push(structuredClone(data)) };
  const document = { currentScript: { dataset: { channel: 'test' } }, body: { innerText: 'Versión: 4.24.4' } };
  const timers = new Set();
  runInNewContext(source, { window, document, location: { origin: 'https://matriz.cocos.xoms.com.ar' }, crypto: webcrypto, TextEncoder,
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn) });
  const message = data => receive({ source: window, data: { channel: 'test', ...data } });
  const request = async (method, params = {}) => { const key = 'r' + (++id); await message({ id: key, kind: 'request', method, params }); return replies.find(r => r.id === key); };
  const context = async () => (await request('ratioContext', { storageSalt: 'a'.repeat(64) })).result;
  const quotes = async ids => request('ratioQuotes', { contextId: (await context()).contextId, ids });
  return { ms, document, securities, subscriptions, request, context, quotes, message, replies, expire: () => [...timers].forEach(fn => fn()) };
}
test('projects native CFI, verified monetary units and depth without private reports', async () => {
  const f = fixture(), c = await f.context();
  const result = (await f.request('ratioSearch', { contextId: c.contextId, query: 'AL30' })).result;
  assert.equal(result.length, 2); assert.equal(result[0].amountFactor, .01); assert.equal(result[1].currency, 'USD');
  const unknown = (await f.request('ratioSearch', { contextId: c.contextId, query: 'UNKNOWN' })).result[0]; assert.equal(unknown.amountFactor, undefined);
  assert.deepEqual((await f.request('ratioSearch', { contextId: c.contextId, query: 'CAUCION' })).result, []);
  const quotes = (await f.quotes(['BMA', 'AL30'])).result.instruments;
  assert.deepEqual(quotes.BMA.bid, { price: 99, size: 500 }); assert.equal(quotes.AL30.amountFactor, .01);
  assert.deepEqual(f.subscriptions.map(([topic]) => topic), ['md', 'book']);
  await f.quotes(['BMA']); assert.equal(f.subscriptions.length, 2);
  assert.doesNotMatch(JSON.stringify({ c, result, quotes }), /opaque-test/);
});
test('isolates scopes and retires contexts on account, socket or connectivity changes', async () => {
  const f = fixture(), a = await f.context(); f.ms.profileStore.activeAccount = 'opaque-test-B'; const b = await f.context();
  assert.notEqual(a.storageScope, b.storageScope); assert.notEqual(a.contextId, b.contextId);
  assert.match((await f.request('ratioQuotes', { contextId: a.contextId, ids: ['BMA'] })).error, /cuenta/);
  f.ms.webSocketConnectionStatus = false;
  assert.match((await f.quotes(['BMA'])).result.instruments.BMA.issue, /desconectado/); assert.equal(f.subscriptions.length, 0);
  f.ms.webSocketConnectionStatus = true; await f.quotes(['BMA']); assert.equal(f.subscriptions.length, 2);
});
test('rejects unknown methods, oversized requests and unverified Matriz versions', async () => {
  const f = fixture(); assert.match((await f.request('sendOrder')).error, /no permitido/);
  assert.match((await f.quotes(Array.from({ length: 101 }, (_, i) => String(i)))).error, /100/);
  f.document.body.innerText = 'Versión: 99'; assert.match((await f.request('ratioContext', { storageSalt: 'a'.repeat(64) })).error, /Versión/);
});
test('keeps native top separate from incomplete extra book levels and rejects regressing sequence', async () => {
  const f = fixture(); f.securities[0].book = { bidBook1: 98, bszBook1: 0, askBook1: 102, aszBook1: 20 };
  let q = (await f.quotes(['BMA'])).result.instruments.BMA;
  assert.deepEqual(q.bid, { price: 99, size: 500 }); assert.deepEqual(q.ask, { price: 101, size: 400 });
  assert.equal(q.depth[1].bid, undefined); assert.deepEqual(q.depth[1].ask, { price: 102, size: 20 });
  f.securities[0].md.seq = 9; q = (await f.quotes(['BMA'])).result.instruments.BMA; assert.match(q.issue, /secuencia/);
});
test('projects native best md plus Book1..4 as five levels with actual quantities', async () => {
  const f = fixture(), book = {};
  for (let i = 1; i <= 5; i++) Object.assign(book, { ['bidBook' + i]: 99 - i, ['bszBook' + i]: 100 * i, ['askBook' + i]: 101 + i, ['aszBook' + i]: 200 * i });
  f.securities[0].book = book;
  const q = (await f.quotes(['BMA'])).result.instruments.BMA;
  assert.equal(q.depth.length, 5); assert.deepEqual(q.depth[0], { bid: { price: 99, size: 500 }, ask: { price: 101, size: 400 } });
  assert.deepEqual(q.depth[4], { bid: { price: 95, size: 400 }, ask: { price: 105, size: 800 } });
  f.securities[0].md.bsz = 0;
  const incomplete = (await f.quotes(['BMA'])).result.instruments.BMA;
  assert.equal(incomplete.bid, undefined); assert.equal(incomplete.depth[0].bid, undefined); assert.equal(incomplete.depth[1].bid.price, 98);
});
test('projects daily reference prices and dates without substituting last or read time', async () => {
  const f = fixture(); Object.assign(f.securities[0].md, { refp: 98, refdStr: '2026-11-16' });
  let q = (await f.quotes(['BMA'])).result.instruments.BMA;
  assert.equal(q.reference, 98); assert.equal(q.referenceDate, '2026-11-16');
  Object.assign(f.securities[0].md, { refp: 0, refdStr: 'invalid' });
  q = (await f.quotes(['BMA'])).result.instruments.BMA; assert.equal(q.reference, undefined); assert.equal(q.referenceDate, undefined); assert.equal(q.last, 100);
  Object.assign(f.securities[0].md, { refp: 97, refdStr: undefined, refd: '2026-11-15T03:00:00.000Z' });
  q = (await f.quotes(['BMA'])).result.instruments.BMA; assert.equal(q.reference, 97); assert.equal(q.referenceDate, '2026-11-15');
});
test('projects catalog-verified ARS caucion TNA without fabricating monetary factors or settlement', async () => {
  const f = fixture();
  for (const days of [1, 7]) f.securities.push({ id: `bm_MERV_PESOS_${days}D`, symbolStr: `PESOS - ${days}D`, marketId: 'bm', currency: 'ARS', cfiCode: 'RPXXXX', settlementType: null,
    refData: { contractMultiplier: 1, roundLot: 1 }, md: { lst: days === 1 ? 18.8 : 20.5, seq: 10 } });
  f.securities.push({ ...f.securities.at(-1), id: 'bm_MERV_PESOS_8D', symbolStr: 'PESOS - 9D' });
  const c = await f.context(), search = (await f.request('ratioSearch', { contextId: c.contextId, query: 'PESOS' })).result;
  assert.equal(search.length, 2); assert.equal(search[0].settlement, 'TNA'); assert.equal(search[0].amountFactor, undefined); assert.equal(search[0].quantityStep, undefined);
  const quotes = (await f.quotes(search.map(s => s.id))).result.instruments; assert.equal(quotes.bm_MERV_PESOS_7D.last, 20.5); assert.equal(quotes.bm_MERV_PESOS_1D.last, 18.8);
});
test('cancels async quote projections when account changes and serializes reads', async () => {
  const f = fixture(), c = await f.context(); let release;
  f.ms.securityStore.getSecurity = () => new Promise(resolve => { release = resolve; });
  const pending = f.request('ratioQuotes', { contextId: c.contextId, ids: ['BMA'] });
  assert.match((await f.request('ratioQuotes', { contextId: c.contextId, ids: ['AL30'] })).error, /pendiente/);
  f.ms.profileStore.activeAccount = 'changed'; release(f.securities[0]); assert.match((await pending).error, /cuenta/);
});
test('bounds a stalled lookup and recovers after retirement without publishing its late result', async () => {
  const f = fixture(), c = await f.context(); let release;
  f.ms.securityStore.getSecurity = () => new Promise(resolve => { release = resolve; });
  const pending = f.request('ratioQuotes', { contextId: c.contextId, ids: ['BMA'] });
  f.expire(); assert.match((await pending).error, /demoró/);
  f.ms.securityStore.getSecurity = async () => f.securities[0];
  assert.equal((await f.quotes(['BMA'])).result.instruments.BMA.last, 100);
  release({ ...f.securities[0], md: { lst: 999 } });
  assert.equal((await f.quotes(['BMA'])).result.instruments.BMA.last, 100);
});
