import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverProductMarkets,selectResearchBatch,assessDirection,chooseProductTarget} from '../dist/js/selection.js';
import {planCommercialResearch,normalizeProducts,runCommercialResearch} from '../api/commercial-research.js';

const listings=[
  {id:'1',listingType:'download',title:'Horror Movie PNG Bundle Digital Download',tags:['horror movie png bundle']},
  {id:'2',listingType:'download',title:'Retro Zombie Movie Posters SVG Bundle',tags:['horror movie svg bundle']},
  {id:'3',listingType:'download',title:'Horror Movie Poster for Gothic Film Fans',tags:['horror movie poster'],description:'Poster for gothic film fans'},
  {id:'4',listingType:'download',title:'Horror Movie Poster for Gothic Film Fans',tags:['horror movie poster'],description:'Poster for gothic film fans'}
];
test('product markets come from unfamiliar listing evidence, not a category catalog',()=>{
  const markets=discoverProductMarkets('horror movie',listings);
  assert.ok(markets.some(item=>item.phrase.includes('horror movie')));
  assert.ok(selectResearchBatch('horror movie',markets,3).length<=3);
});
test('selection abstains when direction demand is broad or buyer position is not explicit',()=>{
  const assessment=assessDirection({phrase:'horror movie png bundle'}, {sample:listings}, {keyword:null,products:[{id:'1',title:listings[0].title,shop:{id:'a'},sales:{est_last_month:5}},{id:'2',title:listings[1].title,shop:{id:'b'},sales:{est_last_month:1}}]});
  assert.equal(assessment.recommended,false);
  assert.equal(chooseProductTarget([assessment]).status,'preliminary');
});
test('selection requires independent recent activity and explicit buyer positioning',()=>{
  const direction={phrase:'horror movie poster'};
  const assessment=assessDirection(direction,{sample:listings},{keyword:{keyword:direction.phrase,estimatedSearchesMonthly:100},products:[
    {id:'3',title:listings[2].title,shop:{id:'a'},as_of:'2026-11-01',sales:{est_last_month:2}},
    {id:'4',title:listings[3].title,shop:{id:'b'},as_of:'2026-11-08',sales:{est_last_month:1}}
  ]});
  assert.equal(assessment.recommended,true);
  assert.equal(chooseProductTarget([assessment]).winner.direction.phrase,'horror movie poster');
});
test('movie poster can surface horror poster and decorative purpose is not rejected as a missing functional problem',()=>{
  const posterRows=[
    {id:'a',listingType:'download',title:'Horror Movie Poster Digital Download',tags:['horror movie poster']},
    {id:'b',listingType:'download',title:'Horror Movie Poster Digital Download',tags:['horror movie poster']}
  ];
  const market=discoverProductMarkets('movie poster',posterRows).find(item=>item.phrase==='horror movie poster');
  assert.ok(market);
  const assessed=assessDirection(market,{sample:posterRows},{keyword:{keyword:market.phrase,estimatedSearchesMonthly:20},products:[
    {id:'a',title:posterRows[0].title,shop:{id:'one'},as_of:'2026-11-01',sales:{est_last_month:1}},
    {id:'b',title:posterRows[1].title,shop:{id:'two'},as_of:'2026-11-02',sales:{est_last_month:1}}
  ]});
  assert.equal(assessed.audience,'buyers seeking horror movie poster');
  assert.equal(assessed.recommended,true);
});
test('planner consolidates overlapping wall-art wording and rejects generic gift labels from paid research',()=>{
  const horrorRows=[
    {id:'a',listingType:'download',title:'Horror Movie Poster Halloween Wall Art Digital Download',tags:['horror movie poster','halloween wall art','horror wall art','horror fan gift']},
    {id:'b',listingType:'download',title:'Horror Movie Poster Gothic Wall Art Digital Download',tags:['horror movie poster','halloween wall art','horror wall art','horror fan gift']},
    {id:'c',listingType:'download',title:'Horror Movie Poster Printable Art',tags:['horror movie poster','horror wall art']}
  ];
  const markets=discoverProductMarkets('horror movie poster',horrorRows);
  const batch=selectResearchBatch('horror movie poster',markets,3);
  assert.deepEqual(batch.map(item=>item.phrase),['horror movie poster']);
  assert.ok(batch[0].sourceListings.every(item=>!item.title.includes('These')));
  assert.equal(markets.some(item=>item.phrase==='horror fan gift'),false);
  assert.equal(markets.some(item=>item.phrase==='halloween wall art'),false);
});
test('movie poster retains a narrower evidence-backed segment rather than forcing three queries',()=>{
  const rows=[
    {id:'1',listingType:'download',title:'Horror Movie Poster Digital Download',tags:['horror movie poster']},
    {id:'2',listingType:'download',title:'Horror Movie Poster Digital Download',tags:['horror movie poster']},
    {id:'3',listingType:'download',title:'Horror Movie Poster Digital Download',tags:['horror movie poster']}
  ];
  assert.deepEqual(selectResearchBatch('movie poster',discoverProductMarkets('movie poster',rows),3).map(item=>item.phrase),['horror movie poster']);
});
test('broad, functional, decorative, and unfamiliar fixture inputs remain open-vocabulary and abstain when evidence is thin',()=>{
  for(const seed of ['digital planner','wedding budget spreadsheet','gardening','fermentation vessel log']){
    const rows=[{id:`${seed}-1`,listingType:'download',title:`${seed} illustrated edition`,tags:[`${seed} edition`]}];
    assert.deepEqual(discoverProductMarkets(seed,rows),[]);
  }
});
test('commercial budget is explicit and bounded',()=>{
  assert.deepEqual(planCommercialResearch(['aa','bb','cc','dd'],33),{directions:['aa','bb','cc'],maxCredits:33,withinBudget:true});
  assert.equal(planCommercialResearch(['aa','bb','cc'],22).withinBudget,false);
});
test('commercial research normalizes estimates and uses one keyword plus one product page per direction',async()=>{
  const calls=[];
  const fetchImpl=async url=>{calls.push(url);if(url.endsWith('/usage'))return {ok:true,json:async()=>({plan:'free',credits:{remaining:20}})};if(url.includes('/keywords?'))return {ok:true,json:async()=>({data:[{keyword:'horror poster',volume:{etsy_monthly:22},competition:{competing_listings:3},as_of:'2026-11-01'}]})};return {ok:true,json:async()=>({data:[{id:'1',title:'Poster',sales:{est_last_month:1,est_monthly_avg:2,est_lifetime:3,est_trend_3m:null}}],total:{value:1}})};};
  const data=await runCommercialResearch(['horror poster'],{apiKey:'test',fetchImpl,maxBudget:11});
  assert.equal(data.results[0].products[0].sales.est_last_month,1);assert.equal(calls.length,3);
  assert.equal(normalizeProducts({data:[{id:'2',sales:{est_last_month:null}}]})[0].sales.est_last_month,null);
});
