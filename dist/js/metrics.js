const form=document.querySelector('#search-form');
const input=document.querySelector('#keyword');
const result=document.querySelector('#result');
const submit=form.querySelector('button');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>new Intl.NumberFormat('en-US').format(value);

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
    button.remove();
  }catch(error){
    container.innerHTML=`<p class="error">${escapeHtml(error.message||'Buyer activity is unavailable.')}</p>`;
    button.disabled=false;
  }
}

async function research(keyword){
  const base=String(globalThis.MARKET_LENS_API_BASE||'').replace(/\/$/,'');
  if(!base){result.innerHTML='<p class="error">The keyword data endpoint is not configured.</p>';return;}
  input.value=keyword;submit.disabled=true;result.innerHTML='<p class="empty">Retrieving keyword measurements…</p>';
  try{
    const url=new URL(`${base}/api/keyword-metrics`);
    url.searchParams.set('keyword',keyword);
    const response=await fetch(url,{headers:{accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Provider returned ${response.status}.`);
    result.innerHTML=metricView(data);
    history.replaceState(null,'',`?keyword=${encodeURIComponent(keyword)}`);
  }catch(error){result.innerHTML=`<p class="error">${escapeHtml(error.message||'Keyword data is unavailable.')}</p>`}
  finally{submit.disabled=false}
}
form.addEventListener('submit',event=>{event.preventDefault();research(input.value.trim())});
result.addEventListener('click',event=>{const keyword=event.target.closest('[data-keyword]');if(keyword){research(keyword.dataset.keyword);return}const pull=event.target.closest('[data-check-pull]');if(pull)checkBuyerPull(pull.dataset.checkPull,pull)});
const initial=new URLSearchParams(location.search).get('keyword');
if(initial){input.value=initial;result.innerHTML='<p class="empty">Select Research to retrieve current measurements.</p>'}
