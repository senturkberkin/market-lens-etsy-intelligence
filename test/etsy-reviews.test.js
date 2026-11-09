import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchDatedEtsyReviews} from '../api/etsy-reviews.js';

test('dated Etsy review check uses listing IDs and the 90-day server filter',async()=>{
  const calls=[];
  const now=new Date('2026-11-09T12:00:00Z');
  const result=await fetchDatedEtsyReviews(['123','456'],{apiKey:'test-key',now,fetchImpl:async(url,options)=>{
    calls.push({url:String(url),key:options.headers['x-api-key']});
    return {ok:true,json:async()=>({count:1,results:[{created_timestamp:Math.floor(now.getTime()/1000)-86400}]})};
  }});
  assert.equal(calls.length,2);
  assert.match(calls[0].url,/\/listings\/123\/reviews\?limit=100&min_created=/);
  assert.equal(calls[0].key,'test-key');
  assert.equal(result.evidence[0].reviewCount90d,1);
  assert.equal(result.evidence[0].status,'observed');
  assert.equal(result.evidence[1].id,'456');
});

test('a failed Etsy review call remains unavailable, never zero sales',async()=>{
  const result=await fetchDatedEtsyReviews(['123'],{apiKey:'test-key',fetchImpl:async()=>({ok:false,status:403})});
  assert.equal(result.evidence[0].reviewCount90d,null);
  assert.equal(result.evidence[0].status,'unavailable');
});

test('provider count without verifiable dates is not treated as dated purchase evidence',async()=>{
  const result=await fetchDatedEtsyReviews(['123'],{apiKey:'test-key',fetchImpl:async()=>({ok:true,json:async()=>({count:5,results:[{}]})})});
  assert.equal(result.evidence[0].reviewCount90d,null);
  assert.equal(result.evidence[0].status,'unknown');
});
