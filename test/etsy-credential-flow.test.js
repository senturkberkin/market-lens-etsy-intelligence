import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import keywordHandler from '../api/etsy-keyword.js';
import sourceHandler from '../api/etsy-source.js';
import reviewsHandler from '../api/etsy-reviews.js';

const response=()=>({
  statusCode:200,headers:{},
  setHeader(name,value){this.headers[name]=value;return this},
  status(code){this.statusCode=code;return this},
  json(body){this.body=body;return this},
  end(){return this}
});
const request=query=>({method:'GET',query,headers:{host:'market-lens-etsy-intelligence-test.vercel.app'}});

test('all Etsy routes use the same server-side key without a client credential',async()=>{
  const previousKey=process.env.ETSY_API_KEY;
  const previousEnvironment=process.env.VERCEL_ENV;
  const previousFetch=globalThis.fetch;
  const calls=[];
  process.env.ETSY_API_KEY='fixture-only-secret';
  process.env.VERCEL_ENV='preview';
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),key:options.headers['x-api-key']});
    if(String(url).includes('/listings/123/reviews'))return {ok:true,json:async()=>({count:0,results:[]})};
    if(String(url).endsWith('/listings/123'))return {ok:true,json:async()=>({listing_id:123,shop_id:77,title:'Wedding budget planner',tags:['wedding planner'],listing_type:'download'})};
    if(String(url).includes('/shops/77/listings/active'))return {ok:true,json:async()=>({count:1,results:[]})};
    return {ok:true,json:async()=>({count:1,results:[]})};
  };
  try{
    const keyword=response(),source=response(),reviews=response();
    await keywordHandler(request({keyword:'wedding planner'}),keyword);
    await sourceHandler(request({listingId:'123'}),source);
    await reviewsHandler(request({ids:'123'}),reviews);
    assert.deepEqual([keyword.statusCode,source.statusCode,reviews.statusCode],[200,200,200]);
    assert.equal(calls.length,4);
    assert.ok(calls.every(call=>call.key==='fixture-only-secret'));
    for(const result of [keyword,source,reviews])assert.doesNotMatch(JSON.stringify(result.body),/fixture-only-secret/);
    const page=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
    assert.doesNotMatch(page,/name=["'](?:ETSY_API_KEY|api.?key|credential)["']/i);
  }finally{
    globalThis.fetch=previousFetch;
    if(previousKey===undefined)delete process.env.ETSY_API_KEY;else process.env.ETSY_API_KEY=previousKey;
    if(previousEnvironment===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previousEnvironment;
  }
});

test('missing Etsy configuration names only the variable and deployment environment',async()=>{
  const previousKey=process.env.ETSY_API_KEY;
  const previousEnvironment=process.env.VERCEL_ENV;
  delete process.env.ETSY_API_KEY;
  process.env.VERCEL_ENV='preview';
  try{
    for(const [handler,query] of [
      [keywordHandler,{keyword:'wedding planner'}],
      [sourceHandler,{listingId:'123'}],
      [reviewsHandler,{ids:'123'}]
    ]){
      const res=response();
      await handler(request(query),res);
      assert.equal(res.statusCode,503);
      assert.deepEqual(res.body,{error:'ETSY_API_KEY is not configured for the Preview deployment environment.'});
    }
  }finally{
    if(previousKey===undefined)delete process.env.ETSY_API_KEY;else process.env.ETSY_API_KEY=previousKey;
    if(previousEnvironment===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previousEnvironment;
  }
});

test('Etsy upstream errors cannot echo credential values',async()=>{
  const previousKey=process.env.ETSY_API_KEY;
  const previousEnvironment=process.env.VERCEL_ENV;
  const previousFetch=globalThis.fetch;
  process.env.ETSY_API_KEY='fixture-only-secret';
  process.env.VERCEL_ENV='preview';
  globalThis.fetch=async()=>({ok:false,status:401,json:async()=>({error:'fixture-only-secret was rejected'})});
  try{
    const res=response();
    await keywordHandler(request({keyword:'wedding planner'}),res);
    assert.equal(res.statusCode,502);
    assert.doesNotMatch(JSON.stringify(res.body),/fixture-only-secret/);
    globalThis.fetch=async()=>{throw new Error('fixture-only-secret appeared in an upstream failure')};
    const source=response();
    await sourceHandler(request({listingId:'123'}),source);
    assert.equal(source.statusCode,502);
    assert.doesNotMatch(JSON.stringify(source.body),/fixture-only-secret/);
  }finally{
    globalThis.fetch=previousFetch;
    if(previousKey===undefined)delete process.env.ETSY_API_KEY;else process.env.ETSY_API_KEY=previousKey;
    if(previousEnvironment===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previousEnvironment;
  }
});
