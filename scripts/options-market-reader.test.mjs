import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../public/options-market-reader.js', import.meta.url), 'utf8');

function fixture() {
  const listeners = [], replies = [], subscriptions = [], calls = [];
  const underlying = { id: 'GGAL', symbolStr: 'GGAL', currency: 'ARS', cfiCode: 'ESXXXX', md: { lst: 100, seq: 10 } };
  const contracts = ['OCASPS', 'OPASPS'].map((cfiCode, i) => ({ id: `option-${i}`, symbolStr: `OPT${i}`, currency: 'ARS', marketId: 'bm',
    cfiCode, underlying: 'GGAL', settlementType: '2', refData: { strikePrice: 100, maturityDateStr: '20261120', totalAmountFactor: 1, contractMultiplier: 1, roundLot: 100 },
    book: { bidBook1: 5, bszBook1: 10, askBook1: 6, aszBook1: 20 },
    md: { lst: 5.5, von: 1000, seq: 10, lstdStr: '2026-11-03T17:00:00Z' }, impliedVolatility: 40 + i, greeks: { ggd: i ? -.5 : .5 }, change: 0,
  }));
  const securities = new Map([underlying, ...contracts].map(s => [s.id, s]));
  const store = { securityStore: { options: contracts, underlyingsForMatrix: [underlying], findSecurityFromId: id => securities.get(id),
    getSecurity: async id => { calls.push(id); return securities.get(id); } },
    dmaWebSocket: { addSubscription: (topic, ids) => subscriptions.push({ topic, ids }) }, profileStore: { activeAccount: 'PRIVATE_ACCOUNT' }, webSocketConnectionStatus: true };
  for (const key of ['orderStore', 'positionStore', 'balanceStore', 'orderEntryStore']) Object.defineProperty(store, key, { get() { throw Error(`Forbidden access: ${key}`); } });
  const window = { mainStore: store, addEventListener: (_event, fn) => listeners.push(fn), postMessage: msg => replies.push(msg) };
  const document = { currentScript: { dataset: { channel: 'test' } }, body: { innerText: 'Versión: 4.24.4' } };
  runInNewContext(source, { window, document, location: { origin: 'https://matriz.cocos.xoms.com.ar' }, console });
  let nextId = 0;
  async function call(method, params = {}, other = {}) {
    const id = ++nextId;
    await listeners[0]({ source: window, data: { channel: 'test', kind: 'request', id, method, params, ...other } });
    return replies.find(reply => reply.id === id);
  }
  return { call, window, document, store, calls, subscriptions, contracts, underlying, replies, listeners, securities };
}
test('projects catalog, native metrics, monetary factor and mirrored book with no private account data', async () => {
  const f = fixture(), catalog = (await f.call('catalog')).result;
  assert.equal(catalog.contracts.length, 2); assert.equal(catalog.contracts[0].factor, 100);
  assert.equal(catalog.contracts[0].strikeCurrency, 'ARS');
  const snapshot = (await f.call('snapshot', { underlyingId: 'GGAL', ids: ['GGAL', 'option-0', 'option-1'] })).result;
  assert.equal(snapshot.instruments['option-0'].bid.price, 5); assert.equal(snapshot.instruments['option-0'].ask.size, 20);
  assert.equal(snapshot.instruments['option-0'].impliedVolatility, 40); assert.equal(snapshot.instruments['option-1'].delta, -.5);
  assert.equal(snapshot.instruments['option-0'].lastTradeAt, Date.parse('2026-11-03T17:00:00Z'));
  assert.equal(JSON.stringify({ catalog, snapshot }).includes('PRIVATE_ACCOUNT'), false);
  assert.deepEqual(f.subscriptions.map(s => s.topic), ['md', 'book']);
});
test('never exposes execution or arbitrary store methods', async () => {
  const f = fixture();
  for (const method of ['orders', 'sendOrder', 'cancelOrder', 'replaceOrder', 'hello', 'constructor', '__proto__', 'getSecurity'])
    assert.match((await f.call(method)).error, /Método no permitido/);
  assert.equal(f.calls.length, 0); assert.equal(f.subscriptions.length, 0);
});
test('reads only catalog-verified ARS cauciones, using last traded TNA and timestamp', async () => {
  const f = fixture(), stamp = '2026-11-03T17:00:00Z';
  function caucion(days, patch = {}) {
    const id = `bm_MERV_PESOS_${days}D`;
    f.securities.set(id, { id, marketId: 'bm', cfiCode: 'RPXXXX', currency: 'ARS', symbolStr: `PESOS - ${days}D`,
      md: { lst: 30, bid: 29, lstdStr: stamp }, ...patch });
  }
  caucion(7); caucion(6, { currency: 'USD' }); caucion(5, { md: { bid: 30, lstdStr: stamp } });
  caucion(4, { md: { lst: 30, lstdStr: '2026-02-30T17:00:00Z' } }); caucion(2);
  const first = (await f.call('caucion', { ids: ['GGAL', 'option-0'] })).result;
  assert.deepEqual(JSON.parse(JSON.stringify(first)), [{ currency: 'ARS', days: 7, tna: 30, tradedAt: Date.parse(stamp) }]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.subscriptions)), [{ topic: 'md', ids: ['md.bm_MERV_PESOS_7D', 'md.bm_MERV_PESOS_5D', 'md.bm_MERV_PESOS_4D'] }]);
  assert.equal((await f.call('caucion')).result.length, 1);
  assert.equal(f.subscriptions.length, 1);
  assert.equal(f.calls.length, 0);
  caucion(7, { md: { lst: 30, lstdStr: '2026-11-03T16:00:00Z' } });
  assert.equal((await f.call('caucion')).result.length, 0);
  f.document.body.innerText = 'Versión: 4.24.1';
  assert.equal((await f.call('caucion')).result.length, 0);
  f.document.body.innerText = 'Versión: 4.24.4';
  f.store.securityStore.findSecurityFromId = () => { throw Error('PRIVATE_NATIVE_MESSAGE'); };
  assert.equal((await f.call('caucion')).error, 'Referencia de caución no disponible.');
  f.store.webSocketConnectionStatus = false;
  assert.equal((await f.call('caucion')).error, 'Referencia de caución no disponible.');
});
test('rejects unknown instruments and does not infer a missing factor or foreign strike currency', async () => {
  const f = fixture(); f.contracts[0].refData.roundLot = undefined; f.contracts[1].refData.strikeCurrency = 'USD';
  const catalog = (await f.call('catalog')).result;
  assert.equal(catalog.contracts[0].factor, undefined); assert.equal(catalog.contracts[1].strikeCurrency, 'USD');
  assert.match((await f.call('snapshot', { underlyingId: 'GGAL', ids: ['other'] })).error, /Selección/);
  assert.equal(f.calls.length, 0);
});
test('deduplicates market subscriptions across polls', async () => {
  const f = fixture();
  await f.call('snapshot', { underlyingId: 'GGAL', ids: ['option-0'] });
  await f.call('snapshot', { underlyingId: 'GGAL', ids: ['option-0'] });
  assert.equal(f.subscriptions.length, 2); assert.equal(f.calls.length, 2);
});
test('looks up a small snapshot in a large catalog with linear work', async () => {
  const f = fixture(), size = 1000;
  let idReads = 0;
  for (let index = 0; index < size; index++) {
    f.contracts.push({ ...f.contracts[0], get id() { idReads++; return `demo-${index}`; } });
  }
  const response = await f.call('snapshot', { underlyingId: 'GGAL', ids: ['option-0', 'option-1'] });
  assert.ok(response.result);
  assert.deepEqual(f.calls, ['option-0', 'option-1']);
  assert.ok(idReads < size * 8, `Instrument IDs read ${idReads} times for ${size} catalog entries`);
});
test('stops native reads if the displayed Matriz version changes mid-snapshot', async () => {
  const f = fixture();
  const original = f.store.securityStore.getSecurity;
  f.store.securityStore.getSecurity = async id => {
    f.document.body.innerText = id === 'option-0' ? 'Versión: 99.0' : 'Versión: 4.24.4';
    return original(id);
  };
  const params = { underlyingId: 'GGAL', ids: ['option-0', 'option-1'] };
  assert.match((await f.call('snapshot', params)).error, /Versión/);
  assert.deepEqual(f.calls, ['option-0']);
});
test('serializes native reads even if the client times out or detaches', async () => {
  const f = fixture(); let release;
  const original = f.store.securityStore.getSecurity;
  f.store.securityStore.getSecurity = id => new Promise(resolve => { release = () => resolve(original(id)); });
  const first = f.call('snapshot', { underlyingId: 'GGAL', ids: ['option-0'] });
  assert.match((await f.call('snapshot', { underlyingId: 'GGAL', ids: ['option-1'] })).error, /pendiente/);
  await f.listeners[0]({ source: f.window, data: { channel: 'test', kind: 'retire', id: 1 } });
  assert.match((await f.call('snapshot', { underlyingId: 'GGAL', ids: ['option-1'] })).error, /pendiente/);
  release(); await first;
  assert.match(f.replies.find(reply => reply.id === 1).error, /retirada/);
});
test('discards a response if account context changes during native getSecurity', async () => {
  const f = fixture(), original = f.store.securityStore.getSecurity;
  f.store.securityStore.getSecurity = async id => { f.store.profileStore.activeAccount = 'OTHER'; return original(id); };
  assert.match((await f.call('snapshot', { underlyingId: 'GGAL', ids: ['option-0'] })).error, /contexto/);
});
test('rejects unverified versions and disconnected market data', async () => {
  const f = fixture(); f.document.body.innerText = 'Versión: 99.0';
  assert.match((await f.call('catalog')).error, /Versión/);
  f.document.body.innerText = 'Versión: 4.24.4'; f.store.webSocketConnectionStatus = false;
  assert.match((await f.call('catalog')).error, /desconectado/);
});
test('never substitutes read time for missing or invalid trade time', async () => {
  const f = fixture(); f.contracts[0].md.lstdStr = '2026-02-30T17:00:00Z';
  const snapshot = (await f.call('snapshot', { underlyingId: 'GGAL', ids: ['option-0'] })).result;
  assert.equal(snapshot.instruments['option-0'].lastTradeAt, undefined);
});
test('ignores messages from other sources and detached channels', async () => {
  const f = fixture();
  await f.listeners[0]({ source: {}, data: { channel: 'test', kind: 'request', id: 10, method: 'catalog' } });
  assert.equal(f.replies.length, 0);
  await f.listeners[0]({ source: f.window, data: { channel: 'test', kind: 'detach' } });
  assert.equal(await f.call('catalog'), undefined);
});
