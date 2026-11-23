import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessDirection} from '../dist/js/selection.js';

// Optional private replay. CI never contacts a provider or downloads a replacement.
test('recorded Alura search · compare the observed product formats',async t=>{
  let data;
  try {
    data=JSON.parse(await readFile(new URL('../.env.alura-recent-sales-verification.json',import.meta.url),'utf8'));
  } catch(error) {
    if(error.code==='ENOENT')return t.skip('Local redacted provider record unavailable');
    throw error;
  }
  const products=data.returned.map(r=>({...r,shop:{name:r.shop},sales:{est_last_month:r.est_last_month}}));
  const assess=phrase=>assessDirection({phrase},{sample:[]},{products});
  const ticket=assess('vintage movie ticket poster'), bundle=assess('horror movie png bundle');
  assert.deepEqual(ticket.commercial.populated.map(r=>r.id),['4311809927','4504888836']);
  assert.deepEqual(ticket.sales.values,[1,1]);assert.equal(ticket.commercial.independent,1);
  assert.deepEqual(bundle.commercial.populated.map(r=>r.id),['4456990427']);
  assert.deepEqual(bundle.sales.values,[5]);assert.equal(bundle.commercial.independent,1);
  for(const item of [ticket,bundle]){
    assert.equal(item.demand,null);assert.equal(item.recommended,false);
    assert.equal(item.commercial.records.some(r=>r.matched),false);
  }
});
