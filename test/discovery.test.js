import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverKeywords,groupDiscovered,listingRelevance,normalizePhrase} from '../dist/js/discovery.js';

test('broad seed surfaces observed digital directions without assigning demand',()=>{
  const rows=discoverKeywords('planner',[
    {id:1,title:'Weekly meal planner printable',tags:['meal planner printable','family meal planner']},
    {id:2,title:'Wedding budget planner spreadsheet',tags:['wedding budget planner']}
  ]);
  assert.ok(rows.some(x=>x.keyword==='meal planner printable'&&x.kind==='observed'));
  assert.ok(rows.some(x=>x.group.need==='wedding'||x.group.need==='meal'));
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
test('documented synonym creates an explicitly hypothetical alternative',()=>{
  const rows=discoverKeywords('mom planner',[{id:1,title:'Mother organizer printable',tags:['mother organizer printable']}]);
  assert.ok(rows.some(x=>x.kind==='observed'&&x.keyword==='mother organizer printable'));
  assert.ok(rows.some(x=>x.kind==='hypothesis'&&x.keyword.includes('mom')));
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
  assert.deepEqual(discoverKeywords('meal planner',[{id:1,title:'Meal planner printable',tags:['meal planner printable'],listingType:'physical'}]),[]);
  assert.deepEqual(discoverKeywords('meal planner',[]),[]);
  assert.deepEqual(discoverKeywords('',[{title:'Meal planner'}]),[]);
});
