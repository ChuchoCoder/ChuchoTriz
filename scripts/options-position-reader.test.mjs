import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = readFileSync(new URL('../public/options-position-reader.js', import.meta.url), 'utf8');
function fixture() {
  const listeners = [], replies = [], calls = [];
  const options = [0, 1].map(index => ({ id:`option-${index}`, fixSymbol:`FIX OPTION ${index}`, cfiCode:index ? 'OPASPS':'OCASPS',
    currency:'ARS', settlementType:'2', underlying:'DEMO', refData:{maturityDateStr:'20261218'} }));
  const positions = options.map((sec,index)=>({ tradingSymbol:sec.fixSymbol, totalCurrentSize:index ? -3:2, totalCollateralSize:0,
    historicalCost:'PRIVATE_COST', orders:'PRIVATE_ORDERS' }));
  const underlying = {id:'DEMO',symbolStr:'DEMO',currency:'ARS',marketId:'bm',cfiCode:'ESXXXX'};
  const holding = {symbolReference:'DEMO',security:underlying,instrumentCurrentSize:100,detailedPositions:[
    {security:underlying,totalCurrentSize:75,tradingSymbol:'DEMO CI',historicalCost:'PRIVATE_COST'},
    {security:underlying,totalCurrentSize:25,tradingSymbol:'DEMO 24'},
  ]};
  const report = {lastCalculation:new Date(), types:[
    {type:'STOCK_OPTION_CALL',securitiesDetailed:[{detailedPositions:[positions[0]]}]},
    {type:'STOCK_OPTION_PUT',securitiesDetailed:[{detailedPositions:[positions[1]]}]},
    {type:'STOCK',securitiesDetailed:[holding,{symbolReference:'OTHER',get detailedPositions(){throw Error('Unrelated report access');}}]},
    {type:'BOND',get securitiesDetailed(){throw Error('Unrelated report access');}},
  ],account:'PRIVATE_ACCOUNT'};
  const store = { profileStore:{activeAccount:'PRIVATE_ACCOUNT',context:{riskDetailedCollateralEnabled:true}},
    securityStore:{options,underlyingsForMatrix:[underlying]},portfolioStore:{detailedPositionReport:report,getDetailedPositionReport:async (...args)=>{calls.push(args);return report;}} };
  for(const name of ['orderStore','balanceStore']) Object.defineProperty(store,name,{get(){throw Error('Forbidden account field');}});
  const window = {mainStore:store,addEventListener:(_name,listener)=>listeners.push(listener),postMessage:msg=>replies.push(msg)};
  const document = {currentScript:{dataset:{channel:'position-test'}},body:{innerText:'Versión: 4.24.4'}};
  let uuid=0;
  runInNewContext(source,{window,document,Date,TextEncoder,crypto:{randomUUID:()=>`context-${++uuid}`,subtle:webcrypto.subtle},location:{origin:'https://fixture.test'}});
  const params = {ids:options.map(sec=>sec.id),underlyingId:'DEMO',expiration:'20261218',currency:'ARS',settlement:'2',storageSalt:'a'.repeat(64)};
  let id = 0;
  async function call(method='positions', selected=params) {
    const request=++id;
    await listeners[0]({source:window,data:{channel:'position-test',kind:'request',id:request,method,params:selected}});
    return replies.find(reply=>reply.id===request);
  }
  return {store,window,document,report,positions,options,holding,params,listeners,replies,calls,call};
}
test('reads only after explicit request and exports only selected signed quantities and timestamps',async()=>{
  const f=fixture();
  assert.equal(f.calls.length,0);
  const result=(await f.call()).result;
  assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls[0],['PRIVATE_ACCOUNT',true]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.positions)),[{securityId:'option-0',quantity:2},{securityId:'option-1',quantity:-3}]);
  assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
  assert.equal(result.underlyingQuantity,100);
  assert.deepEqual(Object.keys(result).sort(),['capturedAt','contextId','positions','reportedAt','storageScope','underlyingQuantity','version']);
});
test('validates nominal holdings against the selected instrument and its signed settlement detail',async()=>{
  const f=fixture();
  f.holding.instrumentCurrentSize=-100;
  f.holding.detailedPositions.forEach(row=>{row.totalCurrentSize*=-1;});
  assert.equal((await f.call()).result.underlyingQuantity,-100);
  f.holding.instrumentCurrentSize=-99;
  const partial=(await f.call()).result;
  assert.equal(partial.underlyingUnavailable,true);
  assert.equal(partial.underlyingQuantity,undefined);
  assert.equal(partial.positions.length,2);
  f.report.types.find(group=>group.type==='STOCK').securitiesDetailed.shift();
  assert.equal((await f.call()).result.underlyingQuantity,0);
});
test('filters the selected chain and never interprets native prices as historical premiums',async()=>{
  const f=fixture();
  f.positions[0].buyPricePPPDiff=123;
  const result=(await f.call('positions',{...f.params,ids:['option-1']})).result;
  assert.equal(result.positions.length,1);
  assert.deepEqual(Object.keys(result.positions[0]).sort(),['quantity','securityId']);
});
test('preserves the native report date when it is ahead of the local clock',async()=>{
  const f=fixture();
  f.report.lastCalculation=new Date(Date.now()+25*60*60*1000);
  const {result}=await f.call();
  assert.equal(result?.reportedAt,f.report.lastCalculation.getTime());
  assert.equal(result.positions.length,2);
});
test('rejects arbitrary methods before native account access',async()=>{
  const f=fixture();
  for(const method of ['catalog','snapshot','orders','sendOrder','constructor','getPortfolio'])
    assert.match((await f.call(method)).error,/Método no permitido/);
  assert.equal(f.calls.length,0);
});
test('discards data if account or version changes during refresh',async()=>{
  for(const change of [f=>{f.store.profileStore.activeAccount='OTHER';},f=>{f.document.body.innerText='Versión: 99.0';}]) {
    const f=fixture();
    f.store.portfolioStore.getDetailedPositionReport=async()=>{change(f);return f.report;};
    assert.ok((await f.call()).error);
  }
});
test('changes the opaque context token when the active account changes between imports',async()=>{
  const f=fixture();
  const first=(await f.call()).result;
  f.store.profileStore.activeAccount='OTHER';
  const second=(await f.call()).result;
  assert.notEqual(first.contextId,second.contextId);
  assert.notEqual(first.storageScope,second.storageScope);
  assert.equal(JSON.stringify(second).includes('OTHER'),false);
});
test('uses a stable salted local account scope across page contexts and separates profiles',async()=>{
  const first=(await fixture().call()).result;
  const second=(await fixture().call()).result;
  assert.equal(first.storageScope,second.storageScope);
  assert.match(first.storageScope,/^[a-f0-9]{64}$/);
  const f=fixture();
  const other=(await f.call('positions',{...f.params,storageSalt:'b'.repeat(64)})).result;
  assert.notEqual(first.storageScope,other.storageScope);
  assert.ok((await f.call('positions',{...f.params,storageSalt:''})).error);
});
test('rechecks the opaque context without requesting another report after reading local storage',async()=>{
  const f=fixture();
  const {contextId}=(await f.call()).result;
  assert.equal((await f.call('verifyPositionContext',{contextId})).result,true);
  f.store.profileStore.activeAccount='OTHER';
  assert.match((await f.call('verifyPositionContext',{contextId})).error,/Cambió la cuenta/);
  assert.equal(f.calls.length,1);
});
test('serializes native requests and retains the lock after the client retires',async()=>{
  const f=fixture();let release;
  f.store.portfolioStore.getDetailedPositionReport=()=>new Promise(resolve=>{release=()=>resolve(f.report);});
  const first=f.call();
  while(!release) await new Promise(resolve=>setTimeout(resolve,0));
  assert.match((await f.call()).error,/pendiente/);
  await f.listeners[0]({source:f.window,data:{channel:'position-test',kind:'retire',id:1}});
  assert.match((await f.call()).error,/pendiente/);
  release();await first;
  assert.match(f.replies.find(reply=>reply.id===1).error,/retirada/);
});
test('rejects invalid quantities, duplicate buckets, collateral and ambiguous references',async()=>{
  const changes=[
    f=>{f.positions[0].totalCurrentSize=.5;},
    f=>{f.report.types[0].securitiesDetailed[0].detailedPositions.push({...f.positions[0]});},
    f=>{f.positions[0].totalCollateralSize=1;},
    f=>{f.options[1].fixSymbol=f.options[0].fixSymbol;},
    f=>{f.positions[0].tradingSymbol='UNKNOWN';},
    f=>{f.report.lastCalculation=new Date('invalid');},
    f=>{f.options[0].refData.maturityDateStr='20991218';},
  ];
  for(const change of changes){const f=fixture();change(f);assert.ok((await f.call()).error);}
});
test('native failures never expose broker messages or account identifiers',async()=>{
  const f=fixture();
  f.store.portfolioStore.getDetailedPositionReport=async()=>{throw Error('PRIVATE_ACCOUNT failed');};
  const response=await f.call();
  assert.ok(response.error);
  assert.equal(JSON.stringify(response).includes('PRIVATE'),false);
});
test('ignores other windows and detached clients',async()=>{
  const f=fixture();
  await f.listeners[0]({source:{},data:{channel:'position-test',kind:'request',method:'positions',id:90,params:f.params}});
  assert.equal(f.calls.length,0);
  await f.listeners[0]({source:f.window,data:{channel:'position-test',kind:'detach'}});
  assert.equal(await f.call(),undefined);
});
