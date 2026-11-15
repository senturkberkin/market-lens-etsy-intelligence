import {parseResearchInput} from './research-index.js';
import {discoverProductMarkets,selectResearchBatch,assessDirection,chooseProductTarget} from './selection.js';

const form=document.querySelector('#search-form');
const input=document.querySelector('#keyword');
const result=document.querySelector('#result');
const submit=form.querySelector('button');
const base=String(globalThis.MARKET_LENS_API_BASE||'').replace(/\/$/,'');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const n=value=>value==null?'Unknown':new Intl.NumberFormat('en-US').format(value);
const link=row=>row.url?`<a href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${esc(row.title||row.id)}</a>`:esc(row.title||row.id);
let session=null;

async function etsy(inputValue){
  const parsed=parseResearchInput(inputValue);
  if(!parsed)throw new Error('Enter a keyword, Etsy listing URL, or Etsy shop URL.');
  const endpoint=parsed.type==='keyword'?'/api/etsy-keyword':'/api/etsy-source';
  const url=new URL(`${base}${endpoint}`);
  if(parsed.type==='keyword')url.searchParams.set('keyword',parsed.keyword);
  if(parsed.type==='listing')url.searchParams.set('listingId',parsed.id);
  if(parsed.type==='shop')url.searchParams.set('shop',parsed.shop);
  const response=await fetch(url,{headers:{accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Etsy returned ${response.status}.`);
  return {parsed,data};
}

function researchPlan(){
  const candidates=session.batch;
  const cost=candidates.length*11;
  const citations=row=>row.sourceListings.map(item=>item.url?`<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>`:esc(item.title)).join('; ');
  return `<section class="mvp-plan"><h2>Markets selected for commercial research</h2><p>These are coherent digital-product markets supported by repeated Etsy listings—not keyword variations or recommendations.</p><div class="direction-grid">${candidates.map((row,index)=>`<article><strong>${esc(row.phrase)}</strong><small><b>Why selected:</b> ${esc(row.reason)}</small><small><b>Supporting listings:</b> ${citations(row)}</small><small><b>How it differs:</b> ${index?'It has different product wording and/or source listings from the earlier selected market.':'The clearest seed-backed product market in this sample.'}</small></article>`).join('')}</div><div class="approval"><strong>Commercial research plan: up to ${n(cost)} included Alura credits.</strong><span>${candidates.length} exact keyword lookup${candidates.length===1?'':'s'} (1 credit each) + ${candidates.length} recent-sales product page${candidates.length===1?'':'s'} (10 credits each). No request is made until approval.</span><button class="research-button" data-approve>Approve ${n(cost)}-credit research batch</button></div><details><summary>Why approval is needed</summary><p>Alura demand is looked up for each exact product market. Each product search is filtered to digital listings with a stored recent-sales estimate. Broad keyword demand is never transferred to a narrower product.</p></details></section>`;
}

function initialView(){
  const markets=discoverProductMarkets(session.seed,session.payload.sample);
  const batch=selectResearchBatch(session.seed,markets,3);
  session={...session,markets,batch};
  if(!batch.length)return `<section class="mvp-results"><h2>No sufficiently supported product target found from this research.</h2><p>The Etsy sample contains ${n(session.payload.digitalSampleSize)} downloadable listings, but it does not contain repeated, distinct product directions that can be responsibly compared. This is an evidence limitation, not a verdict on the market.</p><details><summary>Observed marketplace evidence</summary><p>${n(session.payload.sampleSize)} listings returned from Etsy. Try a more specific keyword or inspect the supplied listing/shop source.</p></details></section>`;
  return researchPlan();
}

function productSpec(item){
  const observed=item.observedPosition.length?item.observedPosition.join('; '):'format not sufficiently described';
  return `<article class="recommendation"><h3>${esc(item.direction.phrase)}</h3><p><strong>Who:</strong> ${esc(item.audience||'No buyer group established')}</p><p><strong>What:</strong> Create a digital ${esc(item.direction.phrase)} with a deliberate, documented presentation rather than a generic version.</p><p><strong>Contents / creative cues observed in comparable listings:</strong> ${esc(observed)}</p><p><strong>How to compete:</strong> Choose one coherent configuration from the observed cues and validate it with buyers. This is a proposed position, not a claim that competitors lack a feature.</p></article>`;
}

function evidenceList(item){
  const direct=item.commercial.comparable;
  return `<details><summary>Evidence for ${esc(item.direction.phrase)}</summary><p><strong>Demand:</strong> ${item.demand===null?'Unknown — no exact Alura measurement returned.':`${n(item.demand)} estimated Etsy searches/month for this exact direction.`}</p><p><strong>Comparable Etsy sample:</strong> ${item.etsy.direct.length} direct · ${item.etsy.adjacent.length} adjacent. Listing sample membership is not stable ranking.</p><p><strong>Recent-sales estimates:</strong> ${item.commercial.populated.length}/${direct.length} comparable records populated; ${item.commercial.independent} independent sellers with a positive estimate. Missing estimates remain unknown.</p>${direct.length?`<ul class="competitors">${direct.map(row=>`<li>${link(row)}<span>Last completed month: ${n(row.sales.est_last_month)} estimated sales · lifetime average: ${n(row.sales.est_monthly_avg)} · lifetime: ${n(row.sales.est_lifetime)} · 3-month trend: ${row.sales.est_trend_3m==null?'Unknown':row.sales.est_trend_3m} · as of ${esc(row.as_of||'Unknown')}</span></li>`).join('')}</ul>`:'<p>No returned Alura product was directly comparable after classification.</p>'}<p class="muted">Alura values are estimates, not observed Etsy transactions. Etsy identity/current availability is separately checked where available.</p></details>`;
}

function finalView(assessments){
  const decision=chooseProductTarget(assessments);
  const winner=decision.winner;
  const main=winner?`<section class="mvp-results"><p class="eyebrow">BEST-SUPPORTED PRODUCT DIRECTION</p>${productSpec(winner)}<p class="notice"><strong>Why this over alternatives:</strong> it meets the same fixed evidence requirements as every candidate and has the strongest independent comparable activity. This supports controlled validation, not a forecast of sales.</p></section>`:`<section class="mvp-results"><h2>No sufficiently supported product target found from this research.</h2><p>The market evidence below is still useful, but no direction simultaneously established exact-direction demand, multi-seller recent activity, and explicit buyer positioning.</p></section>`;
  const alternatives=assessments.map(item=>`<article class="alternative"><h3>${esc(item.direction.phrase)}</h3><p>${esc(item.conclusion)}</p><ul>${item.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>${evidenceList(item)}</article>`).join('');
  return `${main}<section class="mvp-results"><h2>Alternatives considered</h2>${alternatives}</section>`;
}

async function begin(value){
  submit.disabled=true;result.innerHTML='<p class="empty">Finding distinct digital-product markets from Etsy evidence…</p>';
  try{
    const found=await etsy(value);
    session={seed:found.parsed.type==='keyword'?found.parsed.keyword:found.data.keyword,payload:found.data,parsed:found.parsed};
    result.innerHTML=initialView();
    history.replaceState(null,'',`?q=${encodeURIComponent(value)}`);
  }catch(error){result.innerHTML=`<p class="error">${esc(error.message||'Research is unavailable.')}</p>`;}
  finally{submit.disabled=false;}
}

async function runApprovedResearch(button){
  if(!session?.batch?.length)return;
  const maxBudget=session.batch.length*11;
  button.disabled=true;result.insertAdjacentHTML('beforeend','<p class="empty" id="batch-progress">Gathering targeted Etsy competitors and approved commercial evidence…</p>');
  try{
    const targetEtsy=await Promise.all(session.batch.map(async market=>({phrase:market.phrase,data:(await etsy(market.phrase)).data})));
    const response=await fetch(`${base}/api/commercial-research`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({approved:true,directions:session.batch.map(row=>row.phrase),maxBudget})});
    const commercial=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(commercial.error||`Alura returned ${response.status}.`);
    const lookup=new Map(commercial.results.map(row=>[row.direction,row]));
    const assessments=session.batch.map(market=>assessDirection(market,targetEtsy.find(row=>row.phrase===market.phrase)?.data,lookup.get(market.phrase)));
    session={...session,targetEtsy,commercial,assessments};
    result.innerHTML=finalView(assessments);
  }catch(error){result.innerHTML=`<p class="error">${esc(error.message||'Commercial research is unavailable.')}</p><p class="notice">The Etsy discovery evidence was preserved, but no commercial conclusion was made.</p>${researchPlan()}`;}
}

form.addEventListener('submit',event=>{event.preventDefault();begin(input.value.trim());});
result.addEventListener('click',event=>{const approve=event.target.closest('[data-approve]');if(approve)runApprovedResearch(approve);});
const initial=new URLSearchParams(location.search).get('q');if(initial)input.value=initial;
