import test from 'node:test';
import assert from 'node:assert/strict';
import {parseResearchInput,directionsFromEvidence,indexObservation,upsertResearchIndex,cachedObservation,relatedIndexedKeywords,pruneSavedBriefs} from '../dist/js/research-index.js';

test('one input accepts broad and specific keywords plus Etsy listing and shop URLs',()=>{
  assert.equal(parseResearchInput('gardening').type,'keyword');
  assert.equal(parseResearchInput('wedding budget spreadsheet').keyword,'wedding budget spreadsheet');
  assert.equal(parseResearchInput('https://www.etsy.com/listing/12345/sample').id,'12345');
  assert.equal(parseResearchInput('etsy.com/shop/TestStudio?ref=abc').shop,'TestStudio');
  assert.throws(()=>parseResearchInput('https://example.com/listing/123'),/Etsy/);
  assert.throws(()=>parseResearchInput('https://etsy.com/listing/no-id'),/direct Etsy/);
});

test('unfamiliar shop and listing evidence create observed directions without demand',()=>{
  const sample=[
    {id:1,title:'Mushroom cultivation logbook printable',tags:['mushroom cultivation logbook','mushroom grow tracker'],listingType:'download'},
    {id:2,title:'Mushroom grow tracker PDF',tags:['mushroom grow tracker'],listingType:'download'}
  ];
  const parsed=parseResearchInput('https://www.etsy.com/shop/FungiStudio');
  const payload={sample,fetchedAt:'2026-11-09T10:00:00Z',source:'Etsy Open API v3',totalListings:22};
  const directions=directionsFromEvidence(parsed,payload);
  assert.ok(directions.some(x=>x.keyword==='mushroom grow tracker'&&x.listingIds.length===2));
  const observation=indexObservation(parsed,payload,directions);
  assert.equal(observation.returnedListingIds.length,2);
  assert.equal(observation.relatedPhrases[0].kind,'observed');
  assert.ok(!JSON.stringify(observation).includes('searchVolume'));
  assert.match(observation.scope,/does not establish consistent ranking/);
});

test('a listing title can supply directions when tags are absent',()=>{
  const parsed=parseResearchInput('https://www.etsy.com/listing/99/example');
  const directions=directionsFromEvidence(parsed,{sample:[{id:99,title:'Ceramic kiln firing tracker spreadsheet',tags:[],listingType:'download'}]});
  assert.ok(directions.some(x=>x.keyword==='ceramic kiln firing tracker'&&x.origins.includes('Etsy listing title')));
});

test('index reuses fresh observations and relates searches only by shared listing IDs',()=>{
  const now=Date.parse('2026-11-09T12:00:00Z');
  const a={key:'keyword:planner',type:'keyword',searchKeyword:'planner',fetchedAt:'2026-11-09T11:55:00Z',returnedListingIds:['1','2']};
  const b={key:'keyword:budget planner',type:'keyword',searchKeyword:'budget planner',fetchedAt:'2026-11-09T11:56:00Z',returnedListingIds:['2','3']};
  const index=upsertResearchIndex(upsertResearchIndex([],a,now),b,now);
  assert.equal(cachedObservation(index,a.key,now).searchKeyword,'planner');
  assert.deepEqual(relatedIndexedKeywords(index,['2']).map(x=>x.keyword),['budget planner','planner']);
  assert.equal(cachedObservation(index,a.key,now+16*60*1000),null);
  assert.equal(upsertResearchIndex(index,{...a,fetchedAt:'2026-11-09T12:00:00Z'},now).length,2);
  assert.equal(upsertResearchIndex(index,{...a,fetchedAt:'2026-11-09T18:01:00Z'},now+6*60*60*1000+60*1000).length,1);
});

test('keyword discovery stays grounded in exact or semantic listing evidence',()=>{
  const parsed=parseResearchInput('ADHD planner');
  const payload={sample:[
    {id:1,title:'ADHD daily planner printable',tags:['adhd daily planner'],listingType:'download'},
    {id:2,title:'Unrelated wedding sign',tags:['wedding sign'],listingType:'download'}
  ]};
  const directions=directionsFromEvidence(parsed,payload);
  assert.ok(directions.some(x=>x.keyword==='adhd daily planner'));
  assert.ok(directions.every(x=>!x.keyword.includes('wedding')));
  assert.equal(indexObservation(parsed,payload,directions).listings[1].relevance,'irrelevant');
});

test('broad physical-heavy search still surfaces observed digital directions first',()=>{
  const parsed=parseResearchInput('gardening');
  const sample=Array.from({length:30},(_,id)=>({id:id+1,title:'Gardening gloves with flowers',tags:['gardening gloves','gardening gift'],listingType:'physical'}));
  sample.push({id:99,title:'Gardening ebook and planner',tags:['gardening ebook','gardening planner'],listingType:'download'});
  const directions=directionsFromEvidence(parsed,{sample});
  assert.ok(directions.some(x=>x.keyword==='gardening ebook'));
  assert.ok(directions[0].listingTypes.includes('download'));
  assert.ok(directions.every(x=>!('estimatedSearchesMonthly' in x)));
});

test('digital probe phrases are extracted against the original seed',()=>{
  const original=parseResearchInput('dog collar');
  const rows=directionsFromEvidence(original,{sample:[
    {id:1,title:'Dog collar sewing pattern digital download',tags:['dog collar sewing pattern'],listingType:'download'},
    {id:2,title:'Dog collar sewing pattern digital download',tags:['dog collar sewing pattern'],listingType:'download'}
  ]});
  assert.ok(rows.some(x=>x.keyword==='dog collar sewing pattern'&&x.listingIds.length===2));
  const probe=indexObservation(parseResearchInput('dog collar digital'),{sample:[]},rows.map(x=>({...x,basisKeyword:'dog collar'})));
  assert.ok(probe.relatedPhrases.some(x=>x.keyword==='dog collar sewing pattern'&&x.basisKeyword==='dog collar'));
});

test('saved briefs remove old Etsy listing content but retain the concept label',()=>{
  const now=Date.parse('2026-11-11T12:00:00Z');
  const old={savedAt:'2026-11-10T12:00:00Z',keyword:'garden planner',concept:{id:'c1',name:'Garden Planner',gapAssessment:{supportingListings:[{title:'Etsy listing'}]}},report:{supply:{fetchedAt:'2026-11-10T12:00:00Z'},competitors:[{title:'Etsy listing'}]}};
  const cleaned=pruneSavedBriefs([old],now);
  assert.equal(cleaned[0].concept.name,'Garden Planner');
  assert.equal(cleaned[0].report,null);
  assert.ok(!JSON.stringify(cleaned).includes('Etsy listing'));
});
