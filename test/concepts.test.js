import test from 'node:test';
import assert from 'node:assert/strict';
import {generateProductConcepts,explainConceptAbstention} from '../dist/js/concepts.js';
import {extractListingCharacteristics} from '../dist/js/product-evidence.js';
import {groupProductEvidence} from '../dist/js/product-evidence.js';

const markets=[
  ['fermentation batch log','Fermentation Batch Log Spreadsheet for Home Brewers','home brewers','track fermentation temperature','temperature chart','brew schedule'],
  ['ceramic kiln firing','Ceramic Kiln Firing Spreadsheet for Studio Potters','studio potters','record kiln firing temperatures','glaze test chart','firing schedule'],
  ['aquaponic water log','Aquaponic Water Log Workbook for Fish Farmers','fish farmers','monitor water chemistry readings','pH trend chart','feeding schedule']
];
const sample=([keyword,title,audience,functionText,featureA,featureB])=>[
  {id:101,url:'https://www.etsy.com/listing/101',title,tags:[keyword],listingType:'download',
    description:`A downloadable workbook for ${audience} to ${functionText}. Includes a ${featureA} and ingredient notes.`},
  {id:102,url:'https://www.etsy.com/listing/102',title,tags:[keyword],listingType:'download',
    description:`A digital workbook for ${audience} to ${functionText}. Includes ingredient notes and a ${featureB}.`}
];

for(const market of markets)test(`open-vocabulary evidence produces a specific ${market[0]} hypothesis`,()=>{
  const concepts=generateProductConcepts(market[0],sample(market));
  assert.equal(concepts.length,1);
  const concept=concepts[0];
  assert.equal(concept.audience,market[2]);
  assert.match(concept.coreFunctionality,new RegExp(market[3]));
  assert.ok(concept.includedFeatures.includes(market[4]));
  assert.ok(concept.includedFeatures.includes(market[5]));
  assert.equal(concept.gapAssessment.status,'hypothesis');
  assert.equal(concept.gapAssessment.supportingListings.length,2);
  for(const claim of [concept.characteristics.audience,concept.characteristics.function,...concept.characteristics.features]){
    assert.ok(claim.id&&claim.url&&claim.quote);
    assert.match(claim.quote,new RegExp(claim.value,'i'));
  }
});

test('bullet features are extracted from unfamiliar product descriptions with source text',()=>{
  const row={id:7,title:'Aquaponic Water Log Workbook',tags:['aquaponic water log'],listingType:'download',
    description:'A workbook for fish farmers to monitor water chemistry.\nWHAT IS INCLUDED\n- pH trend chart\n- Feeding schedule\n- Pond maintenance notes'};
  const characteristics=extractListingCharacteristics(row);
  assert.ok(characteristics.features.some(x=>x.value==='pH trend chart'&&x.listingId==='7'));
  assert.ok(characteristics.features.some(x=>x.value==='Feeding schedule'));
});

test('thin, unrelated, and physical samples abstain instead of generating template products',()=>{
  assert.deepEqual(generateProductConcepts('gardening',[]),[]);
  assert.deepEqual(generateProductConcepts('gardening',[
    {id:1,title:'Gardening planner',tags:['gardening planner'],listingType:'download'},
    {id:2,title:'Gardening planner',tags:['gardening planner'],listingType:'download'}
  ]),[]);
  assert.match(explainConceptAbstention('gardening',[]),/Fewer than two/);
  assert.deepEqual(generateProductConcepts('gardening',[
    {id:1,title:'Wedding budget template',tags:['wedding'],listingType:'download'},
    {id:2,title:'Physical gardening shovel',tags:['gardening'],listingType:'physical'}
  ]),[]);
});

test('a feature already co-advertised is not called a gap',()=>{
  const rows=sample(markets[0]);
  rows[0].description+=' Includes a brew schedule.';
  rows[1].description+=' Includes a temperature chart.';
  assert.deepEqual(generateProductConcepts(markets[0][0],rows),[]);
});

test('different seller phrases join by repeated audience and function evidence',()=>{
  const rows=sample(markets[0]);
  for(const row of rows)row.tags.push('fermentation journal','batch tracker');
  const groups=groupProductEvidence('fermentation batch log',rows);
  assert.ok(groups.some(group=>group.aliases.includes('fermentation journal')&&group.aliases.includes('batch tracker')));
});
