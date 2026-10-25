import test from 'node:test'; import assert from 'node:assert/strict';
import {revenueOrders, revenueModel, normalizedScore, percentile} from '../dist/js/calculations.js';
test('revenue orders round up',()=>assert.equal(revenueOrders(1000,19),53));
test('negative contribution is infeasible',()=>assert.equal(revenueModel({price:10,margin:.1,adSpend:0,targetRevenue:100,targetProfit:100,fixedCosts:20,conversion:.02,variableCosts:2}).feasible,false));
test('profit model guards zero conversion',()=>assert.equal(revenueModel({price:20,margin:.8,adSpend:0,targetRevenue:100,targetProfit:20,fixedCosts:10,conversion:0,variableCosts:0}).visits,null));
test('score weights normalize',()=>assert.equal(normalizedScore({a:80,b:40},{a:2,b:2}),60));
test('percentile uses observed values only',()=>assert.ok(Math.abs(percentile(20,[10,20,30])-(200/3))<1e-10));
