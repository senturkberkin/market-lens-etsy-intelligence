import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{fetchFreeMetrics,normalizeKeywordMetrics} from '../api/keyword-metrics.js';
import {readFile} from 'node:fs/promises';

const lookup={data:[{id:'88123',keyword:'dog collar',volume:{etsy_monthly:1200},competition:{competing_listings:4000},as_of:'2026-11-01T00:00:00Z'}],pending:[]};
const related={data:[{keyword:'custom dog collar',volume:{etsy_monthly:370},competition:{competing_listings:800}}]};
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});

test('keyword metrics preserve estimates and competition without inventing values',()=>{
  const result=normalizeKeywordMetrics('dog collar',lookup,related,'2026-11-08T12:00:00Z');
  assert.equal(result.exact.estimatedSearchesMonthly,1200);
  assert.equal(result.exact.competingListings,4000);
  assert.equal(result.exact.asOf,'2026-11-01T00:00:00Z');
  assert.equal(result.related[0].keyword,'custom dog collar');
  assert.match(result.searchPeriod,/12 complete/);
  assert.equal(result.validatedAgainstEtsy,false);
});

test('null values remain unknown, duplicate terms are removed, pending is distinct',()=>{
  const result=normalizeKeywordMetrics('wedding',{data:[{keyword:'wedding planner',volume:{etsy_monthly:null},competition:{competing_listings:0}}],pending:['wedding']},{data:[{keyword:'WEDDING PLANNER',volume:{etsy_monthly:900},competition:{competing_listings:30}}]});
  assert.equal(result.exact,null);
  assert.equal(result.status,'pending');
  assert.equal(result.related.length,1);
  assert.equal(result.related[0].estimatedSearchesMonthly,null);
  assert.equal(result.related[0].competingListings,0);
  assert.throws(()=>normalizeKeywordMetrics('wedding',{}),/no keyword results/);
});

test('only the Free plan with included credits makes keyword requests',async()=>{
  for (const usage of [{plan:'basic',credits:{remaining:100}},{plan:'free',credits:{remaining:1}},{plan:'free',credits:{remaining:null}}]) {
    const calls=[];
    await assert.rejects(fetchFreeMetrics('dog collar',{apiKey:'private',fetchImpl:async url=>{calls.push(String(url));return response(usage)}}),/disabled/);
    assert.deepEqual(calls,['https://api.alura.io/v1/usage']);
  }
});

test('documented Free-plan flow retrieves exact and related measurements',async()=>{
  const calls=[];
  const payloads=[{plan:'free',credits:{remaining:100}},lookup,related];
  const result=await fetchFreeMetrics('dog collar',{apiKey:'private',fetchImpl:async (url,options)=>{
    calls.push({url:String(url),auth:options.headers.Authorization});
    return response(payloads.shift());
  }});
  assert.equal(calls[0].url,'https://api.alura.io/v1/usage');
  assert.match(calls[1].url,/\/v1\/research\/keywords\?q=dog\+collar&language=en$/);
  assert.match(calls[2].url,/\/v1\/research\/keywords\/88123\/related$/);
  assert.ok(calls.every(call=>call.auth==='Bearer private'));
  assert.equal(result.exact.estimatedSearchesMonthly,1200);
  assert.equal(result.related[0].competingListings,800);
  assert.ok(!JSON.stringify(result).includes('private'));
});

test('pending keywords do not call the related endpoint',async()=>{
  const calls=[];
  const payloads=[{plan:'free',credits:{remaining:100}},{data:[],pending:['dog collar']}];
  const result=await fetchFreeMetrics('dog collar',{apiKey:'private',fetchImpl:async url=>{calls.push(String(url));return response(payloads.shift())}});
  assert.equal(calls.length,2);
  assert.equal(result.status,'pending');
  assert.equal(result.exact,null);
});

test('protected Preview endpoint reports missing provider configuration',async()=>{
  const previousId=process.env.ALURA_API_KEY, previousEnv=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='preview';
  delete process.env.ALURA_API_KEY;
  const headers={};
  const res={setHeader(name,value){headers[name]=value;return this},status(code){this.statusCode=code;return this},json(value){this.body=value;return this},end(){return this}};
  try{
    await handler({method:'GET',query:{keyword:'dog collar'},headers:{host:'market-lens-etsy-intelligence-abc.vercel.app'}},res);
    assert.equal(res.statusCode,503);
    assert.match(res.body.error,/not configured/);
  }finally{
    if(previousId===undefined)delete process.env.ALURA_API_KEY;else process.env.ALURA_API_KEY=previousId;
    if(previousEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previousEnv;
  }
});

test('keyword endpoint fails closed outside protected Preview',async()=>{
  const previous=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='production';
  const res={headers:{},setHeader(name,value){this.headers[name]=value;return this},status(code){this.statusCode=code;return this},json(value){this.body=value;return this},end(){return this}};
  try{
    await handler({method:'GET',query:{keyword:'dog collar'},headers:{host:'market-lens-etsy-intelligence.vercel.app'}},res);
    assert.equal(res.statusCode,503);
    assert.match(res.body.error,/unavailable on this deployment/);
  }finally{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous}
});

test('primary page opens the metric workflow; prior research remains available',async()=>{
  const index=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const legacy=await readFile(new URL('../dist/legacy.html',import.meta.url),'utf8');
  assert.match(index,/js\/metrics\.js/);
  assert.match(index,/Research a keyword/);
  assert.match(index,/Vercel account/);
  assert.doesNotMatch(index,/id="access-key"/);
  assert.match(legacy,/js\/app\.js/);
});

test('Vercel previews call their own API rather than production',async()=>{
  const config=await readFile(new URL('../dist/config.js',import.meta.url),'utf8');
  assert.match(config,/location\.hostname\.endsWith\('\.vercel\.app'\)/);
  assert.match(config,/location\.origin/);
});
