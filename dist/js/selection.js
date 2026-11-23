import {listingRelevance, wordTokens} from './discovery.js';
import {extractListingCharacteristics} from './product-evidence.js';

const clean = text => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
const clauses = title => String(title || '').split(/\s*[,;|:–—()\n]\s*|\s+-\s+/).map(t => t.trim()).filter(Boolean);
const delivery = /\b(?:instant download|digital download|instant|downloadable|digital|printable|download)\b/gi;
const prose = /\b(?:gift|present|perfect|our|your|please|sale|each|best|these|this|unique)\b/i;
const terms = text => wordTokens(text).filter(t => !['a','an','the','and','for','with','of'].includes(t));
const key = text => [...new Set(terms(text))].sort().join(' ');
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
  const endings=new Map();
  for (const row of rows) {
    const head = identity(row.title);
    if((shopScope || listingRelevance(seed,{title:row.title})!=='irrelevant') && !terms(head).some((t,i,all)=>all.indexOf(t)!==i)){
      phrases.add(head);
      const words=head.split(/\s+/);
      for(let size=2;size<=Math.min(6,words.length);size++){
        const ending=words.slice(-size).join(' ');
        if(!terms(ending).some(t=>terms(seed).includes(t)))continue;
        if(!endings.has(ending))endings.set(ending,new Set());
        endings.get(ending).add(head);
      }
    }
    for (const tag of row.tags || []) {
      if (listingRelevance(seed,{title:tag}) !== 'irrelevant' && classifyComparable(tag,row) === 'direct') phrases.add(clean(tag));
    }
  }
  for(const [phrase,heads] of endings)if(heads.size>=2)phrases.add(phrase);
  const markets = [];
  for (const phrase of phrases) {
    if (!usable(phrase) || /^(?:and|with|for|of|the)\b/.test(phrase)) continue;
    const theme=clean(seed.replace(delivery,''));
    if(!shopScope && theme && listingRelevance(theme,{title:phrase})==='irrelevant') {
      // Permit a full product name from a relevant title as an exploratory
      // lead. Partial suffixes and generic tags cannot use this exception.
      if(minimum!==1 || !rows.some(r=>identity(r.title)===phrase && listingRelevance(theme,{title:r.title})!=='irrelevant'))continue;
    }
    const evidence = rows.filter(row => classifyComparable(phrase,row) === 'direct');
    if (evidence.length < minimum) continue;
    const listingIds = evidence.map(r => String(r.id)).sort();
    markets.push({phrase, listingIds, listings:evidence, isSeed:key(phrase)===key(seed),
      sourceListings:evidence.slice(0,4), reason:`${listingIds.length} downloadable listings describe this product in their titles.`});
  }
  const shops=m=>new Set(m.listings.map(r=>r.shopId).filter(Boolean)).size;
  return markets.sort((a,b) => shops(b)-shops(a) || b.listings.length-a.listings.length || a.phrase.length-b.phrase.length || a.phrase.localeCompare(b.phrase));
}

export function selectResearchBatch(seed,markets,max=3) {
  const selected = [];
  const specific = markets.filter(m => !m.isSeed && !terms(m.phrase).every(t=>terms(seed).includes(t)));
  for (const market of specific.length ? specific : markets) {
    if (selected.some(other => key(other.phrase)===key(market.phrase) ||
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
  const periods = new Set(populated.map(r=>/^\d{4}-\d{2}/.exec(r.as_of)?.[0] || null));
  const comparablePeriod = periods.size===1 && !periods.has(null);
  const referenceMonth=etsy?.fetchedAt?.slice(0,7);
  const timely=!referenceMonth || [...periods][0]===referenceMonth;
  const recommended = demand>0 && comparablePeriod && timely && independent>=2 && direct.length>=2;
  const exemplar = [...direct].sort((a,b)=>Number(identity(a.title)===clean(direction.phrase))-Number(identity(b.title)===clean(direction.phrase)) || a.title.length-b.title.length)[0];
  return {direction, etsy:{direct,adjacent,date:etsy?.fetchedAt,shops:new Set(direct.map(r=>r.shopId).filter(Boolean)).size}, commercial:{records,comparable,populated,active,independent,shops:shops(populated),sampled:commercial?.productStatus==='sampled'||records.length>0}, prices,sales,exact,demand,recommended,comparablePeriod,exemplar,
    topShop,sampleTotal,timely,characteristics:extractListingCharacteristics(exemplar),audience:`buyers seeking ${direction.phrase}`};
}

export function chooseProductTarget(assessments) {
  const ordered = assessments.filter(a=>a.exemplar).sort((a,b)=>Number(b.recommended)-Number(a.recommended) ||
    b.commercial.independent-a.commercial.independent || b.etsy.shops-a.etsy.shops || b.etsy.direct.length-a.etsy.direct.length || a.direction.phrase.localeCompare(b.direction.phrase));
  const winner=ordered[0];
  const supported=ordered.filter(a=>a.recommended);
  const sameMonth = supported.every(a=>a.commercial.populated[0]?.as_of?.slice(0,7)===winner?.commercial.populated[0]?.as_of?.slice(0,7));
  const decisive=winner?.recommended && (supported.length===1 || sameMonth && supported.slice(1).every(other=>
    winner.commercial.independent>other.commercial.independent &&
    winner.sales.median>=other.sales.median &&
    winner.commercial.populated.length===other.commercial.populated.length &&
    winner.commercial.populated.length===winner.commercial.comparable.length &&
    other.commercial.populated.length===other.commercial.comparable.length));
  return {status:decisive?'supported':ordered.length>1?'multiple':winner?'preliminary':'blocked',winner,alternatives:ordered.slice(1)};
}
