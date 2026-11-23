import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverProductMarkets,selectResearchBatch,assessDirection,chooseProductTarget} from '../dist/js/selection.js';
import {renderDecision} from '../dist/js/selection-view.js';

// Synthetic holdouts. Every market and measurement in this file is invented.
const listing=(id,title,extra={})=>({id:String(id),title,shopId:String(id),tags:[],
  listingType:'download',url:'https://example.invalid/'+id,...extra});
const select=(seed,rows)=>selectResearchBatch(seed,discoverProductMarkets(seed,rows));

test('different subjects on equivalent tidal embossing plates share one approval scope',()=>{
  const rows=['Orca','Orca','Anemone','Anemone'].map((subject,i)=>listing(i+1,
    'Tidal '+subject+' Embossing Plate | layered SVG',{tags:['tidal '+subject.toLowerCase()+' embossing plate']}));
  const batch=select('tidal',rows);
  assert.equal(batch.length,1);
  assert.equal(batch[0].listingIds.length,4);
  const report=assessDirection(batch[0],{sample:rows});
  assert.equal(report.etsy.direct.length,4);
  assert.equal(report.scope.evidence[0].formats[0].field,'title');
  assert.equal(report.scope.evidence[0].formats[0].listingId,'1');
  const html=renderDecision(chooseProductTarget([report]),[report]);
  assert.doesNotMatch(html,/cutting|for cutters|Product to prototype/i);
  assert.match(html,/layered/);
});

test('the same form for different uses keeps demand and recent estimates in separate cohorts',()=>{
  const rows=['tracking specimens','tracking specimens','invoicing clients','invoicing clients'].map((purpose,i)=>
    listing(i+1,'Lichen field form for '+purpose+' | fillable PDF'));
  const batch=select('lichen field form',rows);
  assert.equal(batch.length,2);
  const direction=batch.find(d=>d.identity.purpose==='tracking specimens');
  assert.ok(direction);
  const products=rows.map((r,i)=>({...r,as_of:'2026-11-12',shop:{id:r.shopId},sales:{est_last_month:i<2?2:900}}));
  products.push({...listing(5,'Lichen field form'),sales:{est_last_month:800},as_of:'2026-11-12'});
  const report=assessDirection(direction,{sample:rows,fetchedAt:'2026-11-15'},
    {keyword:{keyword:'lichen field form',estimatedSearchesMonthly:300},products});
  assert.deepEqual(report.sales.values,[2,2]);assert.equal(report.demand,null);
  assert.equal(report.commercial.records.at(-1).classification,'uncertain');
  assert.equal(report.commercial.records[3].classification,'adjacent');
  assert.equal(report.recommended,false);
});

test('co-advertised names across shops can identify a new comparable without transferring another query’s demand',()=>{
  const rows=[listing(1,'Astrolabe sight register | Astrolabe sight ledger',{tags:['astrolabe sight ledger']}),
    listing(2,'Astrolabe sight register | Astrolabe sight ledger',{tags:['astrolabe sight ledger']}),
    listing(3,'Astrolabe sight ledger')];
  const batch=select('astrolabe',rows);
  assert.equal(batch.length,1);
  assert.equal(batch[0].listingIds.length,3);
  assert.equal(assessDirection(batch[0],{sample:rows}).etsy.direct.length,3);
});
