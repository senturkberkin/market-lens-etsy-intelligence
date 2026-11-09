import test from 'node:test';
import assert from 'node:assert/strict';
import {buildResearchReport} from '../dist/js/research.js';

// These are fixtures. The live Etsy observations are reported separately.
for(const [keyword,title,tag] of [
  ['digital poster','Formula racing digital poster SVG','formula racing poster'],
  ['ADHD planner','ADHD daily planner Goodnotes','adhd daily planner'],
  ['wedding budget spreadsheet','Wedding budget spreadsheet Google Sheets','wedding budget spreadsheet']
])test(`${keyword}: combined fixture produces evidence-linked brief`,()=>{
  const sample=[1,2,3].map(id=>({id,title,tags:[tag],listingType:'download',price:id+4,currency:'USD',favorites:id,url:`https://etsy.example/listing/${id}`}));
  sample.push({id:4,title:'Unrelated knitted scarf',tags:['scarf'],listingType:'physical',price:99,currency:'EUR'});
  const report=buildResearchReport(keyword,{sample,totalListings:10000,source:'Etsy Open API v3',fetchedAt:'2026-11-09'},
    {exact:{keyword,estimatedSearchesMonthly:500,competingListings:3000},searchPeriod:'last 12 months',geography:'unspecified'});
  assert.equal(report.demand.measurement,500);
  assert.equal(report.supply.digitalCompetitorCount,3);
  assert.equal(report.supply.priceRanges[0].currency,'USD');
  assert.equal(report.supply.priceRanges[0].max,7);
  assert.equal(report.purchase.status,'unverified');
  assert.ok(report.concepts.length>0);
  assert.ok(report.concepts[0].gapAssessment.supportingListings.every(x=>x.url?.startsWith('https://etsy.example/')));
  assert.match(report.nextAction,/dated reviews/);
  assert.ok(report.directions.every(x=>x.kind==='observed'||x.kind==='hypothesis'));
  if(tag!==keyword.toLowerCase())assert.ok(report.advertisedTerms.some(x=>x.phrase===tag));
});

test('missing demand and physical-only sample never invent a digital opportunity',()=>{
  const report=buildResearchReport('dog collar',{sample:[{id:1,title:'Leather dog collar',tags:['dog collar'],listingType:'physical',price:15,currency:'USD'}],totalListings:300});
  assert.equal(report.demand.measurement,null);
  assert.equal(report.supply.digitalCompetitorCount,0);
  assert.deepEqual(report.concepts,[]);
  assert.equal(report.purchase.status,'unverified');
});

test('mixed currencies are not pooled; broad count is distinct from relevant supply',()=>{
  const report=buildResearchReport('printable calendar',{sample:[
    {id:1,title:'Printable calendar',tags:['printable calendar'],listingType:'download',price:5,currency:'USD'},
    {id:2,title:'Printable calendar',tags:['printable calendar'],listingType:'download',price:6,currency:'EUR'},
    {id:3,title:'Physical paper calendar',tags:['calendar'],listingType:'physical',price:9,currency:'USD'}
  ],totalListings:50000});
  assert.equal(report.supply.broadMatches,50000);
  assert.equal(report.supply.digitalCompetitorCount,2);
  assert.deepEqual(report.supply.priceRanges.map(x=>x.currency),['EUR','USD']);
  assert.equal(report.demand.measurement,null);
});

test('only dated purchase-linked evidence changes purchase status',()=>{
  const etsy={sample:[{id:1,title:'ADHD planner',tags:['adhd planner'],listingType:'download',favorites:1000}],totalListings:100};
  assert.equal(buildResearchReport('ADHD planner',etsy).purchase.status,'unverified');
  assert.equal(buildResearchReport('ADHD planner',etsy,null,{evidence:[{reviewCount90d:2}]}).purchase.status,'dated reviews observed');
});

test('a related Alura observation applies only to its matching selected phrase',()=>{
  const etsy={sample:[],totalListings:0};
  const alura={exact:{keyword:'planner',estimatedSearchesMonthly:1000},related:[{keyword:'garden planner',estimatedSearchesMonthly:80}]};
  assert.equal(buildResearchReport('garden planner',etsy,alura).demand.measurement,80);
  assert.equal(buildResearchReport('wedding planner',etsy,alura).demand.measurement,null);
});
