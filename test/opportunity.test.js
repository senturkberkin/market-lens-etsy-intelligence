import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeOpportunity} from '../dist/js/opportunity.js';

const now = new Date('2026-10-29T12:00:00Z');
const observedAt = '2026-10-29T11:00:00Z';
const item = (n, type='download') => ({id:n,title:`meal planner template ${n}`,tags:['meal planner'],listingType:type,price:10+n/10});
const productConcept={audience:'new parents',problem:'plan meals with little time',format:'editable planner',difference:'fast batch planning',competitorIds:['0','1'],gapEvidence:'Neither sampled listing supports one-click batch planning.'};
const base = {keyword:'meal planner',listings:10000,updatedAt:observedAt,sample:Array.from({length:40},(_,i)=>item(i)),productConcept};
const external = {keyword:'meal planner',metric:'searches',value:200,source:'Etsy Marketplace Insights',observedAt:'2026-10-29',period:'last 30 days',market:'US'};
test('missing demand remains unknown, even for crowded keywords',()=>{
  const result=analyzeOpportunity(base,now);
  assert.equal(result.decision,'VALIDATE');
  assert.equal(result.demandIndicator,'Unknown');
  assert.equal(result.sample.digital,40);
});
test('positive dated demand plus checked differentiation supports explore',()=>{
  const result=analyzeOpportunity({...base,demandObservations:[external]},now);
  assert.equal(result.decision,'EXPLORE');
  assert.equal(result.evidenceComplete,true);
});
test('mixed physical results and tiny samples remain validate',()=>{
  const result=analyzeOpportunity({...base,sample:[item(1),item(2,'physical')],demandObservations:[external]},now);
  assert.equal(result.decision,'VALIDATE');
  assert.equal(result.sample.digital,1);
});
test('stale observations cannot produce explore',()=>{
  const result=analyzeOpportunity({...base,updatedAt:'2026-10-28T10:00:00Z',demandObservations:[external]},now);
  assert.equal(result.decision,'VALIDATE');
  assert.equal(result.evidenceQuality,'Stale or missing');
});
test('explicit verified rejection produces avoid',()=>{
  const result=analyzeOpportunity({...base,rejectionEvidence:{verified:true,reason:'Product cannot be produced legally',source:'Rights review'}},now);
  assert.equal(result.decision,'AVOID');
});
test('same input is deterministic and irrelevant title excluded',()=>{
  const input={...base,sample:[...base.sample,{title:'physical poster',tags:[],listingType:'physical',price:5}]};
  assert.deepEqual(analyzeOpportunity(input,now),analyzeOpportunity(input,now));
  assert.equal(analyzeOpportunity(input,now).sample.relevant,40);
});
test('provider error or empty input abstains',()=>{
  assert.equal(analyzeOpportunity({keyword:'planner',providerError:'upstream failed'},now).decision,'VALIDATE');
});
