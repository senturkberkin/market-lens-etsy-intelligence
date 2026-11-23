import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDirection,chooseProductTarget,classifyComparable,distribution} from '../dist/js/selection.js';
import {runCommercialResearch} from '../api/commercial-research.js';

const row=(id,title,extra={})=>({id:String(id),shopId:String(id),title,listingType:'download',tags:[],url:'https://www.etsy.com/listing/'+id,...extra});
const iso='2026-11-12T00:00:00Z';
const probe=(title,price,currency)=>row(title,title,{price,currency,shopId:null});

test('Q1 · comparable identity, missing shops, period consistency and per-currency quantiles',()=>{
  const phrase='orchard graft register';
  const sample=[probe('Editable orchard graft register',5,'USD'),probe('Field orchard graft register',12,'USD'),probe('Pocket orchard graft register',90,'TRY')];
  assert.equal(classifyComparable(phrase,row(20,'Orchard graft register cover',{tags:[phrase]})),'adjacent');
  const products=sample.map((r,i)=>({...r,shop:null,as_of:iso,sales:{est_last_month:[null,0,8][i]}}));
  const a=assessDirection({phrase},{sample,fetchedAt:iso},{keyword:{keyword:'orchard',estimatedSearchesMonthly:2000},products});
  assert.deepEqual(a.sales.values,[0,8]);
  assert.equal(a.prices.USD.median,8.5);assert.equal(a.sales.q3,6);
  assert.equal(a.commercial.independent,0);assert.equal(a.demand,null);
  assert.equal(distribution([]).median,null);
  const dated=products.map((r,i)=>({...r,shop:{id:i+1},sales:{est_last_month:1},as_of:i===1?'2026-10-31':iso}));
  const mixed=assessDirection({phrase},{sample,fetchedAt:iso},{keyword:{keyword:phrase,estimatedSearchesMonthly:7},products:dated});
  assert.equal(chooseProductTarget([mixed]).status,'preliminary');
});

test('Q2 · adapt the approved requests to demand and retain the first results on interruption',async()=>{
  const paths=[];
  const fetchImpl=async input=>{
    const url=new URL(input);paths.push([url.pathname,url.searchParams.get('q')]);
    if(url.pathname.endsWith('/usage'))return {ok:true,json:async()=>({plan:'free',credits:{remaining:33}})};
    if(url.pathname.endsWith('/products'))throw new Error('provider unavailable');
    const q=url.searchParams.get('q');
    return {ok:true,json:async()=>({data:[{keyword:q,volume:{etsy_monthly:q==='second option'?35:0}}]})};
  };
  const result=await runCommercialResearch(['first option','second option'],{apiKey:'fixture',fetchImpl,maxBudget:22});
  assert.equal(result.interrupted,true);assert.equal(result.results.length,2);
  assert.deepEqual(paths.filter(([p])=>p.endsWith('/products')),[['/v1/research/products','second option']]);
});

// UI integration harness. Every network request is intercepted in this process.
test('holdout · enter a seed, inspect rendered priorities, approve simulated research once',async()=>{
  const handlers={},input={},button={},form={querySelector:()=>button,addEventListener:(event,fn)=>handlers[event]=fn};
  let body='',ready;
  const result={addEventListener:(event,fn)=>handlers[event]=fn,set innerHTML(v){body=v;if(v.includes('</table>')||v.includes('Blocked research'))ready?.();}};
  globalThis.document={querySelector:s=>({'#keyword':input,'#result':result,'#search-form':form})[s]};
  globalThis.location={origin:'https://fixture.invalid',search:''};globalThis.history={replaceState(){}};
  const savedFetch=globalThis.fetch;
  const cases=[
    ['cyanotype',[row(1,'Cyanotype exposure register | editable PDF'),row(2,'Studio cyanotype exposure register'),row(3,'Cyanotype botanical silhouettes | SVG'),row(4,'Layered cyanotype botanical silhouettes')],'Multiple plausible directions','exposure register'],
    ['organ voicing',[row(5,'Organ voicing worksheet | editable XLSX'),row(6,'Pipe organ voicing worksheet')],'Preliminary product direction','worksheet'],
    ['tidal harmonics',[row(7,'Tidal harmonics reference wheel | layered PDF')],'Preliminary product direction','reference wheel'],
    ['kelp pressing',[],'Blocked research','retrieved listings']
  ];
  try{
    await import('../dist/js/mvp.js');
    for(const [seed,sample,status,product] of cases){
      let reads=0,writes=0;
      globalThis.fetch=async(url,opts)=>{
        if(opts?.method==='POST'){
          writes++;const request=JSON.parse(opts.body);
          assert.equal(request.maxBudget,request.directions.length*11);assert.equal(request.approved,true);
          if(seed==='cyanotype'){
            assert.equal(request.directions.length,2);
            return {ok:true,json:async()=>({results:request.directions.map((direction,index)=>({
              direction,keyword:{keyword:direction,estimatedSearchesMonthly:index?240:30,asOf:iso},
              products:sample.filter(r=>r.title.toLowerCase().includes(direction)).map(r=>({...r,shop:{id:r.shopId},as_of:iso,sales:{est_last_month:index?8:1}}))
            }))})};
          }
          const direction=request.directions[0];
          return {ok:true,json:async()=>({results:[{direction,keyword:{keyword:direction,estimatedSearchesMonthly:37},products:sample.map((r,i)=>({...r,shop:{id:r.shopId},as_of:iso,sales:{est_last_month:2+i}}))}]})};
        }
        reads++;return {ok:true,json:async()=>({keyword:url.searchParams.get('keyword'),sample,fetchedAt:iso})};
      };
      input.value=seed;await new Promise(resolve=>{ready=resolve;handlers.submit({preventDefault(){}})});
      assert.match(body,new RegExp(status));assert.match(body,new RegExp(product,'i'));assert.equal(writes,0);
      if(!sample.length)assert.equal(reads,2);
      if(seed==='cyanotype'){
        const first=body.match(/Provisional research priority · ([^<]+)</)[1];
        await new Promise(resolve=>{ready=resolve;handlers.click({target:{closest:()=>({disabled:false})}})});
        assert.match(body,/Supported product target/);assert.match(body,/240/);
        assert.notEqual(body.match(/Product to prototype · ([^<]+)</)[1],first);
        assert.equal(writes,1);
      }
      if(seed==='organ voicing'){
        const approve={disabled:false};await new Promise(resolve=>{ready=resolve;handlers.click({target:{closest:()=>approve}})});
        assert.match(body,/Supported product target/);assert.match(body,/2\.5 \/ 2\.75/);assert.equal(writes,1);
      }
    }
  }finally{globalThis.fetch=savedFetch;delete globalThis.document;delete globalThis.location;delete globalThis.history;}
});
