import {listingRelevance, wordTokens} from './discovery.js';
import {extractListingCharacteristics} from './product-evidence.js';

const clean = text => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
const clauses = title => String(title || '').split(/\s*[,;|:–—()\n]\s*|\s+-\s+/).map(t => t.trim()).filter(Boolean);
const delivery = /\b(?:instant download|digital download|instant|downloadable|digital|printable|download)\b/gi;
const prose = /\b(?:gift|present|perfect|our|your|please|sale|each|best|these|this|unique)\b/i;
const terms = text => wordTokens(text).filter(t => !['a','an','the','and','for','with','of'].includes(t));
const key = text => [...new Set(terms(text))].sort().join(' ');
const packaging=new Set(['pdf','png','jpg','jpeg','svg','file','bundle','set','download','digital']);
const encoding=/\b(?:pdf|svg|png|jpeg|jpg|xlsx|stl|dxf|epub|psd|wif|google sheets|excel|canva|procreate|notion)\b/gi;
const formatOf=row=>[...new Set((row.title+' '+(row.tags||[]).join(' ')).match(encoding)?.map(t=>t.toUpperCase().replace(/^JPEG$/,'JPG'))||[])];
const unique = rows => [...new Map(rows.filter(r => r?.id != null && r.id !== '').map(r => [String(r.id),r])).values()];
function identity(title) {
  let first = clauses(title)[0] || '';
  const modifier=first.search(/\s+(?:printable|instant download|digital download)\b/i);
  if(modifier>0 && terms(first.slice(0,modifier)).length>=2)first=first.slice(0,modifier);
  return clean(first.split(/\s+(?:for|with|includes?|featuring)\s+/i)[0].replace(delivery,'').replace(/^[\s+\d]+\s+|[\s-]+$/g,''));
}
function usable(phrase) {
  const words = terms(phrase);
  return words.length >= 2 && words.length <= 8 && phrase.length <= 80 && !prose.test(phrase) &&
    !/^(?:\d+(?:[.,/-]\d+)*|vol(?:ume)?|part|page|booklet no)\b/i.test(phrase) &&
    !/\b(?:pack of|vol(?:ume)?|version|part|no\.?)?\s*\d+$/.test(phrase) &&
    /^[\p{L}\p{N}][\p{L}\p{N} '&/-]*$/u.test(phrase) && !/\b(?:only|copyright|reserved|listing|item)\b/i.test(phrase) &&
    !/\b(?:files?|edition|only)$/i.test(phrase);
}
// Require the product noun at the end of the primary deliverable. A mention
// in tags or a later clause alone cannot identify the item being sold.
export function classifyComparable(phrase, listing) {
  if (listing?.listingType !== 'download') return 'irrelevant';
  const primary = terms(identity(listing.title));
  const wanted = terms(phrase.replace(delivery,''));
  if (!wanted.length || !primary.length) return 'uncertain';
  const sameHead = primary.at(-1) === wanted.at(-1);
  if (sameHead && wanted.every(t => primary.includes(t))) return 'direct';
  const primaryText=primary.join(' '), wantedText=wanted.join(' ');
  const tail=primaryText.slice(wantedText.length).trim();
  // Some undelimited titles concatenate two complete seller tags. Only accept
  // the boundary when both halves appear independently in this listing.
  const tags=(listing.tags || []).map(tag=>terms(tag).join(' '));
  if(primaryText.startsWith(wantedText+' ') && tags.includes(wantedText) && tags.includes(tail) && terms(tail).length>=2)return 'direct';
  if (sameHead && listingRelevance(phrase, {title:listing.title}) === 'semantic') return 'direct';
  if (wanted.some(t => primary.includes(t))) return 'adjacent';
  return listingRelevance(phrase, listing) === 'irrelevant' ? 'irrelevant' : 'uncertain';
}

export function discoverProductMarkets(seed, listings, minimum = 2, shopScope = false) {
  const rows = unique(listings || []).filter(r => r.listingType === 'download' && (shopScope || listingRelevance(seed,r) !== 'irrelevant'));
  const phrases = new Set([clean(seed)]);
  for (const row of rows) {
    const head = identity(row.title);
    if((shopScope || listingRelevance(seed,{title:row.title})!=='irrelevant') && !terms(head).some((t,i,all)=>all.indexOf(t)!==i)){
      phrases.add(head);
    }
    for (const tag of row.tags || []) {
      if (listingRelevance(seed,{title:tag}) !== 'irrelevant' && classifyComparable(tag,row) === 'direct') phrases.add(clean(tag));
    }
  }
  const markets = [];
  for (const phrase of phrases) {
    if (!usable(phrase) || /^(?:and|with|for|of|the)\b/.test(phrase)) continue;
    const theme=clean(seed.replace(delivery,''));
    if(!shopScope && theme && listingRelevance(theme,{title:phrase})==='irrelevant') {
      // Permit a full product name from a relevant title as an exploratory
      // lead. Partial suffixes and generic tags cannot use this exception.
      const named=rows.filter(r=>identity(r.title)===phrase);
      const subject=terms(theme), candidate=terms(phrase);
      if(subject.length>1 && (!candidate.includes(subject.at(-1)) ||
        !subject.slice(0,-1).some(t=>candidate.includes(t))))continue;
      if(!named.length || (minimum>1 && new Set(named.map(r=>r.shopId).filter(Boolean)).size<2))continue;
    }
    const evidence = rows.filter(row => classifyComparable(phrase,row) === 'direct');
    if (evidence.length < minimum) continue;
    const listingIds = evidence.map(r => String(r.id)).sort();
    markets.push({phrase, listingIds, listings:evidence, design:sharedDesign(phrase,evidence), isSeed:key(phrase)===key(seed),
      sourceListings:evidence.slice(0,4), reason:`${listingIds.length} downloadable listings describe this product in their titles.`});
  }
  if(!shopScope && usable(clean(seed)) && !markets.some(m=>listingRelevance(seed,{title:m.phrase})!=='irrelevant')){
    const mentions=rows.filter(r=>clauses(r.title).slice(1).some(part=>listingRelevance(seed,{title:part})==='exact') ||
      (r.tags||[]).some(tag=>key(tag)===key(seed)));
    if(mentions.length>=minimum){
      markets.unshift({phrase:clean(seed),isSeed:true,componentOnly:true,listings:mentions,
        listingIds:mentions.map(r=>String(r.id)),sourceListings:mentions.slice(0,4),design:sharedDesign(seed,[])});
    }
  }
  return markets.sort((a,b) => Number(Boolean(b.design.format))-Number(Boolean(a.design.format)) ||
    Number(Boolean(b.design.detail))-Number(Boolean(a.design.detail)) || a.phrase.length-b.phrase.length || a.phrase.localeCompare(b.phrase));
}

// Each design choice needs separate shop witnesses. Product identity, format,
// and audience remain independent facts; unique characteristics stay in citations.
function sharedDesign(phrase,rows){
  const formats=new Map(), details=new Map(), variants=new Map();
  function witness(map,value,row){
    if(!row.shopId || !value)return;
    const k=clean(value), entry=map.get(k)||{value,shops:new Set(),ids:new Set()};
    entry.shops.add(String(row.shopId));entry.ids.add(String(row.id));map.set(k,entry);
  }
  for(const row of rows){
    formatOf(row).forEach(f=>witness(formats,f,row));
    const observed=extractListingCharacteristics(row);
    for(const claim of observed?.audiences||[])witness(details,'for '+claim.value,row);
    for(const claim of observed?.functions||[])if(usable(claim.value))witness(details,'to '+claim.value,row);
    const text=row.title+' '+(row.tags||[]).join(' ');
    for(const tag of row.tags||[]){
      const words=terms(tag);
      if(!usable(clean(tag))||words.length>5||!words.some(t=>terms(phrase).includes(t)) ||
        !words.some(t=>!terms(phrase).includes(t)&&!packaging.has(t)) ||
        !words.every(t=>terms(row.title).includes(t)))continue;
      witness(variants,clean(tag),row);
    }
    if(/\b(editable|customizable|customisable)\b/i.test(text))witness(details,'editable',row);
    if(/\b(personali[sz]ed|custom made)\b/i.test(text))witness(details,'personalized',row);
    if(/\b(printable|print at home)\b/i.test(text))witness(details,'print at home',row);
  }
  let cohort=rows;
  function strongest(map){
    const options=[...map.values()].map(e=>{
      const matching=cohort.filter(r=>e.ids.has(String(r.id)));
      return {...e,matching,shops:new Set(matching.map(r=>String(r.shopId))),ids:new Set(matching.map(r=>String(r.id)))};
    }).filter(e=>e.shops.size>=2).sort((a,b)=>b.shops.size-a.shops.size||a.value.localeCompare(b.value));
    const choice=options[0];
    if(!choice)return null;
    cohort=choice.matching;
    return {value:choice.value,shops:choice.shops,ids:choice.ids};
  }
  const format=strongest(formats),detail=strongest(details),variant=strongest(variants);
  return {format,detail,variant};
}

export function selectResearchBatch(seed,markets,max=3) {
  const selected = [];
  const theme=terms(seed.replace(delivery,''));
  const viable=markets.filter(m=>{
    const words=terms(m.phrase);
    // Adding a container/encoding alone leaves the proposed product undefined.
    const extra=words.filter(t=>!theme.includes(t));
    if(extra.length && extra.every(t=>/^\d+$/.test(t)||packaging.has(t)))return false;
    if(theme.length===1 && words.at(-1)===theme[0] &&
      !m.listings.some(r=>usable(identity(r.title)) && key(identity(r.title))===key(m.phrase)))return false;
    return true;
  });
  const seedMarket=viable.find(m=>m.isSeed);
  const broadSellerBase=seedMarket && new Set(seedMarket.listings.map(r=>r.shopId).filter(Boolean)).size>1;
  const specific = viable.filter(m => !m.isSeed && !terms(m.phrase).every(t=>terms(seed).includes(t)) &&
    (!broadSellerBase || new Set(m.listings.map(r=>r.shopId).filter(Boolean)).size>1));
  const candidates=seedMarket?.componentOnly?[seedMarket]:specific.length?specific:seedMarket?[seedMarket]:viable;
  const independent=candidates.filter(m=>new Set(m.listings.map(r=>r.shopId).filter(Boolean)).size>=2);
  function describesBoth(a,b){
    const rows=a.listings.filter(r=>listingRelevance(b.phrase,r)!=='irrelevant');
    return rows.length>=a.listings.length/2 && new Set(rows.map(r=>r.shopId).filter(Boolean)).size>=2;
  }
  for (const market of independent.length?independent:candidates) {
    if (selected.some(other => key(other.phrase)===key(market.phrase) ||
      describesBoth(market,other) || describesBoth(other,market) ||
      market.listingIds.some(id=>other.listingIds.includes(id)) &&
      market.listingIds.filter(id=>other.listingIds.includes(id)).length >= .5*Math.min(other.listingIds.length,market.listingIds.length))) continue;
    selected.push(market);
    if (selected.length >= max) break;
  }
  return selected;
}

export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  function quantile(p) {
    if (!sorted.length) return null;
    const i = (sorted.length-1)*p, lower = Math.floor(i);
    return sorted[lower]+(i-lower)*(sorted[Math.ceil(i)]-sorted[lower]);
  }
  return {values:sorted, median:quantile(.5), q1:quantile(.25), q3:quantile(.75)};
}

export function assessDirection(direction,etsy,commercial) {
  const sample = unique([...(direction.listings || []), ...(etsy?.sample || [])]);
  const scoped = direction.listingIds ? sample.filter(row=>direction.listingIds.includes(String(row.id))) : sample;
  const direct = scoped.filter(row=>classifyComparable(direction.phrase,row)==='direct');
  const adjacent = sample.filter(row=>classifyComparable(direction.phrase,row)==='adjacent');
  const byId = new Map(sample.map(row=>[String(row.id),row]));
  const records = unique(commercial?.products || []).map(row=>{
    const match = byId.get(String(row.id));
    const conflict=match?.shopId && row.shop?.id && String(match.shopId)!==String(row.shop.id);
    const classification = conflict?'uncertain':classifyComparable(direction.phrase,match || {...row,listingType:'download'});
    return {...row, classification, matched:Boolean(match), etsy:match};
  });
  const comparable = records.filter(r=>r.classification==='direct');
  const populated = comparable.filter(r=>Number.isSafeInteger(r.sales?.est_last_month) && r.sales.est_last_month>=0);
  const active = populated.filter(r=>r.sales.est_last_month>0);
  const namedIds=new Map();
  for(const r of comparable){
    const id=r.etsy?.shopId || r.shop?.id;
    if(id && r.shop?.name)namedIds.set(clean(r.shop.name),String(id));
  }
  const shop = r=>r.etsy?.shopId || r.shop?.id || (r.shop?.name && (namedIds.get(clean(r.shop.name)) || clean(r.shop.name)));
  const shops = rows=>new Set(rows.map(shop).filter(Boolean).map(String)).size;
  const independent = shops(active);
  const sales = distribution(populated.map(r=>r.sales.est_last_month));
  const shopTotals=new Map();
  for(const r of active)if(shop(r))shopTotals.set(String(shop(r)),(shopTotals.get(String(shop(r)))||0)+r.sales.est_last_month);
  const topShop=Math.max(0,...shopTotals.values()), sampleTotal=sales.values.reduce((sum,x)=>sum+x,0);
  const prices = Object.fromEntries([...new Set(direct.filter(r=>Number.isFinite(r.price)&&r.currency).map(r=>r.currency))].map(c=>[c,distribution(direct.filter(r=>r.currency===c).map(r=>r.price))]));
  const exact = commercial?.keyword && clean(commercial.keyword.keyword)===clean(direction.phrase) ? commercial.keyword : null;
  const demand = exact?.estimatedSearchesMonthly ?? null;
  const periods = new Set(populated.map(r=>Number.isFinite(Date.parse(r.as_of))?r.as_of.slice(0,7):null));
  const comparablePeriod = periods.size===1 && !periods.has(null);
  const referenceMonth=etsy?.fetchedAt?.slice(0,7);
  const timely=!referenceMonth || [...periods][0]===referenceMonth;
  const referenceTime=Date.parse(etsy?.fetchedAt);
  const demandAge=(referenceTime-Date.parse(exact?.asOf))/86400000;
  const outdatedDemand=Number.isFinite(demandAge) && (demandAge>93 || demandAge< -1);
  const recommended = demand>0 && !outdatedDemand && comparablePeriod && timely && independent>=2 && direct.length>=2;
  const exemplar = [...direct].sort((a,b)=>Number(!usable(identity(a.title)))-Number(!usable(identity(b.title))) ||
    Number(identity(a.title)===clean(direction.phrase))-Number(identity(b.title)===clean(direction.phrase)) || a.title.length-b.title.length)[0];
  return {direction, etsy:{direct,adjacent,date:etsy?.fetchedAt,shops:new Set(direct.map(r=>r.shopId).filter(Boolean)).size}, commercial:{records,comparable,populated,active,independent,shops:shops(populated),sampled:commercial?.productStatus==='sampled'||records.length>0}, prices,sales,exact,demand,recommended,comparablePeriod,exemplar,
    topShop,sampleTotal,timely,outdatedDemand,design:sharedDesign(direction.phrase,direct),audience:`buyers seeking ${direction.phrase}`};
}

export function chooseProductTarget(assessments) {
  // With equivalent design evidence, the input order is the query order only.
  const designOrder=(a,b)=>Number(Boolean(b.design.format))-Number(Boolean(a.design.format)) ||
    Number(Boolean(b.design.detail))-Number(Boolean(a.design.detail));
  const freshShops=a=>a.comparablePeriod && a.timely ? a.commercial.independent : 0;
  const ordered = assessments.filter(a=>a.exemplar || a.direction.componentOnly || a.commercial.comparable.length).sort((a,b)=>Number(b.recommended)-Number(a.recommended) ||
    freshShops(b)-freshShops(a) || Number(b.demand>0&&!b.outdatedDemand)-Number(a.demand>0&&!a.outdatedDemand) || designOrder(a,b));
  const supported=ordered.filter(a=>a.recommended);
  function dominates(a,b){
    if(a.commercial.populated[0].as_of.slice(0,7)!==b.commercial.populated[0].as_of.slice(0,7) ||
      a.sales.values.length!==b.sales.values.length || [a,b].some(x=>x.sales.values.length!==x.commercial.comparable.length))return false;
    const dimensions=x=>[x.demand,x.commercial.independent,x.sales.median,-x.topShop/x.sampleTotal];
    const left=dimensions(a),right=dimensions(b);
    return left.every((v,i)=>v>=right[i]) && left.some((v,i)=>v>right[i]);
  }
  const leader=supported.find(a=>supported.every(b=>a===b||dominates(a,b)));
  const winner=leader||ordered[0];
  return {status:leader?'supported':ordered.length>1?'multiple':winner?'preliminary':'blocked',winner,
    compared:Boolean(leader && supported.length>1),alternatives:ordered.filter(a=>a!==winner)};
}
