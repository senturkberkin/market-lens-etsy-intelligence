import {parseResearchInput} from './research-index.js';
import {discoverProductMarkets,selectResearchBatch,assessDirection,chooseProductTarget} from './selection.js';
import {renderDecision,escapeHtml as esc} from './selection-view.js';

const form=document.querySelector('#search-form'), input=document.querySelector('#keyword'), result=document.querySelector('#result');
const base=globalThis.MARKET_LENS_API_BASE || location.origin;
let session;

async function search(value){
  const p=parseResearchInput(value);
  if(!p)throw new Error('Enter a keyword or Etsy URL.');
  const url=new URL(p.type==='keyword'?'/api/etsy-keyword':'/api/etsy-source',base);
  if(p.type==='keyword')url.searchParams.set('keyword',p.keyword);
  else if(p.type==='listing')url.searchParams.set('listingId',p.id);
  else url.searchParams.set('shop',p.shop);
  const response=await fetch(url);
  const data=await response.json().catch(()=>({}));
  if(!response.ok || !Array.isArray(data.sample))throw new Error(data.error || 'Etsy search failed.');
  return data;
}

function plan(markets){
  if(!markets.length)return '';
  return `<section class="approval"><strong>Validate ${markets.length===1?'this market':'these markets'} · up to ${11*markets.length} included credits</strong>
  ${markets.map(m=>`<p><b>${esc(m.phrase)}</b> · exact search interest (1 credit), then up to 10 sales-ranked digital competitors (10 credits).</p>`).join('')}
  <small>Keyword estimates determine which sales pages to request. Positive-demand markets go first. If none have measured interest, only the first market gets a sales check.</small>
  <button class="research-button" data-approve>Approve up to ${11*markets.length} credits</button></section>`;
}

function show(commercial){
  const byPhrase=new Map((commercial?.results || []).map(r=>[r.direction,r]));
  const assessments=session.markets.map(m=>{
    const focused=session.focused?.get(m.phrase);
    if(!focused)return assessDirection(m,session.data,byPhrase.get(m.phrase));
    const listingIds=[...new Set([...m.listingIds,...focused.sample.map(r=>String(r.id))])];
    return assessDirection({...m,listingIds},focused,byPhrase.get(m.phrase));
  });
  result.innerHTML=renderDecision(chooseProductTarget(assessments),assessments)+
    `<p class="source">Etsy searches · ${session.sources.map(esc).join(' · ')}</p>`+
    (commercial?.interrupted?'<p class="notice">Alura interrupted the batch. Completed observations are included.</p>':'')+
    (!commercial?(plan(session.paid)|| (assessments.length?'<p class="notice">Exploratory lead only. A commercial comparison needs identifiable examples from a second shop.</p>':'')):'');
}

async function begin(value){
  const button=form.querySelector('button');button.disabled=true; session=null;
  result.innerHTML='<p>Searching Etsy for comparable downloads…</p>';
  try{
    const data=await search(value), seed=data.keyword;
    const sources=[`${seed} (${data.sample.length} listings, ${data.fetchedAt})`];
    let rows=[...data.sample];
    const shopScope=data.sourceContext?.type==='shop';
    let markets=selectResearchBatch(seed,discoverProductMarkets(seed,rows,2,shopScope));
    if(parseResearchInput(value)?.type==='keyword' && (markets.length<2) && seed.length<=64){
      const probe=/\bdigital\b/i.test(seed)?`${seed} download`:`${seed} digital download`;
      try{
        const expanded=await search(probe);
        sources.push(`${probe} (${expanded.sample.length} listings, ${expanded.fetchedAt})`);
        rows=rows.concat(expanded.sample);
        markets=selectResearchBatch(seed,discoverProductMarkets(seed,rows));
      }catch{sources.push(`${probe} unavailable`);}
    }
    // When a requested format yields no market, inspect downloads for the
    // same subject. Keep the broader query and its products visible as such.
    const subject=seed.replace(/\b(?:digital|download|printable|template|editable|pdf)\b/gi,' ').replace(/\s+/g,' ').trim();
    if(!markets.length && parseResearchInput(value)?.type==='keyword' && subject.length>=2 && subject!==seed && subject.length<=64){
      const query=subject+' digital download';
      if(!sources.some(s=>s.startsWith(query+' ('))){
        try{
          const other=await search(query);
          sources.push(`${query} · related formats (${other.sample.length} listings, ${other.fetchedAt})`);
          rows=rows.concat(other.sample);
          markets=selectResearchBatch(seed,discoverProductMarkets(seed,rows));
        }catch{sources.push(`${query} unavailable`);}
      }
    }
    const paid=markets.filter(m=>!m.componentOnly && new Set(m.listings.map(row=>row.shopId).filter(Boolean)).size>=2);
    if(paid.length)markets=paid;
    else{
      const leads=markets.length?markets:selectResearchBatch(seed,discoverProductMarkets(seed,rows,1,shopScope));
      markets=leads.slice(0,1);
    }
    session={data:{...data,sample:rows},markets,paid,sources};
    show();
    history.replaceState(null,'',`?q=${encodeURIComponent(value)}`);
  }catch(error){result.innerHTML=`<h2>Blocked research</h2><p>${esc(error.message)}</p>`;}
  finally{button.disabled=false;}
}

async function approve(button){
  if(!session?.paid.length || button.disabled)return;
  button.disabled=true;
  form.querySelector('button').disabled=true;
  const directions=session.paid.map(row=>row.phrase);
  try{
    session.focused=new Map();
    for(const phrase of directions){
      if(phrase===session.data.keyword)continue;
      try{
        const data=await search(phrase);
        session.focused.set(phrase,data);
        session.sources.push(`${phrase} (${data.sample.length} listings, ${data.fetchedAt})`);
      }catch{session.sources.push(`${phrase} focused sample unavailable`);}
    }
    const response=await fetch(new URL('/api/commercial-research',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true,directions,maxBudget:directions.length*11})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error || 'Commercial research failed.');
    show(data);
  }catch(error){button.closest('.approval').innerHTML=`<p>${esc(error.message)}. Etsy findings remain available.</p>`;}
  finally{form.querySelector('button').disabled=false;}
}
form.addEventListener('submit',e=>{e.preventDefault();if(!form.querySelector('button').disabled)begin(input.value.trim());});
result.addEventListener('click',e=>{const button=e.target.closest('[data-approve]');if(button)approve(button);});
input.value=new URLSearchParams(location.search).get('q')||'';
