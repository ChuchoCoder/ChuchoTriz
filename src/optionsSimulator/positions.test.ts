import { expect, it } from "vitest";
import { importPosition, type PositionSnapshot } from "./positions";
import { adjustStrategyQuantity, setStrategyPrice, shiftStrategyStrikes, type StrikeMarket } from "./strategyAdjustments";
import { addDays, expirySummary, initialSimulation, localDate, parseSimulation, resultAt, type Simulation } from "./model";
import type { Contract } from "./market";

const expiry = addDays(localDate(), 30);
const contracts: Contract[] = [90, 100, 110].map(strike => ({ id:`C${strike}`,symbol:`DEMO C${strike}`,underlyingId:"DEMO",kind:"call",
  strike,expiration:expiry.replaceAll("-", ""),currency:"ARS",strikeCurrency:"ARS",settlement:"2",factor:100 }));
const quotes = Object.fromEntries(contracts.map(contract=>[contract.id,{bid:{price:5,size:100},ask:{price:6,size:100},impliedVolatility:40}]));
const market: StrikeMarket = { underlying:"DEMO",currency:"ARS",expiry,contracts,quotes };
const snapshot = (): PositionSnapshot => ({contextId:"demo-context",storageScope:"a".repeat(64),capturedAt:Date.now(),reportedAt:Date.now(),positions:[{securityId:"C100",quantity:2}]});
const load = () => importPosition(snapshot(),contracts,quotes,{...initialSimulation(),legs:[]},"DEMO",100);
function strategy(input: Simulation) {
  const result=parseSimulation(input);
  if(!result.ok)throw Error(result.errors.join(", "));
  return result.strategy;
}
it("imports original signed quantities with unknown historical premiums and no prospective trades",()=>{
  const input=load();
  expect(input.legs).toEqual([]);
  expect(input.position?.legs[0]).toMatchObject({securityId:"C100",contracts:"2",side:"buy",premium:""});
  expect(parseSimulation(input).ok).toBe(false);
  const short=importPosition({...snapshot(),positions:[{securityId:"C100",quantity:-3}]},contracts,quotes,input,"DEMO",100);
  expect(short.position?.legs[0]).toMatchObject({side:"sell",contracts:"3",premium:""});
});
it("preserves historical premiums, expenses and realized results through price, quantity and strike adjustments",()=>{
  const input=load();
  input.position!.legs[0].premium="8";
  input.costs="40";input.realized="200";
  input.legs=[{...input.position!.legs[0],id:1,side:"sell",contracts:"1",premium:"5"}];
  const original=JSON.stringify(input.position);
  const priced=setStrategyPrice(input,1,market);
  expect(priced.ok).toBe(true);
  if(!priced.ok)return;
  const quantified=adjustStrategyQuantity(priced.legs,1);
  expect(quantified.ok).toBe(true);
  if(!quantified.ok)return;
  const shifted=shiftStrategyStrikes({...input,legs:quantified.legs},1,market);
  expect(shifted.ok).toBe(true);
  expect(JSON.stringify(input.position)).toBe(original);
  expect(input.costs).toBe("40");expect(input.realized).toBe("200");
  // Closing one historical long at 5 preserves its loss of 300 and the remaining long's cost.
  const position=strategy(input);
  expect(resultAt(position,110,"expiry")).toBe(60);
  expect(resultAt(position,90,"expiry")).toBe(-940);
  expect(expirySummary(position).entry).toBe(1140);
  expect(resultAt(strategy({...input,legs:[]}),110,"expiry")).toBe(560);
});
it("preserves premium on quantity changes and keeps its reviewed quantity until acknowledged",()=>{
  const input=load();
  input.position!.legs[0].premium="8";input.costs="25";input.realized="-10";
  const next=importPosition(snapshot(),contracts,quotes,input,"DEMO",100);
  expect(next.position?.legs[0].premium).toBe("8");
  expect(next.costs).toBe("25");expect(next.realized).toBe("-10");
  const changed=importPosition({...snapshot(),positions:[{securityId:"C100",quantity:3}]},contracts,quotes,next,"DEMO",100);
  expect(changed.position?.legs[0]).toMatchObject({premium:"8",contracts:"3",premiumQuantity:"2"});
  const refreshed=importPosition({...snapshot(),positions:[{securityId:"C100",quantity:3}]},contracts,quotes,changed,"DEMO",100);
  expect(refreshed.position?.legs[0].premiumQuantity).toBe("2");
  const reversed=importPosition({...snapshot(),positions:[{securityId:"C100",quantity:-3}]},contracts,quotes,changed,"DEMO",100);
  expect(reversed.position?.legs[0]).toMatchObject({premium:"",premiumQuantity:"2"});
});
it("resets all historical accounting when another account has the same chain and quantities",()=>{
  const input=load();
  input.position!.legs[0].premium="8";input.costs="25";input.realized="-10";
  input.legs=[{...input.position!.legs[0],id:1,side:"sell",premium:"5"}];
  const next=importPosition({...snapshot(),contextId:"another-context",storageScope:"b".repeat(64)},contracts,quotes,input,"DEMO",100);
  expect(next.position?.legs[0].premium).toBe("");
  expect(next.costs).toBe("0");expect(next.realized).toBe("");expect(next.legs).toEqual([]);
});
it("does not treat explicit zero cost or realized as missing and shifts both curves and equilibria",()=>{
  const input=load();
  input.position!.legs[0].premium="0";input.realized="0";
  expect(parseSimulation(input).ok).toBe(true);
  const base=strategy(input);
  const realized=strategy({...input,realized:"-200"});
  expect(resultAt(realized,110,"expiry")-resultAt(base,110,"expiry")).toBe(-200);
  expect(resultAt(realized,110,"theoretical")-resultAt(base,110,"theoretical")).toBeCloseTo(-200);
  expect(expirySummary(realized).equilibria[0].from).toBe(101);
});
it("rejects incomplete snapshots, duplicates, mixed factors and unsupported quantities without changing the draft",()=>{
  const input=load(),original=JSON.stringify(input);
  for(const positions of [[{securityId:"C100",quantity:.5}],[{securityId:"C100",quantity:1},{securityId:"C100",quantity:2}],[]])
    expect(()=>importPosition({...snapshot(),positions},contracts,quotes,input,"DEMO",100)).toThrow();
  expect(JSON.stringify(input)).toBe(original);
});
