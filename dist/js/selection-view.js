export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc=escapeHtml, num=x=>Number.isFinite(x)?new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(x):'—';
const trend=x=>Number.isFinite(x)?num(x*100)+'%':'—';
const date=x=>x?esc(String(x).slice(0,10)):'—';
const source=r=>/^https?:\/\//i.test(r.url)?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>`:esc(r.title);
const labels={supported:'Supported product target',preliminary:'Preliminary product direction',multiple:'Multiple plausible directions',blocked:'Blocked research'};

function prices(a){
  return Object.entries(a.prices).map(([currency,s])=>`${esc(currency)} ${num(s.median)} (${num(s.q1)}–${num(s.q3)}, n=${s.values.length})`).join('<br>') || '—';
}

function competitors(a){
  const measured=new Set(a.commercial.records.map(r=>String(r.id)));
  const rows=[
    ...a.commercial.records,
    ...a.etsy.direct.filter(r=>!measured.has(String(r.id))).map(etsy=>({...etsy,etsy,classification:'direct'}))
  ];
  return `<details class="provider-detail"><summary>${esc(a.direction.phrase)} · inspect competitors and measurements</summary>
  <p>Exact keyword · ${esc(a.exact?.keyword||a.direction.phrase)}. Alura competition estimate · ${num(a.exact?.competingListings)}. Keyword observation · ${date(a.exact?.asOf)}.</p>
  <p>Etsy · ${a.etsy.direct.length} direct and ${a.etsy.adjacent.length} adjacent downloads. Alura · ${a.commercial.populated.length}/${a.commercial.comparable.length} direct products measured across ${a.commercial.shops} identified shops.
  Individual recent estimates · ${a.sales.values.map(num).join(', ')||'—'}. ${a.sampleTotal?'Largest identified shop accounts for '+num(a.topShop)+' of '+num(a.sampleTotal)+' estimated sales in this sample.':''} Product pages select up to ten digital listings with stored estimates, highest first.</p>
  <ul class="competitors">${rows.map(r=>{
    const price=r.etsy?.price, currency=r.etsy?.currency;
    const asking=Number.isFinite(price)&&currency?`${esc(currency)} ${num(price)}`:r.price?.amount!=null&&r.price?.currency?`${esc(r.price.currency)} ${num(r.price.amount)}`:'—';
    return `<li>${source(r)}<span>${esc(r.classification)} · shop ${esc(r.shop?.name||r.etsy?.shopId||r.shop?.id||'unknown')} · asking ${asking} · recent sales estimate ${num(r.sales?.est_last_month)} · sales as of ${date(r.as_of)}</span><small>${r.etsy?'Seen in Etsy sample':'Current Etsy availability unconfirmed'}${r.matched?' · joined by listing ID':''}${r.etsy?.createdAt?' · created '+date(new Date(r.etsy.createdAt*1000).toISOString()):''}</small></li>`;
  }).join('')}</ul></details>`;
}

export function renderDecision(decision,items){
  const a=decision.winner;
  if(!a)return '<h2>Blocked research</h2><p>The retrieved listings did not identify a relevant downloadable product by title. No commercial request is proposed.</p>';
  const facts=[a.design.variant,a.design.detail,a.design.format].filter(Boolean);
  const configuration=[a.direction.phrase,...facts.map(f=>f.value)].join(' · ');
  const measured=items.some(i=>i.exact||i.commercial.sampled);
  const rationale=measured?
    `Exact monthly searches: ${num(a.demand)}. Dated direct sales estimates: ${a.commercial.populated.length}. Median: ${num(a.sales.median)}. Identified shops with positive estimates: ${a.commercial.independent}.`:
    `Etsy supplied ${a.etsy.direct.length} comparable downloads. ${facts.length?'Repeated design choices give this query a specific configuration to test.':'The sample establishes an offering. Its best configuration is still open.'}`;
  const next=decision.status==='supported'?'Prototype a small original edition and test its asking price with buyers.':
    !measured?'Validate exact keyword demand and recent sales for these product formats.':
    a.outdatedDemand?'Refresh the dated keyword estimate before prototyping.':
    a.demand===null?'Obtain an exact demand observation for this product query.':
    a.demand===0?'Test whether buyers search using a different observed name for this product.':
    !a.timely||!a.comparablePeriod?'Compare direct sellers using a common recent measurement period.':
    a.commercial.independent<2?'Look for a second independent seller with a positive estimate for this deliverable.':
    'Test buyer preference between the supported configurations before choosing a prototype.';
  return `<section class="recommendation"><p class="eyebrow">${labels[decision.status]}</p>
  <h2>${decision.status==='supported'?'Product to prototype':'Provisional research priority'} · ${esc(a.direction.phrase)}</h2>
  <p><b>Proposed first edition</b> · ${esc(configuration)}. Start with one usable sample.</p>
  ${facts.length?`<p>${facts.map(f=>esc(f.value)+' appears in '+f.ids.size+' direct listings across '+f.shops.size+' shops').join('. ')}.</p>`:''}
  <p>${rationale} ${decision.compared?'This market leads on at least one of demand, active sellers, median sales or seller diversification and matches or exceeds the other supported options on each.':decision.status==='multiple'?'Commercial preference remains unresolved.':''}</p>
  <p><b>Next action</b> · ${next}</p></section>
  <h2>Market comparison</h2><div class="table-wrap"><table><thead><tr>${['Market','Monthly searches','3m / annual change','Measured / direct Alura listings','Shops with activity','Recent estimates · median / Q3','Etsy price · median (IQR)','Evidence status'].map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>
  ${items.map(i=>`<tr><td>${esc(i.direction.phrase)}</td><td>${num(i.demand)}</td><td>${trend(i.exact?.change3m)} / ${trend(i.exact?.changeYear)}</td><td>${i.commercial.sampled?i.commercial.populated.length+' / '+i.commercial.comparable.length:'—'}</td><td>${i.commercial.sampled?i.commercial.independent:'—'}</td><td>${num(i.sales.median)} / ${num(i.sales.q3)}</td><td>${prices(i)}</td><td>${i.recommended?'Commercial support':i.commercial.sampled||i.exact?'Partial commercial evidence':'Etsy supply only'}</td></tr>`).join('')}
  </tbody></table></div><p class="muted">— means unmeasured. Sales statistics describe direct products in the sales-ranked sample. Exact search demand and actual buyer conversion are separate measurements.</p>
  ${items.map(competitors).join('')}`;
}
