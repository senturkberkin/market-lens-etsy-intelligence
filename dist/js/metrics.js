import {buildResearchReport} from './research.js';
import {collectDiscoveryEvidence,groupDiscovered,listingRelevance} from './discovery.js';
import {INDEX_STORAGE_KEY,parseResearchInput,directionsFromEvidence,indexObservation,upsertResearchIndex,cachedObservation,relatedIndexedKeywords,pruneSavedBriefs} from './research-index.js';

const form=document.querySelector('#search-form');
const input=document.querySelector('#keyword');
const result=document.querySelector('#result');
const submit=form.querySelector('button');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>new Intl.NumberFormat('en-US').format(value);
let lastAlura=null;
let lastEtsy=null;
let activeRequest=0;
let currentReport=null;
let currentExploration=null;
let observationIndex;
try{observationIndex=JSON.parse(localStorage.getItem(INDEX_STORAGE_KEY)||'[]')}catch{observationIndex=[]}
if(!Array.isArray(observationIndex))observationIndex=[];
observationIndex=observationIndex.filter(item=>Number.isFinite(Date.parse(item?.fetchedAt))&&
  Date.now()-Date.parse(item.fetchedAt)<6*60*60*1000&&Date.parse(item.fetchedAt)<=Date.now()).slice(0,12);
try{localStorage.setItem(INDEX_STORAGE_KEY,JSON.stringify(observationIndex))}catch{/* Browser storage may be disabled. */}
const storageKey='market-lens-research-v1';
const savedElement=document.querySelector('#saved-research');
const savedBriefs=()=>{
  try{
    const raw=JSON.parse(localStorage.getItem(storageKey)||'[]');
    const saved=pruneSavedBriefs(raw);
    localStorage.setItem(storageKey,JSON.stringify(saved));
    return saved;
  }catch{return []}
};
function renderSaved(){
  const saved=savedBriefs();
  savedElement.innerHTML=saved.length?`<p class="muted">Stored only in this browser. Select two to compare; opening a saved brief does not refresh its data.</p><div class="saved-list">${saved.map((item,index)=>`<label><input type="checkbox" value="${index}" data-compare><strong>${escapeHtml(item.concept.name)}</strong><small>${escapeHtml(item.keyword)} · saved ${escapeHtml(item.savedAt.slice(0,10))}</small><button class="research-button" data-open-saved="${index}">Open</button><button class="research-button" data-export-saved="${index}">Export JSON</button></label>`).join('')}</div><button class="research-button" id="compare-saved">Compare selected</button><div id="comparison"></div>`:'<p class="muted">No briefs saved on this device.</p>';
}
renderSaved();

const amount=(value,currency)=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(value);
const link=item=>item.url?`<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title||`Etsy listing ${item.id}`)}</a>`:escapeHtml(item.title||`Etsy listing ${item.id}`);

export function researchView(report){
  const supply=report.supply;
  const demand=report.demand;
  const prices=supply.priceRanges.length?supply.priceRanges.map(row=>`${amount(row.min,row.currency)}–${amount(row.max,row.currency)} (${row.count} listings)`).join('; '):'Unavailable in a consistent currency';
  const concepts=report.concepts.length?report.concepts.map(concept=>`<article class="concept"><h3>${escapeHtml(concept.name)}</h3><p><strong>For:</strong> ${escapeHtml(concept.audience)} · <strong>Format:</strong> ${escapeHtml(concept.format)}</p><p><strong>Problem:</strong> ${escapeHtml(concept.problem)}</p><p><strong>Core function:</strong> ${escapeHtml(concept.coreFunctionality)}</p><p><strong>Observed:</strong> ${escapeHtml(concept.gapAssessment.observed)}</p><p><strong>Possible difference to test:</strong> ${escapeHtml(concept.potentialDifferentiation)}</p><p class="muted">Supporting sampled listings: ${concept.gapAssessment.supportingListings.map(link).join('; ')||'none'}. This is a hypothesis, not a proven gap.</p><button class="research-button" data-save-concept="${escapeHtml(concept.id)}">Save brief</button></article>`).join(''):'<p class="notice">This Etsy sample does not support a specific digital-product concept yet. Refine the phrase or inspect a different direction.</p>';
  const terms=(report.advertisedTerms||[]).length?`<p class="muted"><strong>Advertised terms in competitor tags:</strong> ${report.advertisedTerms.map(term=>`${escapeHtml(term.phrase)} (${number(term.listingIds.length)} listings: ${term.listingIds.map(id=>{const listing=report.competitors.find(item=>String(item.id)===id);return listing?link(listing):escapeHtml(id)}).join(', ')})`).join('; ')}. These describe listing text; inspect the products before treating them as functional features.</p>`:'';
  return `<section class="research-report"><h2>Combined market evidence for “${escapeHtml(report.keyword)}”</h2><p class="source">Etsy source: ${escapeHtml(supply.source)} · sampled ${escapeHtml(supply.fetchedAt||"date unknown")} · Alura source: ${demand.source?escapeHtml(demand.source):"no exact measurement"}${demand.asOf?` · provider as of ${escapeHtml(demand.asOf)}`:""}. Historical trend is unavailable in this report.</p><div class="summary"><div class="metric"><span>Demand · Alura estimate</span><strong>${demand.measurement==null?'Unknown':number(demand.measurement)}</strong><small>${demand.measurement==null?'No exact keyword measurement in this report.':`Estimated searches per month · ${escapeHtml(demand.period||'provider period unspecified')}`}</small></div><div class="metric"><span>Relevant digital supply · Etsy sample</span><strong>${number(supply.digitalCompetitorCount)} / ${number(supply.sampleSize)}</strong><small>Relevant downloadable listings within the returned sample. ${supply.broadMatches==null?'Broad count unavailable.':`${number(supply.broadMatches)} broad Etsy matches are not direct competitors.`}</small></div></div><p class="source">Alura competition estimate: ${demand.competingListings==null?'unknown':number(demand.competingListings)} · Etsy broad match count: ${supply.broadMatches==null?'unknown':number(supply.broadMatches)}. These are different methods and cannot be subtracted or treated as an exact competitor count. ${escapeHtml(supply.marketCaveat)}</p><h3>Competitor evidence</h3><p class="muted">Observed prices by currency: ${escapeHtml(prices)}. Prices are asking prices, not sale prices. Favorites indicate engagement only.</p>${report.competitors.length?`<ul class="competitors">${report.competitors.map(item=>`<li>${link(item)}<span>${item.price!=null&&item.currency?amount(item.price,item.currency):'Price unknown'} · ${item.favorites==null?'Favorites unknown':`${number(item.favorites)} favorites`} · ${escapeHtml((item.tags||[]).slice(0,4).join(', '))}</span></li>`).join('')}</ul>`:'<p class="empty">No relevant downloadable competitors in this sample.</p>'}${terms}<h3>Possible digital products</h3>${concepts}<h3>Purchase evidence</h3><p class="notice">${escapeHtml(report.purchase.status)}. ${escapeHtml(report.purchase.caveat)}</p>${report.competitors.length?`<button class="research-button" data-check-etsy-reviews>Check dated Etsy reviews · no Alura credits</button>`:""}${report.purchase.reviewEvidence.length?`<ul class="competitors">${report.purchase.reviewEvidence.map(item=>`<li>Listing ${escapeHtml(item.id||item.listingId||"unknown")}: ${item.reviewCount90d==null?"reviews unavailable":`${number(item.reviewCount90d)} reviews dated within 90 days`}${item.latestReviewAt?` · latest ${escapeHtml(item.latestReviewAt.slice(0,10))}`:""}</li>`).join("")}</ul>`:""}<h3>Research conclusion</h3><p>${escapeHtml(report.conclusion)}</p><p><strong>Next check:</strong> ${escapeHtml(report.nextAction)}</p><h3>Observed keyword directions</h3><p class="muted">Phrases below occur in sampled Etsy titles or tags; frequency is supply exposure, not buyer demand. Opening a direction reuses Alura measurements already returned for this search when available.</p>${report.directions.length?`<div class="directions">${report.directions.map(direction=>`<button class="direction" data-direction="${escapeHtml(direction.keyword)}"><strong>${escapeHtml(direction.keyword)}</strong><small>${direction.kind==='observed'?`Observed in ${number(direction.listingIds.length)} sampled listings`:'Generated hypothesis'} · ${escapeHtml(direction.group.audience)} · ${escapeHtml(direction.group.intent)}</small></button>`).join('')}</div>`:'<p class="empty">No relevant narrower phrases were observed in this sample.</p>'}</section>`;
}

export function explorationView(parsed,payload,directions,index,followUp=null){
  const groups=groupDiscovered(directions).slice(0,12);
  const sample=Array.isArray(payload.sample)?payload.sample:[];
  const productSample=followUp?.discovery?.sample||sample;
  const products=productSample.filter(item=>item.listingType==='download'&&
    (parsed.type!=='keyword'||listingRelevance(followUp?.followUpQuery||parsed.keyword,item)!=='irrelevant')).slice(0,12);
  const related=relatedIndexedKeywords(index,sample.map(x=>x.id)).filter(x=>x.keyword!==parsed.keyword).slice(0,5);
  const sourceLabel=parsed.type==='keyword'?`Etsy search for “${parsed.keyword}”`:
    parsed.type==='listing'?`Etsy listing ${parsed.id} and its shop`:`Etsy shop ${parsed.shop}`;
  return `<section class="exploration"><h2>Directions from ${escapeHtml(sourceLabel)}</h2><p class="muted">Observed in ${number(sample.length)} returned listings · ${escapeHtml(payload.source||'Etsy Open API v3')} · ${escapeHtml(payload.fetchedAt||'date unknown')}. Phrases describe seller text, not buyer demand or consistent search ranking.</p>${followUp?.followUpQuery?`<p class="notice">Separate digital search: “${escapeHtml(followUp.followUpQuery)}” · ${followUp.followUpFailed?'unavailable':`${number(followUp.discovery.sample?.length||0)} returned listings`}. Its supply count is kept separate from the original search.</p>`:''}${groups.length?groups.map(group=>`<div class="direction-group"><h3>${escapeHtml(group.need)} · ${escapeHtml(group.audience)} · ${escapeHtml(group.intent)}</h3><div class="directions">${group.candidates.slice(0,8).map(item=>`<button class="direction" data-direction="${escapeHtml(item.keyword)}"><strong>${escapeHtml(item.keyword)}</strong><small>${item.kind==='observed'?`Seen in ${number(item.listingIds.length)} sampled listings${item.originQuery?` for “${escapeHtml(item.originQuery)}”`:''}`:'Generated hypothesis'} · Investigate →</small></button>`).join('')}</div></div>`).join(''):'<p class="notice">No narrower phrases were observed in this sample. Try a different starting phrase or investigate this exact idea.</p>'}${parsed.type==='keyword'?`<button class="research-button" data-investigate-seed="${escapeHtml(parsed.keyword)}">Investigate “${escapeHtml(parsed.keyword)}”</button>`:''}<h2>${parsed.type==='keyword'?'Related digital products':'Digital products from this shop'}</h2><p class="muted">These are returned Etsy listings, not sales or recommendations. Open one to explore its tags and shop products.</p>${products.length?`<div class="product-grid">${products.map(item=>`<article class="product-card"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml((item.tags||[]).slice(0,3).join(' · '))}</small><button class="research-button" data-product-id="${escapeHtml(item.id)}">Explore listing</button></article>`).join('')}</div>`:'<p class="empty">No relevant digital products appeared in this sample.</p>'}${related.length?`<h2>Connected searches in this browser</h2><p class="muted">These keywords shared listing IDs in separate samples. Shared appearance does not establish ranking or demand.</p><div class="directions">${related.map(item=>`<button class="direction" data-direction="${escapeHtml(item.keyword)}"><strong>${escapeHtml(item.keyword)}</strong><small>${number(item.sharedListingIds.length)} shared listing IDs · Investigate →</small></button>`).join('')}</div>`:''}</section>`;
}

function investigationView(report){
  return `<div class="investigation-nav"><button class="research-button" data-back-explore>← Back to directions</button>${report.demand.measurement==null?`<button class="research-button" data-enrich-alura>Get Alura demand estimate · up to 2 Free credits</button>`:''}</div>`+
    researchView(report)+(lastAlura&&report.demand.measurement!=null?`<details class="provider-detail"><summary>Provider measurements and optional buyer-activity check</summary>${metricView(lastAlura)}</details>`:'');
}

export function metricView(data){
  const date=new Date(data.fetchedAt);
  const stamp=Number.isNaN(date.valueOf())?'Unknown':date.toLocaleString();
  const metric=(title,value,detail)=>`<div class="metric"><span>${title}</span><strong>${value==null?'Unavailable':number(value)}</strong><small>${detail}</small></div>`;
  const exact=data.exact;
  const show=value=>value==null?'Unknown':number(value);
  const buyerSection=`<section class="buyer-pull"><h2>Buyer activity</h2><p class="notice">Purchase evidence has not been checked. Search volume alone does not establish sales.</p><button class="research-button" data-check-pull="${escapeHtml(data.query)}">Check buyer activity</button><p class="muted">Checks up to 3 relevant listings for reviews written in the last 90 days. Uses up to 13 included Alura Free-plan credits. Reviews show some purchases occurred; Alura sales figures remain estimates.</p><div class="pull-result" aria-live="polite"></div></section>`;
  return `<h2>${escapeHtml(data.query)}</h2>${exact?`<div class="summary">${metric('Estimated Etsy searches / month',exact.estimatedSearchesMonthly,escapeHtml(data.searchPeriod||data.searchMethod||'Provider estimate'))}${metric('Competing listings',exact.competingListings,escapeHtml(data.competitionMethod||'Provider-reported listing count'))}</div>`:`<div class="notice">${data.status==='pending'?'This keyword is still being fetched by Alura. Try again later.':'The provider returned no exact match for this term.'} Popularity and competition are unavailable.</div>`}<p class="source">Source: ${data.sourceUrl?`<a href="${escapeHtml(data.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.source)}</a>`:escapeHtml(data.source)} · Retrieved ${escapeHtml(stamp)}${exact?.asOf?` · Provider data as of ${escapeHtml(exact.asOf)}`:''} · Geography: ${escapeHtml(data.geography)}. ${escapeHtml(data.searchMethod)}. ${data.validatedAgainstEtsy?'Compared with Etsy Marketplace Insights.':'Accuracy has not yet been checked against Etsy Marketplace Insights.'} ${escapeHtml(data.creditsUsed||'')}</p>${buyerSection}<h2>Related keywords</h2><p class="muted">These rows are returned by the provider. Choose a term to look it up directly; the app does not rank opportunities or choose your strategy.</p>${data.related.length?`<div class="table-wrap"><table><thead><tr><th>Keyword</th><th>Estimated searches / month</th><th>Competing listings</th><th></th></tr></thead><tbody>${data.related.map(row=>`<tr><td>${escapeHtml(row.keyword)}</td><td class="num">${show(row.estimatedSearchesMonthly)}</td><td class="num">${show(row.competingListings)}</td><td><button class="research-button" data-keyword="${escapeHtml(row.keyword)}">Research</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">No related keyword measurements were returned.</p>'}`;
}

export function buyerPullView(data){
  if(!data.evidence?.length)return '<p class="notice">No relevant listings were found in this provider sample. Buyer activity remains unknown.</p>';
  const observed=data.listingsWithRecentReviews>0;
  const status=observed
    ? `${data.listingsWithRecentReviews} of ${data.sampleSize} sampled listings have purchase-linked reviews dated within the last 90 days.`
    : 'No recent reviews were found in this small sample. That does not establish zero sales.';
  return `<p class="notice">${escapeHtml(status)}</p><p class="muted">Reviews confirm some purchases, but review dates are not purchase dates and many buyers never review. Sales figures below are Alura estimates.</p><ul class="pull-list">${data.evidence.map(item=>`<li><strong>${item.url?`<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`:escapeHtml(item.title)}</strong><span>Reviews since ${escapeHtml(data.reviewPeriodStart)}: ${item.reviewCount90d==null?'Unknown':number(item.reviewCount90d)}${item.latestReviewAt?` · Latest ${escapeHtml(item.latestReviewAt.slice(0,10))}`:''} · Estimated sales last month: ${item.estimatedSalesLastMonth==null?'Unknown':number(item.estimatedSalesLastMonth)}</span></li>`).join('')}</ul><p class="source">Source: ${escapeHtml(data.source)} · Checked ${escapeHtml(data.checkedAt)}. ${escapeHtml(data.method)}</p>`;
}

async function checkBuyerPull(keyword,button){
  const base=String(globalThis.MARKET_LENS_API_BASE||'').replace(/\/$/,'');
  const container=button.closest('.buyer-pull').querySelector('.pull-result');
  button.disabled=true;
  container.innerHTML='<p class="empty">Checking sampled listings and dated reviews…</p>';
  try{
    const url=new URL(`${base}/api/buyer-pull`);
    url.searchParams.set('keyword',keyword);
    const response=await fetch(url,{headers:{accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Provider returned ${response.status}.`);
    container.innerHTML=buyerPullView(data);
    if(lastEtsy&&currentReport?.keyword===keyword){
      currentReport=buildResearchReport(keyword,lastEtsy,lastAlura,data);
      result.querySelector('.research-report')?.replaceWith(document.createRange().createContextualFragment(researchView(currentReport)));
    }
    button.remove();
  }catch(error){
    container.innerHTML=`<p class="error">${escapeHtml(error.message||'Buyer activity is unavailable.')}</p>`;
    button.disabled=false;
  }
}

async function checkEtsyReviews(button){
  if(!lastEtsy||!currentReport)return;
  const ids=currentReport.competitors.slice(0,3).map(item=>String(item.id));
  const keyword=currentReport.keyword;
  const base=String(globalThis.MARKET_LENS_API_BASE||'').replace(/\/$/,'');
  button.disabled=true;button.textContent='Checking Etsy reviews…';
  try{
    const url=new URL(`${base}/api/etsy-reviews`);url.searchParams.set('ids',ids.join(','));
    const response=await fetch(url,{headers:{accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Etsy returned ${response.status}.`);
    if(currentReport.keyword!==keyword)return;
    currentReport=buildResearchReport(keyword,lastEtsy,lastAlura,data);
    result.querySelector('.research-report')?.replaceWith(document.createRange().createContextualFragment(researchView(currentReport)));
  }catch(error){
    button.insertAdjacentHTML('afterend',`<p class="error">${escapeHtml(error.message||'Etsy reviews are unavailable.')}</p>`);
    button.disabled=false;button.textContent='Retry dated Etsy reviews';
  }
}

async function fetchIndexedEtsy(parsed){
  const base=String(globalThis.MARKET_LENS_API_BASE||'').replace(/\/$/,'');
  if(!base)throw new Error('The Etsy endpoint is not configured.');
  const cached=cachedObservation(observationIndex,parsed.key);
  if(cached)return {keyword:cached.searchKeyword,totalListings:cached.totalListings,sample:cached.listings,
    sampleSize:cached.listings.length,source:cached.source,fetchedAt:cached.fetchedAt,sourceContext:cached.sourceContext};
  const path=parsed.type==='keyword'?'/api/etsy-keyword':'/api/etsy-source';
  const url=new URL(`${base}${path}`);
  if(parsed.type==='keyword')url.searchParams.set('keyword',parsed.keyword);
  else if(parsed.type==='listing')url.searchParams.set('listingId',parsed.id);
  else url.searchParams.set('shop',parsed.shop);
  const response=await fetch(url,{headers:{accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Etsy returned ${response.status}.`);
  const directions=directionsFromEvidence(parsed,data);
  observationIndex=upsertResearchIndex(observationIndex,indexObservation(parsed,data,directions));
  try{localStorage.setItem(INDEX_STORAGE_KEY,JSON.stringify(observationIndex))}catch{/* Browser storage may be full or disabled. */}
  return data;
}

async function explore(value){
  const requestId=++activeRequest;
  input.value=value;submit.disabled=true;result.innerHTML='<p class="empty">Discovering Etsy directions…</p>';
  try{
    const parsed=parseResearchInput(value);
    if(!parsed)throw new Error('Enter an idea, keyword, listing, or shop.');
    const evidence=parsed.type==='keyword'
      ?await collectDiscoveryEvidence(parsed.keyword,query=>fetchIndexedEtsy(parseResearchInput(query)))
      :{primary:await fetchIndexedEtsy(parsed),discovery:null,followUpQuery:null,followUpFailed:false};
    if(requestId!==activeRequest)return;
    const payload=evidence.primary;
    const primaryDirections=directionsFromEvidence(parsed,payload).filter(item=>item.keyword.length<=80);
    const followUp=evidence.followUpQuery?{
      followUpQuery:evidence.followUpQuery,followUpFailed:evidence.followUpFailed,
      discovery:evidence.followUpFailed?null:evidence.discovery
    }:null;
    const digitalDirections=followUp?.discovery?
      directionsFromEvidence(parsed,followUp.discovery)
        .filter(item=>item.keyword.length<=80).map(item=>({...item,originQuery:followUp.followUpQuery,basisKeyword:parsed.keyword})):[];
    if(followUp?.discovery){
      observationIndex=upsertResearchIndex(observationIndex,indexObservation(parseResearchInput(followUp.followUpQuery),followUp.discovery,digitalDirections));
      try{localStorage.setItem(INDEX_STORAGE_KEY,JSON.stringify(observationIndex))}catch{/* Browser storage may be full or disabled. */}
    }
    const seen=new Set(digitalDirections.map(item=>item.keyword));
    const directions=[...digitalDirections,...primaryDirections.filter(item=>!seen.has(item.keyword))];
    currentExploration={parsed,payload,directions,followUp};
    result.innerHTML=explorationView(parsed,payload,directions,observationIndex,followUp);
    history.replaceState(null,'',`?q=${encodeURIComponent(value)}`);
  }catch(error){result.innerHTML=`<p class="error">${escapeHtml(error.message||'Exploration is unavailable.')}</p>`}
  finally{submit.disabled=false}
}

async function investigate(keyword){
  const requestId=++activeRequest;
  result.innerHTML='<p class="empty">Checking competitors for this direction…</p>';
  try{
    const parsed=parseResearchInput(keyword);
    const etsy=await fetchIndexedEtsy(parsed);
    if(requestId!==activeRequest)return;
    lastEtsy=etsy;
    currentReport=buildResearchReport(keyword,etsy,lastAlura);
    result.innerHTML=investigationView(currentReport);
    history.replaceState(null,'',`?keyword=${encodeURIComponent(keyword)}`);
  }catch(error){result.innerHTML=`<p class="error">${escapeHtml(error.message||'Investigation is unavailable.')}</p>`}
}

async function enrichWithAlura(button){
  if(!currentReport||!lastEtsy)return;
  const keyword=currentReport.keyword;
  const base=String(globalThis.MARKET_LENS_API_BASE||'').replace(/\/$/,'');
  button.disabled=true;button.textContent='Retrieving estimate…';
  try{
    const url=new URL(`${base}/api/keyword-metrics`);url.searchParams.set('keyword',keyword);
    const response=await fetch(url,{headers:{accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Alura returned ${response.status}.`);
    if(currentReport.keyword!==keyword)return;
    lastAlura=data;
    currentReport=buildResearchReport(keyword,lastEtsy,lastAlura);
    result.innerHTML=investigationView(currentReport);
  }catch(error){button.insertAdjacentHTML('afterend',`<p class="error">${escapeHtml(error.message||'Alura is unavailable.')}</p>`);button.disabled=false;button.textContent='Retry Alura estimate · up to 2 Free credits'}
}

form.addEventListener('submit',event=>{event.preventDefault();explore(input.value.trim())});
result.addEventListener('click',event=>{
  const back=event.target.closest('[data-back-explore]');if(back){if(currentExploration){const {parsed,payload,directions,followUp}=currentExploration;result.innerHTML=explorationView(parsed,payload,directions,observationIndex,followUp);history.replaceState(null,'',`?q=${encodeURIComponent(parsed.label)}`)}else explore(currentReport?.keyword||input.value.trim());return}
  const direction=event.target.closest('[data-direction],[data-keyword],[data-investigate-seed]');
  if(direction){investigate(direction.dataset.direction||direction.dataset.keyword||direction.dataset.investigateSeed);return}
  const product=event.target.closest('[data-product-id]');if(product){explore(`https://www.etsy.com/listing/${product.dataset.productId}`);return}
  const enrich=event.target.closest('[data-enrich-alura]');if(enrich){enrichWithAlura(enrich);return}
  const pull=event.target.closest('[data-check-pull]');if(pull){checkBuyerPull(pull.dataset.checkPull,pull);return}
  const etsyReviews=event.target.closest('[data-check-etsy-reviews]');if(etsyReviews){checkEtsyReviews(etsyReviews);return}
  const save=event.target.closest('[data-save-concept]');
  if(save&&currentReport){
    const concept=currentReport.concepts.find(item=>item.id===save.dataset.saveConcept);
    if(!concept)return;
    const saved=savedBriefs();
    const entry={savedAt:new Date().toISOString(),keyword:currentReport.keyword,concept,report:currentReport};
    localStorage.setItem(storageKey,JSON.stringify([entry,...saved.filter(item=>item.keyword!==entry.keyword||item.concept.name!==concept.name)].slice(0,30)));
    save.textContent='Saved locally';
    renderSaved();
  }
});
savedElement.addEventListener('click',event=>{
  const saved=savedBriefs();
  const open=event.target.closest('[data-open-saved]');
  if(open){const item=saved[Number(open.dataset.openSaved)];currentExploration=null;if(item&&!item.report){investigate(item.keyword);return}if(item){currentReport=item.report;lastEtsy={keyword:item.report.keyword,sample:item.report.competitors,totalListings:item.report.supply.broadMatches,source:item.report.supply.source,fetchedAt:item.report.supply.fetchedAt};lastAlura=item.report.demand.measurement==null?null:{exact:{keyword:item.report.keyword,estimatedSearchesMonthly:item.report.demand.measurement,competingListings:item.report.demand.competingListings,asOf:item.report.demand.asOf},related:[],searchPeriod:item.report.demand.period,geography:item.report.demand.geography};result.innerHTML=`<p class="notice">Saved ${escapeHtml(item.savedAt)}. These observations have not been refreshed.</p>`+researchView(item.report);result.scrollIntoView({behavior:'smooth'});}return}
  const exportButton=event.target.closest('[data-export-saved]');
  if(exportButton){const item=saved[Number(exportButton.dataset.exportSaved)];if(!item)return;const url=URL.createObjectURL(new Blob([JSON.stringify(item,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`market-lens-${item.keyword.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return}
  if(event.target.id==='compare-saved'){
    const selected=[...savedElement.querySelectorAll('[data-compare]:checked')].map(input=>saved[Number(input.value)]).filter(Boolean).slice(0,2);
    const target=savedElement.querySelector('#comparison');
    target.innerHTML=selected.length!==2?'<p class="notice">Select two briefs to compare.</p>':`<div class="summary">${selected.map(item=>`<div class="metric"><strong>${escapeHtml(item.concept.name)}</strong><small>${item.report?`${escapeHtml(item.keyword)} · estimated searches/month: ${item.report.demand.measurement==null?'unknown':number(item.report.demand.measurement)} · relevant digital sample: ${number(item.report.supply.digitalCompetitorCount)}/${number(item.report.supply.sampleSize)} · dated reviews: ${escapeHtml(item.report.purchase.status)} · next: ${escapeHtml(item.report.nextAction)}`:`${escapeHtml(item.keyword)} · Etsy evidence expired; open to refresh`}</small></div>`).join('')}</div>`;
  }
});
const initial=new URLSearchParams(location.search).get('q')||new URLSearchParams(location.search).get('keyword');
if(initial){input.value=initial;result.innerHTML='<p class="empty">Select Explore to retrieve Etsy directions.</p>'}
setInterval(()=>{
  const expired=stamp=>!Number.isFinite(Date.parse(stamp))||Date.now()-Date.parse(stamp)>=6*60*60*1000;
  if(lastEtsy&&expired(lastEtsy.fetchedAt)&&result.querySelector('.research-report')){
    result.innerHTML='<p class="notice">This Etsy evidence is more than six hours old. Explore the idea again to refresh it.</p>';
    lastEtsy=null;currentReport=null;
  }
  if(currentExploration&&expired(currentExploration.payload.fetchedAt)&&result.querySelector('.exploration')){
    result.innerHTML='<p class="notice">These Etsy directions need refreshing. Select Explore again.</p>';
    currentExploration=null;
  }
  observationIndex=observationIndex.filter(item=>!expired(item.fetchedAt));
  try{localStorage.setItem(INDEX_STORAGE_KEY,JSON.stringify(observationIndex))}catch{}
  savedBriefs();
},60*1000);
