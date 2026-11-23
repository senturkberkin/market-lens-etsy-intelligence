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
  const example=a.exemplar;
  const purpose=a.characteristics?.functions[0]?.value || a.characteristics?.audiences[0]?.value;
  const detail=example.title.split(/[,|;:–—]/).map(t=>t.trim()).filter(Boolean);
  const formats=[...new Set((example.title+' '+(example.tags||[]).join(' ')).match(/\b(?:pdf|svg|png|jpe?g|xlsx|dxf|stl|epub|psd|procreate|canva|goodnotes|notion|google sheets|excel)\b/gi)?.map(v=>v.toUpperCase())||[])];
  const feature=a.characteristics?.features.find(f=>f.field==='description')?.value;
  const configuration=[formats.join(' / ') || 'Digital download', feature || detail[1] || detail[0]].filter(Boolean).join(' · ');
  const reason=a.recommended?`${num(a.demand)} estimated monthly searches and ${a.commercial.independent} identified shops with positive recent estimates.`:
    `${a.etsy.direct.length} comparable Etsy download${a.etsy.direct.length===1?'':'s'} give you concrete products to inspect.`;
  return `<section class="recommendation"><p class="eyebrow">${labels[decision.status]}</p>
  <h2>${esc(a.direction.phrase)}</h2><p><b>First product to investigate</b> · ${esc(configuration)}.</p>
  <p>${purpose?`Advertised use or audience · ${esc(purpose)}.`:'Buying purpose needs buyer validation.'} Observed example · ${source(example)}.</p>
  <p>${reason} ${decision.status==='multiple'?'Start here for validation. The comparison leaves the commercial leader unresolved.':''}</p>
  <p><b>Next action</b> · ${a.recommended?'Prototype one original example and test purchase intent at the observed asking prices.':a.demand==null?'Check exact search interest for “'+esc(a.direction.phrase)+'” and recent activity among sellers offering the same deliverable.':'Check recent sales for comparable downloads from a second independent shop before prototyping.'}</p></section>
  <h2>Market comparison</h2><div class="table-wrap"><table><thead><tr>${['Market','Monthly searches','3m / annual change','Measured / direct Alura listings','Shops with activity','Recent estimates · median / Q3','Etsy price · median (IQR)','Evidence status'].map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>
  ${items.map(i=>`<tr><td>${esc(i.direction.phrase)}</td><td>${num(i.demand)}</td><td>${trend(i.exact?.change3m)} / ${trend(i.exact?.changeYear)}</td><td>${i.commercial.populated.length} / ${i.commercial.comparable.length}</td><td>${i.commercial.independent}</td><td>${num(i.sales.median)} / ${num(i.sales.q3)}</td><td>${prices(i)}</td><td>${i.recommended?'Commercial support':i.commercial.records.length?'Partial commercial evidence':'Etsy supply only'}</td></tr>`).join('')}
  </tbody></table></div><p class="muted">— means unmeasured. Sales statistics describe direct products in the sales-ranked sample. Exact search demand and actual buyer conversion are separate measurements.</p>
  ${items.map(competitors).join('')}`;
}
