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
    ...a.etsy.direct.filter(r=>!measured.has(String(r.id))).map(etsy=>({...etsy,etsy,classification:'direct'})),
    ...(a.direction.componentOnly?a.direction.listings.filter(r=>!measured.has(String(r.id)) && !a.etsy.direct.some(d=>d.id===r.id)).map(etsy=>({...etsy,etsy,classification:'advertised in listing; standalone identity unconfirmed'})):[])
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
  if(a.direction.componentOnly || a.etsy.direct.length && a.etsy.shops<2 && !a.commercial.sampled){
    const leads=a.direction.componentOnly?a.direction.listings:a.etsy.direct;
    return `<section class="recommendation"><p class="eyebrow">Preliminary product direction</p>
      <h2>Research lead · ${esc(a.direction.phrase)}</h2>
      <p>${a.direction.componentOnly?'The sampled sellers mention this term in descriptions of other products. Verify whether sellers offer it separately before choosing a specification.':'One seller’s wording identifies a lead. Independent suppliers have yet to corroborate the deliverable and its use.'}</p>
      <p><b>Evidence to follow</b> · ${leads.slice(0,3).map(source).join(' · ')}</p>
      <p>Exact search demand and direct recent sales are unmeasured.</p></section>
      ${items.map(competitors).join('')}`;
  }
  const facts=[a.design.variant,a.design.detail,a.design.format].filter(Boolean);
  const {format,detail,variant}=a.design;
  const use=detail?.value==='print at home'?' for home printing':
    detail?.value?.startsWith('for ')||detail?.value?.startsWith('to ')?' '+detail.value:'';
  const kind=['personalized','editable'].includes(detail?.value)?detail.value+' ':'';
  const configuration=`One ${kind}edition of “${a.direction.phrase}”${use}.`+
    (format?(/^(?:CANVA|PROCREATE|NOTION|EXCEL|GOOGLE SHEETS|GOODNOTES)$/i.test(format.value)?` Build it for ${format.value}.`:` Supply it in ${format.value} format.`):'')+
    (variant?` Focus the sample on “${variant.value}”.`:'');
  const measured=items.some(i=>i.exact||i.commercial.sampled);
  const {edge,purpose,segment}=a.entry;
  const useCase=[segment,purpose].filter(Boolean).join(' · ');
  const configurations={
    editable:'a ready-to-use edition alongside an editable master',
    customizable:'a starter configuration with a customizable master',
    customisable:'a starter configuration with a customizable master',
    layered:'separately switchable layers alongside a ready-to-use composite',
    printable:'a single home-print edition with a print-size check',
    fillable:'a fillable edition with a completed example',
    seamless:'a seamless repeat with a scale preview',
    personalized:'a personalized edition with a preview before delivery',
    personalised:'a personalized edition with a preview before delivery'
  };
  const positioning=edge?{
    audience:`Test an edition explicitly written for ${edge.value} against a general edition.`,
    use:`Test a version organized around one task (“${edge.value}”) against a general-purpose version.`,
    feature:`Test a small edition built around “${edge.value}” against a broader package at the same price.`,
    configuration:`For the ${a.scope.core}, test ${configurations[edge.value]||'an edition built around '+edge.value} against a basic edition at the same asking price.`
  }[edge.kind]:null;
  const rationale=measured?
    `Exact monthly searches: ${num(a.demand)}. Dated direct sales estimates: ${a.commercial.populated.length}. Median: ${num(a.sales.median)}. Identified shops with positive estimates: ${a.commercial.independent}.`:
    a.direction.componentOnly?`${a.direction.listings.length} downloadable listings advertise this item. Verify whether sellers offer it separately before choosing a specification.`:
    `Etsy supplied ${a.etsy.direct.length} comparable downloads. ${facts.length?'Repeated design choices give this query a specific configuration to test.':'The sample establishes an offering. Its best configuration is still open.'}`;
  const next=decision.status==='supported'?'Prototype the two offers above at one asking price and compare buyer choices.':
    !measured?'Validate exact keyword demand and recent sales for these product formats.':
    a.outdatedDemand?'Refresh the dated keyword estimate before prototyping.':
    a.demand===null?'Obtain an exact demand observation for this product query.':
    a.demand===0?'Test whether buyers search using a different observed name for this product.':
    !a.timely||!a.comparablePeriod?'Compare direct sellers using a common recent measurement period.':
    a.commercial.independent<2?'Look for a second independent seller with a positive estimate for this deliverable.':
    'Test buyer preference between the supported configurations before choosing a prototype.';
  return `<section class="recommendation"><p class="eyebrow">${labels[decision.status]}</p>
  <h2>${decision.status==='supported'?'Product to prototype':'Provisional research priority'} · ${esc(a.direction.phrase)}</h2>
  <p><b>${a.direction.componentOnly&&!a.exemplar?'Standalone concept to validate':'Proposed first edition'}</b> · ${esc(configuration)}</p>
  <p><b>Buyer and use</b> · ${esc(useCase||'Sellers identify the deliverable. A specific buyer or use has yet to be corroborated.')}</p>
  <p><b>Why investigate</b> · ${rationale} ${decision.compared?'This direction leads the measured alternatives on at least one of search interest, active shops, median sales or seller diversification and matches them on the others.':decision.status==='multiple'?'Commercial preference remains unresolved.':''}</p>
  <p><b>Competition</b> · ${a.etsy.direct.length} direct Etsy listings across ${a.etsy.shops} identified shops. ${Object.keys(a.prices).length?'Median asking price and middle half · '+prices(a)+'.':''} ${a.sampleTotal?'Largest identified seller · '+num(a.topShop)+' of '+num(a.sampleTotal)+' estimated sales in the sample.':''}</p>
  <p><b>Possible edge</b> · ${positioning?esc(positioning)+' The observed starting point is “'+esc(edge.value)+'” in '+edge.witnesses.size+' of '+a.etsy.direct.length+' direct listings across '+edge.shops.size+' shops.':'The sample has yet to establish a repeatable positioning difference. Validate this deliverable before designing an edition.'}</p>
  <p><b>Main risk</b> · ${measured?'Sales-ranked samples favor observed sellers with stored estimates. The chance of a new seller making sales is unknown.':'Search demand and recent sales for this exact product are unmeasured.'}</p>
  <p><b>Next action</b> · ${next}</p></section>
  <h2>Market comparison</h2><div class="table-wrap"><table><thead><tr>${['Market','Monthly searches','3m / annual change','Measured / direct Alura listings','Shops with activity','Recent estimates · median / Q3','Etsy price · median (IQR)','Evidence status'].map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>
  ${items.map(i=>`<tr><td>${esc(i.direction.phrase)}</td><td>${num(i.demand)}</td><td>${trend(i.exact?.change3m)} / ${trend(i.exact?.changeYear)}</td><td>${i.commercial.sampled?i.commercial.populated.length+' / '+i.commercial.comparable.length:'—'}</td><td>${i.commercial.sampled?i.commercial.independent:'—'}</td><td>${num(i.sales.median)} / ${num(i.sales.q3)}</td><td>${prices(i)}</td><td>${i.recommended?'Commercial support':i.commercial.sampled||i.exact?'Partial commercial evidence':'Etsy supply only'}</td></tr>`).join('')}
  </tbody></table></div><p class="muted">— means unmeasured. Sales statistics describe direct products in the sales-ranked sample. Exact search demand and actual buyer conversion are separate measurements.</p>
  ${items.map(i=>competitors(i)+(i.entry.edge?`<details><summary>Positioning evidence · ${esc(i.direction.phrase)}</summary><ul>${[...i.entry.edge.witnesses].map(([id,claim])=>`<li>${source({url:claim.listingUrl,title:'Listing '+id})} · ${esc(claim.field)} · “${esc(claim.quote)}”</li>`).join('')}</ul></details>`:'')).join('')}`;
}
