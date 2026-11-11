import test from 'node:test';
import assert from 'node:assert/strict';
import {collectDiscoveryEvidence,digitalFollowUpQuery,discoverKeywords,groupDiscovered,listingRelevance,normalizePhrase} from '../dist/js/discovery.js';

test('broad seed surfaces observed digital directions without assigning demand',()=>{
  const rows=discoverKeywords('planner',[
    {id:1,title:'Weekly meal planner printable',tags:['meal planner printable','family meal planner']},
    {id:2,title:'Wedding budget planner spreadsheet',tags:['wedding budget planner']}
  ]);
  assert.ok(rows.some(x=>x.keyword==='meal planner printable'&&x.kind==='observed'));
  assert.ok(rows.every(x=>x.group.need==='planner'));
  assert.ok(groupDiscovered(rows).length>=2);
  assert.ok(rows.every(x=>!('searchVolume' in x)&&!('score' in x)));
});
test('narrow keyword retains exact-token baseline',()=>{
  assert.equal(listingRelevance('ceramic kiln tracker',{title:'Ceramic kiln firing tracker',tags:[]}), 'exact');
  assert.ok(discoverKeywords('ceramic kiln tracker',[{id:1,title:'Ceramic kiln firing tracker spreadsheet',tags:['ceramic kiln tracker spreadsheet']}]).length);
});
test('unfamiliar topics work without a predefined category',()=>{
  const rows=discoverKeywords('mushroom logbook',[{id:7,title:'Mushroom logbook field journal',tags:['mushroom logbook journal']}]);
  assert.ok(rows.some(x=>x.keyword==='mushroom logbook journal'));
});
test('lexical synonyms can recall observed listings but cannot invent directions',()=>{
  const rows=discoverKeywords('mom planner',[{id:1,title:'Mother organizer printable',tags:['mother organizer printable']}]);
  assert.ok(rows.some(x=>x.kind==='observed'&&x.keyword==='mother organizer printable'));
  assert.ok(rows.every(x=>x.kind==='observed'));
  assert.equal(listingRelevance('mom planner',{title:'Mother organizer printable'}),'semantic');
});
test('duplicate phrases normalize and retain distinct listing citations',()=>{
  const rows=discoverKeywords('meal planner',[
    {id:1,title:'Meal planner printable',tags:['Meal Planner Printables']},
    {id:2,title:'Meal planner printable',tags:['meal planner printable']}
  ]);
  const match=rows.find(x=>x.keyword==='meal planner printable');
  assert.equal(normalizePhrase('Meal Planner Printables!'),'meal planner printable');
  assert.equal(match.listingIds.length,2);
});
test('irrelevant results and empty evidence produce no suggestions',()=>{
  assert.deepEqual(discoverKeywords('meal planner',[{id:1,title:'Knitted scarf',tags:['winter gift']}]),[]);
  assert.deepEqual(discoverKeywords('meal planner',[]),[]);
  assert.deepEqual(discoverKeywords('',[{title:'Meal planner'}]),[]);
});
test('physical products remain observed directions, not digital demand',()=>{
  const rows=discoverKeywords('dog collar',[{id:1,title:'Custom dog collar with name',tags:['personalized dog collar'],listingType:'physical'}]);
  const phrase=rows.find(x=>x.keyword==='personalized dog collar');
  assert.equal(phrase.kind,'observed');
  assert.deepEqual(phrase.listingTypes,['physical']);
  assert.deepEqual(phrase.listingIds,['1']);
  assert.ok(rows.every(x=>!('searchVolume' in x)&&!('score' in x)));
});
test('optional digital probe keeps broad physical evidence separate',async()=>{
  const calls=[];
  const primary={sample:[{id:1,title:'Custom dog collar with name',tags:['personalized dog collar'],listingType:'physical'}]};
  const digital={sample:[{id:2,title:'Dog collar sewing pattern',tags:['dog collar pattern'],listingType:'download'}]};
  const result=await collectDiscoveryEvidence('dog collar',async query=>{calls.push(query);return query==='dog collar'?primary:digital});
  assert.deepEqual(calls,['dog collar','dog collar digital']);
  assert.strictEqual(result.primary,primary);
  assert.strictEqual(result.discovery,digital);
  assert.equal(digitalFollowUpQuery('dog collar',digital.sample),null);
  assert.equal(digitalFollowUpQuery('dog collar digital',primary.sample),null);
  assert.equal(digitalFollowUpQuery('dog collar',[]),null);
});
test('failed optional probe does not discard primary evidence',async()=>{
  const primary={sample:[{id:1,title:'Leather collar for dogs',listingType:'physical'}]};
  const result=await collectDiscoveryEvidence('collar',async query=>{if(query==='collar')return primary;throw Error('unavailable')});
  assert.strictEqual(result.discovery,primary);
  assert.equal(result.followUpFailed,true);
});
