import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverKeywords} from '../dist/js/discovery.js';
import {generateProductConcepts} from '../dist/js/concepts.js';
import {analyzeOpportunity} from '../dist/js/opportunity.js';

const cases=[
  ['wedding planning','Wedding planning timeline checklist','wedding planning checklist'],
  ['adhd organization','ADHD organization daily routine tracker','adhd organization tracker'],
  ['freelancing','Freelancing client onboarding spreadsheet','freelancing client spreadsheet'],
  ['gardening','Gardening seasonal planting calendar','gardening planting calendar'],
  ['small business administration','Small business administration invoice register','small business administration register']
];

for(const [seed,title,tag] of cases)test(`${seed} yields evidence-linked concepts`,()=>{
  const sample=[1,2,3].map(id=>({id,title,tags:[tag],listingType:'download',price:10+id}));
  const directions=discoverKeywords(seed,sample);
  assert.ok(directions.length>0);
  const selected=directions.find(x=>x.kind==='observed');
  assert.ok(selected);
  const concepts=generateProductConcepts(selected.keyword,sample);
  assert.ok(concepts.length>0);
  assert.ok(concepts.some(x=>x.name.toLowerCase().includes(seed.split(' ')[0])));
  assert.ok(concepts.every(x=>x.gapAssessment.status==='hypothesis'));
  assert.ok(concepts.every(x=>x.gapAssessment.supportingListings.length>=2));
  const result=analyzeOpportunity({keyword:selected.keyword,sample,updatedAt:new Date().toISOString(),listings:1000,productConcept:undefined});
  assert.equal(result.decision,'VALIDATE');
  assert.equal(result.demandIndicator,'Unknown');
});

test('unrelated or insufficient evidence yields no convincing concept',()=>{
  assert.deepEqual(generateProductConcepts('gardening',[]),[]);
  assert.deepEqual(generateProductConcepts('gardening',[
    {id:1,title:'Wedding budget template',tags:['wedding'],listingType:'download'},
    {id:2,title:'Physical gardening shovel',tags:['gardening'],listingType:'physical'}
  ]),[]);
});

test('different domains produce different product hypotheses',()=>{
  const names=cases.map(([seed,title,tag])=>generateProductConcepts(seed,[1,2].map(id=>({id,title,tags:[tag],listingType:'download'})))[0]?.name);
  assert.equal(new Set(names).size,cases.length);
});
