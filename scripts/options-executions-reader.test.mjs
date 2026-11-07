import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/options-executions-reader.js', import.meta.url), 'utf8');
const origin = 'https://fixture.test';
const account = 'PRIVATE_ACCOUNT';
const call = { id: 'option-call', fixSymbol: 'GFGC1234', symbolStr: 'GFGC1234', cfiCode: 'OCASPS',
  currency: 'ARS', settlementType: '2', underlying: 'equity', refData: { strikePrice: 1234.5, maturityDateStr: '20261218' } };
const put = { ...call, id: 'option-put', fixSymbol: 'GFGV1234', symbolStr: 'GFGV1234', cfiCode: 'OPASPS' };
const event = { id: 1, orderId: 'PRIVATE_ORDER', account, eventSubtype: 'execution_report', execType: 'F', ordStatus: '1',
  side: '1', securityId: call.id, lastQty: '2', lastPx: '10.25', cumQty: 50,
  transactTime: '2026-11-06T13:00:00.000Z', username: 'PRIVATE_USER' };

function fixture() {
  const replies = [], calls = [];
  let listener, uid = 0, id = 0;
  const rows = [
    event,
    { ...event, id: 2, ordStatus: '2', lastQty: 3, lastPx: 11, cumQty: 53 },
    { ...event, id: 3, securityId: put.id, side: '2', lastQty: 4, lastPx: 8 },
    { ...event, id: 4, ordStatus: '4' },
    { ...event, id: 5, eventSubtype: 'new_order' },
    { ...event, id: 6, account: 'OTHER_ACCOUNT' },
    { ...event, id: 7, securityId: 'equity' },
    { ...event, id: 8, lastQty: 'invalid' },
    { ...event, id: 9, securityId: 'unknown' },
    { ...event, id: 10, execType: 'G' },
    { ...event, id: 11, execType: 'H' },
    { ...event },
  ];
  const equity = { id: 'equity', symbolStr: 'GGAL', cfiCode: 'ESXXXX' };
  const mainStore = {
    profileStore: { activeAccount: account },
    orderEventStore: { getOrderEventsForAccountReport: async value => { calls.push(value); return rows; } },
    securityStore: { options: [call], underlyingsForMatrix: [equity],
      getSecurity: async id => {
        if (id === 'unknown') throw Error('PRIVATE_RESOLVER_ERROR');
        return [equity, put].find(security => security.id === id);
      } },
  };
  for (const field of ['orderStore', 'balanceStore', 'portfolioStore'])
    Object.defineProperty(mainStore, field, { get() { throw Error('Unrelated account capability'); } });
  const window = { mainStore, addEventListener: (_, fn) => { listener = fn; }, postMessage: message => replies.push(message) };
  const document = { currentScript: { dataset: { channel: 'test' } }, body: { innerText: 'Versión: 4.24.4' } };
  runInNewContext(source, { window, document, location: { origin }, crypto: { randomUUID: () => `context-${++uid}` } });

  function message(data) { return listener({ origin, source: window, data: { channel: 'test', ...data } }); }
  async function request(method = 'executions', params) {
    const requestId = ++id;
    await message({ kind: 'request', id: requestId, method, params });
    return replies.find(reply => reply.id === requestId);
  }
  return { mainStore, document, calls, replies, message, request, rows };
}

test('projects distinct execution events for the active account without cumulative quantities or private fields', async () => {
  const f = fixture();
  assert.equal(f.calls.length, 0);
  const { result } = await f.request('executions', { account: 'OTHER_ACCOUNT' });
  assert.deepEqual(f.calls, [account]);
  assert.equal(result.rows.length, 3);
  assert.equal(result.unmatched, 2);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows.map(row => [row.kind, row.quantity, row.price]))), [
    ['call', 2, 10.25], ['call', 3, 11], ['put', -4, 8],
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0])), { symbol: 'GFGC1234', underlying: 'GGAL',
    expiration: '2026-12-18', kind: 'call', strike: 1234.5, currency: 'ARS', strikeCurrency: '',
    settlement: '2', timestamp: Date.parse(event.transactTime), quantity: 2, price: 10.25 });
});

test('reads only the supported report and rejects incomplete pagination, unauthorized calls and unknown versions', async () => {
  const f = fixture();
  assert.match((await f.request('otherMethod')).error, /Método no permitido/);
  assert.equal(f.calls.length, 0);
  f.mainStore.orderEventStore.getOrderEventsForAccountReport = async () => ({ orderEvents: f.rows, nextTime: 'more' });
  assert.match((await f.request()).error, /reporte incompleto/);
  f.mainStore.orderEventStore.getOrderEventsForAccountReport = async () => { throw { response: { status: 401 } }; };
  assert.match((await f.request()).error, /Volvé a iniciar sesión/);
  f.document.body.innerText = 'Versión: 4.99.1';
  assert.match((await f.request()).error, /Versión de Matriz no verificada/);
});

test('rejects reads and clipboard verification after the active account changes', async () => {
  const f = fixture();
  const { result } = await f.request();
  assert.equal((await f.request('verifyExecutionContext', { contextId: result.contextId })).result, true);
  let release;
  f.mainStore.orderEventStore.getOrderEventsForAccountReport = () => new Promise(resolve => { release = resolve; });
  const pending = f.request();
  f.mainStore.profileStore.activeAccount = 'OTHER_ACCOUNT';
  release(f.rows);
  assert.match((await pending).error, /Cambió la cuenta/);
  assert.match((await f.request('verifyExecutionContext', { contextId: result.contextId })).error, /Cambió la cuenta/);
});

test('drops an in-flight report when the panel closes', async () => {
  const f = fixture();
  let release;
  f.mainStore.orderEventStore.getOrderEventsForAccountReport = () => new Promise(resolve => { release = resolve; });
  const pending = f.request();
  await f.message({ kind: 'detach' });
  release(f.rows);
  assert.equal(await pending, undefined);
});
