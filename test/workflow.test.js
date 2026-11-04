import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/etsy-keyword.js';
import {normalizeEtsyObservation} from '../dist/js/provider.js';
import {analyzeOpportunity,assessDemand,assessProductGap} from '../dist/js/opportunity.js';

const now=new Date('2026-10-29T12:00:00Z');
const demand={keyword:'meal planner',metric:'searches',value:200,source:'Manual research',observedAt:'2026-10-29',period:'last 30 days',market:'US'};
const concept={audience:'new parents',problem:'weekly meal planning',format:'editable spreadsheet',difference:'one-click batch planning',competitorIds:['1','2'],gapEvidence:'Both competitor listings require manual reentry of every meal.'};

test('demand observations retain units and detect conflicts without aggregation',()=>{
  const result=assessDemand([demand,{...demand,metric:'index',value:80},{...demand,source:'Second source',value:0}], 'meal planner',now);
  assert.equal(result.observations.length,3);
  assert.equal(result.status,'CONFLICTING');
  assert.equal(result.selected.value,200);
  assert.equal(assessDemand([{...demand,keyword:'other keyword'}],'meal planner',now).status,'UNKNOWN');
  assert.equal(assessDemand([{...demand,observedAt:'2026-01-01'}],'meal planner',now).status,'STALE');
});
test('product claim remains hypothesis until two sampled competitors support it',()=>{
  const competitors=[{id:1},{id:2}];
  assert.equal(assessProductGap({...concept,competitorIds:['1']},competitors).status,'HYPOTHESIS');
  assert.equal(assessProductGap(concept,competitors).status,'OBSERVED DIFFERENCE');
});
test('API response through normalization and research inputs produces an explainable result',async()=>{
  const previousKey=process.env.ETSY_API_KEY, previousFetch=globalThis.fetch;
  process.env.ETSY_API_KEY='test-key';
  globalThis.fetch=async()=>({ok:true,json:async()=>({count:1200,results:Array.from({length:40},(_,i)=>({listing_id:i+1,title:`Meal planner ${i}`,tags:['meal planner'],listing_type:'download',price:{amount:1000+i,divisor:100},num_favorers:i,original_creation_timestamp:1000}))})});
  const response={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};
  try {
    await handler({method:'GET',query:{keyword:'meal planner',market:'US'},headers:{}},response);
    assert.equal(response.statusCode,200);
    assert.equal(response.body.digitalSampleSize,40);
    const observed=normalizeEtsyObservation({...response.body,fetchedAt:'2026-10-29T11:00:00Z'});
    const result=analyzeOpportunity({...observed,keyword:'meal planner',demandObservations:[demand],productConcept:concept},now);
    assert.equal(result.decision,'EXPLORE');
    assert.equal(result.sample.digital,40);
    assert.match(result.reasons.join(' '),/sampled competitors/);
  } finally {globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.ETSY_API_KEY;else process.env.ETSY_API_KEY=previousKey}
});
