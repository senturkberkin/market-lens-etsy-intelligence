import test from 'node:test'; import assert from 'node:assert/strict';
import {revenueOrders, revenueModel, normalizedScore, percentile, decisionGate, keywordOpportunityIndex} from '../dist/js/calculations.js';
test('revenue orders round up',()=>assert.equal(revenueOrders(1000,19),53));
test('negative contribution is infeasible',()=>assert.equal(revenueModel({price:10,margin:.1,adSpend:0,targetRevenue:100,targetProfit:100,fixedCosts:20,conversion:.02,variableCosts:2}).feasible,false));
test('profit model guards zero conversion',()=>assert.equal(revenueModel({price:20,margin:.8,adSpend:0,targetRevenue:100,targetProfit:20,fixedCosts:10,conversion:0,variableCosts:0}).visits,null));
test('score weights normalize',()=>assert.equal(normalizedScore({a:80,b:40},{a:2,b:2}),60));
test('percentile uses observed values only',()=>assert.ok(Math.abs(percentile(20,[10,20,30])-(200/3))<1e-10));
test('decision gate passes only when both thresholds pass',()=>{
  const base={price:20,margin:.8,adSpend:0,targetRevenue:100,targetProfit:20,fixedCosts:10,conversion:.05,variableCosts:0,demand:1000,confidence:'High',scores:{demand:80,competition:70,pricing:80}};
  assert.equal(decisionGate(base,{signalMin:60,burdenMax:50}).status,'GO');
  assert.equal(decisionGate({...base,scores:{...base.scores,demand:10}},{signalMin:60,burdenMax:50}).status,'NO-GO');
});
test('passing weak evidence is explicitly conditional',()=>{
  const p={price:20,margin:.8,adSpend:0,targetRevenue:100,targetProfit:20,fixedCosts:10,conversion:.05,variableCosts:0,demand:1000,confidence:'Low',scores:{demand:80,competition:70,pricing:80}};
  assert.equal(decisionGate(p,{signalMin:60,burdenMax:50}).status,'GO — VALIDATE');
});
test('keyword index rewards stronger demand and lower competition',()=>{
  const strong=keywordOpportunityIndex({demand:4000,listings:2000,price:20});
  const weak=keywordOpportunityIndex({demand:900,listings:16000,price:20});
  assert.ok(strong>weak);
});
