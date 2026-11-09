import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import handler,{fetchBuyerPull,normalizeBuyerPull} from '../api/buyer-pull.js';

const ok=body=>({ok:true,status:200,json:async()=>body});
const products={data:[
  {id:'123',title:'Custom dog collar with name',tags:['pet gift'],sales:{est_last_month:18},as_of:'2026-11-01'},
  {id:'456',title:'Cat harness',tags:['dog collar handmade'],sales:{est_last_month:null}},
  {id:'789',title:'Collar for dog',tags:['pet accessory'],sales:{est_last_month:99}},
  {id:'999',title:'Dog collar leather',tags:[],sales:{est_last_month:4}}
]};

test('reviewed relevant listings prove some purchases, not actual sales totals',async()=>{
  const calls=[];
  const responses=[{plan:'free',credits:{remaining:20}},products,
    {data:[{created_at:'2026-10-25T00:00:00Z'}],summary:{status:'ready',collected:true,count:5}},
    {data:[],summary:{status:'ready',collected:false,count:0}},
    {data:[],summary:{status:'pending',collected:true,count:null}}];
  const result=await fetchBuyerPull('dog collar',{apiKey:'secret',now:new Date('2026-11-09T00:00:00Z'),fetchImpl:async url=>{calls.push(String(url));return ok(responses.shift())}});
  assert.equal(calls.length,5);
  assert.match(calls[1],/\/research\/products\?q=dog\+collar/);
  assert.ok(calls.slice(2).every(url=>url.includes('from=2026-08-11&limit=1')));
  assert.equal(result.sampleSize,3);
  assert.equal(result.listingsWithRecentReviews,1);
  assert.deepEqual(result.evidence.map(row=>row.listingId),['123','456','789']);
  assert.equal(result.evidence[0].url,'https://www.etsy.com/listing/123');
  assert.equal(result.evidence[0].reviewCount90d,5);
  assert.equal(result.evidence[0].estimatedSalesLastMonth,18);
  assert.equal(result.evidence[1].reviewCount90d,null);
  assert.equal(result.evidence[1].estimatedSalesLastMonth,null);
  assert.equal(result.evidence[2].reviewCount90d,null);
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('no matching listings and missing reviews do not imply no sales',()=>{
  const empty=normalizeBuyerPull('dog collar',{data:[]},[],'2026-08-11');
  assert.equal(empty.status,'no-relevant-sample');
  assert.equal(empty.listingsWithRecentReviews,0);
  const unknown=normalizeBuyerPull('dog collar',{data:[products.data[0]]},[null],'2026-08-11');
  assert.equal(unknown.evidence[0].reviewCount90d,null);
  assert.equal(unknown.listingsWithRecentReviews,0);
});

test('Free plan and 13 included credits are mandatory before paid endpoints',async()=>{
  for(const usage of [{plan:'growth',credits:{remaining:100}},{plan:'free',credits:{remaining:12}},{plan:'free',credits:{remaining:null}}]){
    const calls=[];
    await assert.rejects(fetchBuyerPull('dog collar',{apiKey:'secret',fetchImpl:async url=>{calls.push(String(url));return ok(usage)}}),/disabled/);
    assert.deepEqual(calls,['https://api.alura.io/v1/usage']);
  }
});

test('buyer activity endpoint refuses invalid token',async()=>{
  const previous=process.env.ZETY_ACCESS_TOKEN;
  process.env.ZETY_ACCESS_TOKEN='test-token-with-at-least-24-characters';
  const res={setHeader(){return this},status(code){this.statusCode=code;return this},json(value){this.body=value;return this},end(){return this}};
  try{
    await handler({method:'GET',query:{keyword:'dog collar'},headers:{'x-research-token':'wrong'}},res);
    assert.equal(res.statusCode,401);
  }finally{if(previous===undefined)delete process.env.ZETY_ACCESS_TOKEN;else process.env.ZETY_ACCESS_TOKEN=previous}
});

test('primary page provides separate buyer check and labels estimates',async()=>{
  const page=await readFile(new URL('../dist/js/metrics.js',import.meta.url),'utf8');
  assert.match(page,/data-check-pull/);
  assert.match(page,/Estimated sales last month/);
  assert.match(page,/No recent reviews were found.*does not establish zero sales/);
});
