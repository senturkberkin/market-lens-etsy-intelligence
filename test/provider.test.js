import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEtsyObservation} from '../dist/js/provider.js';
import etsyHandler from '../api/etsy-keyword.js';

test('normalizes verified Etsy supply without inventing demand', () => {
  const value = normalizeEtsyObservation({
    totalListings:321,
    prices:[12, 8, 10],
    sampleSize:3,
    digitalSampleSize:2,
    fetchedAt:'2026-10-26T10:00:00.000Z',
    market:'US'
  });
  assert.equal(value.listings, 321);
  assert.equal(value.price, 10);
  assert.equal(value.demand, null);
  assert.equal(value.trend, null);
  assert.equal(value.sourceLabel, 'Official Etsy Open API');
});

test('Etsy proxy preserves currency and missing price without inventing zero', async()=>{
  const priorKey=process.env.ETSY_API_KEY,priorFetch=globalThis.fetch;
  process.env.ETSY_API_KEY='test-key';
  globalThis.fetch=async()=>({ok:true,json:async()=>({count:2,results:[
    {listing_id:1,title:'Budget sheet',listing_type:'download',price:{amount:650,divisor:100,currency_code:'USD'},description:'Vendor payments',shop_id:7,num_favorers:2},
    {listing_id:2,title:'Budget sheet 2',listing_type:'download',price:null}
  ]})});
  const res={setHeader(){return this},status(code){this.statusCode=code;return this},json(body){this.body=body;return this},end(){return this}};
  try{
    await etsyHandler({method:'GET',query:{keyword:'budget sheet'},headers:{}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.sample[0].price,6.5);
    assert.equal(res.body.sample[0].currency,'USD');
    assert.equal(res.body.sample[0].description,'Vendor payments');
    assert.equal(res.body.sample[0].shopId,'7');
    assert.equal(res.body.sample[1].price,null);
    assert.equal(res.body.sample[1].currency,null);
  }finally{
    globalThis.fetch=priorFetch;
    if(priorKey===undefined)delete process.env.ETSY_API_KEY;else process.env.ETSY_API_KEY=priorKey;
  }
});

test('legacy Etsy price summary abstains on mixed currencies',()=>{
  const value=normalizeEtsyObservation({prices:[5,6],sample:[{currency:'USD'},{currency:'EUR'}]});
  assert.equal(value.price,null);
});
