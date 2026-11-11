import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchEtsySourceEvidence} from '../api/etsy-source.js';

const listing={listing_id:123,shop_id:77,title:'Wedding budget spreadsheet',tags:['wedding budget spreadsheet'],listing_type:'download',price:{amount:700,divisor:100,currency_code:'USD'}};
const other={listing_id:456,shop_id:77,title:'Wedding guest tracker',tags:['wedding guest tracker'],listing_type:'download'};
const response=body=>({ok:true,json:async()=>body});

test('listing URL source uses the actual listing and its shop sample',async()=>{
  const calls=[];
  const result=await fetchEtsySourceEvidence({listingId:'123'},{apiKey:'test-key',now:new Date('2026-11-09T12:00:00Z'),fetchImpl:async url=>{
    calls.push(String(url));return calls.length===1?response(listing):response({count:2,results:[other]});
  }});
  assert.match(calls[0],/\/listings\/123$/);
  assert.match(calls[1],/\/shops\/77\/listings\/active\?limit=50$/);
  assert.deepEqual(result.sample.map(x=>x.id),[123,456]);
  assert.equal(result.sourceContext.type,'listing');
  assert.equal(result.keyword,'wedding budget spreadsheet');
});

test('shop URL source requires an exact shop name match',async()=>{
  const calls=[];
  const result=await fetchEtsySourceEvidence({shop:'BudgetStudio'},{apiKey:'test-key',fetchImpl:async url=>{
    calls.push(String(url));return calls.length===1?response({results:[{shop_id:77,shop_name:'BudgetStudio'}]}):response({count:2,results:[listing,other]});
  }});
  assert.match(calls[0],/\/shops\?shop_name=BudgetStudio&limit=10$/);
  assert.equal(result.sourceContext.name,'BudgetStudio');
  assert.equal(result.digitalSampleSize,2);
  await assert.rejects(fetchEtsySourceEvidence({shop:'NoMatch'},{apiKey:'test-key',fetchImpl:async()=>response({results:[{shop_id:77,shop_name:'Other'}]})}),/No exact/);
});
