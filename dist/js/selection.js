// Product selection is deliberately evidence-first. It has no niche catalog:
// directions come from returned listing text and every conclusion retains IDs.
import {listingRelevance, normalizePhrase, wordTokens} from './discovery.js';

const NOISE=new Set(['digital','download','instant','printable','editable','template','file','files','gift','sale','new','for','with','and','the','a','an']);
const canonical=value=>normalizePhrase(value);
const tokens=value=>wordTokens(value).filter(word=>!NOISE.has(word));
const overlap=(a,b)=>{
  const left=new Set(tokens(a)),right=new Set(tokens(b));
  return [...left].filter(token=>right.has(token)).length/Math.max(left.size,right.size,1);
};
const phraseFromListing=listing=>{
  const head=String(listing.title||'').split(/[|,;–—:]/)[0];
  const words=tokens(head).slice(0,7);
  return words.length>=2?words.join(' '):'';
};
const buyerText=listing=>{
  const text=`${listing.title||''} ${(listing.tags||[]).join(' ')} ${listing.description||''}`;
  const match=text.match(/\bfor\s+([\p{L}\p{N}'-]+(?:\s+[\p{L}\p{N}'-]+){0,3})/iu);
  return match?.[1]||null;
};

export function discoverProductMarkets(seed,listings){
  const rows=(Array.isArray(listings)?listings:[]).filter(row=>row?.listingType==='download');
  const groups=new Map();
  for(const listing of rows){
    if(listingRelevance(seed,listing)==='irrelevant')continue;
    const candidates=[phraseFromListing(listing),...(listing.tags||[]).map(value=>canonical(value))]
      .map(canonical).filter(value=>tokens(value).length>=2&&tokens(value).length<=7);
    for(const phrase of [...new Set(candidates)]){
      const key=phrase;
      const group=groups.get(key)||{phrase,listingIds:new Set(),listings:[],audiences:new Map()};
      group.listingIds.add(String(listing.id));
      if(!group.listings.some(row=>String(row.id)===String(listing.id)))group.listings.push(listing);
      const audience=buyerText(listing);
      if(audience)group.audiences.set(canonical(audience),audience);
      groups.set(key,group);
    }
  }
  return [...groups.values()].filter(group=>group.listingIds.size>=2)
    .map(group=>({phrase:group.phrase,listingIds:[...group.listingIds],listings:group.listings,
      audiences:[...group.audiences.values()]}))
    .sort((a,b)=>b.listingIds.length-a.listingIds.length||a.phrase.localeCompare(b.phrase));
}

// This selects diverse research probes, not winners. A parent phrase cannot
// crowd out all of the distinct product forms found in the evidence.
export function selectResearchBatch(seed,markets,max=3){
  const chosen=[];
  for(const market of markets){
    if(market.phrase===canonical(seed))continue;
    if(chosen.some(other=>overlap(other.phrase,market.phrase)>=0.72))continue;
    chosen.push(market);
    if(chosen.length>=max)break;
  }
  return chosen;
}

export function classifyComparable(direction,listing){
  if(listing?.listingType!=='download')return 'irrelevant';
  const match=listingRelevance(direction,listing);
  if(match==='exact')return 'direct';
  return overlap(direction,`${listing.title||''} ${(listing.tags||[]).join(' ')}`)>=0.45?'adjacent':'irrelevant';
}

export function assessDirection(direction,etsy,commercial){
  const sample=Array.isArray(etsy?.sample)?etsy.sample:[];
  const direct=sample.filter(row=>classifyComparable(direction.phrase,row)==='direct');
  const adjacent=sample.filter(row=>classifyComparable(direction.phrase,row)==='adjacent');
  const records=(commercial?.products||[]).map(row=>({...row,classification:classifyComparable(direction.phrase,{...row,listingType:'download'})}));
  const comparable=records.filter(row=>row.classification==='direct');
  const populated=comparable.filter(row=>Number.isInteger(row.sales?.est_last_month));
  const active=populated.filter(row=>row.sales.est_last_month>0);
  const independent=new Set(active.map(row=>String(row.shop?.id||row.shop?.name||row.id))).size;
  const demand=commercial?.keyword?.estimatedSearchesMonthly??null;
  const audiences=[...new Set(direct.flatMap(buyerText).filter(Boolean))];
  const position=direct.map(phraseFromListing).filter(Boolean);
  // Decorative products often express a buying purpose through the product
  // itself rather than a functional “for X” claim. That is not a missing
  // audience; it is a narrower, observed purchase purpose.
  const purchasePurpose=audiences[0]||(direct.length>=2?`buyers seeking ${direction.phrase}`:null);
  const hasCommercialEvidence=independent>=2;
  const hasPositionEvidence=Boolean(purchasePurpose)&&position.length>=2;
  const recommended=demand!==null&&demand>0&&hasCommercialEvidence&&hasPositionEvidence;
  const reasons=[];
  if(demand===null)reasons.push('No exact Alura demand estimate for this direction.');
  if(independent<2)reasons.push('Fewer than two independent sellers have a positive recent-sales estimate in the comparable sample.');
  if(!hasPositionEvidence)reasons.push('The sampled listings do not explicitly establish both a buyer group and a specific position.');
  return {direction,etsy:{direct,adjacent},commercial:{records,comparable,populated,active,independent},demand,
    audience:purchasePurpose,explicitAudience:audiences[0]||null,observedPosition:position.slice(0,4),recommended,reasons,
    conclusion:recommended?'Supported for controlled validation; estimates are comparative evidence, not a sales forecast.':'No supported target from this direction yet.'};
}

export function chooseProductTarget(assessments){
  const supported=assessments.filter(item=>item.recommended);
  if(!supported.length)return {status:'abstain',winner:null,alternatives:assessments};
  // Deterministic evidence ordering only; this is a tie-breaker after all
  // required evidence is present, not an opportunity score.
  supported.sort((a,b)=>b.commercial.independent-a.commercial.independent||
    b.commercial.active.length-a.commercial.active.length||a.direction.phrase.localeCompare(b.direction.phrase));
  return {status:'supported',winner:supported[0],alternatives:assessments.filter(item=>item!==supported[0])};
}
