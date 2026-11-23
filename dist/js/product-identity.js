import {extractListingCharacteristics} from './product-evidence.js';
import {wordTokens} from './discovery.js';

const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
export const titleParts = title => String(title || '').split(/\s*[,;|:–—()\n]\s*|\s+-\s+/).map(t=>t.trim()).filter(Boolean);
export const deliveryWords = /\b(?:instant download|digital download|instant|downloadable|digital|printable|download)\b/gi;
const encoding = /\b(?:pdf|svg|png|jpeg|jpg|xlsx|stl|dxf|epub|psd|wif|google sheets|excel|canva|procreate|notion)\b/gi;
const functional = /\b(?:editable|customi[sz]able|personali[sz]ed|print at home|printable|layered|fillable|seamless)\b/gi;
export function productName(title) {
  let first = titleParts(title)[0] || '';
  const modifier = first.search(/\s+(?:printable|instant download|digital download)\b/i);
  if (modifier>0 && wordTokens(first.slice(0,modifier)).length>=2) first=first.slice(0,modifier);
  return normalize(first.split(/\s+(?:for|with|to|includes?|featuring)\s+/i)[0].replace(deliveryWords,'').replace(/^[\s+\d]+\s+|[\s-]+$/g,''));
}

const cache = new WeakMap();
export function listingIdentity(listing) {
  if (cache.has(listing)) return cache.get(listing);
  const claims = extractListingCharacteristics(listing);
  const cite = (value,field,quote)=>({value,field,quote,listingId:String(listing.id),listingUrl:listing.url});
  const name=productName(listing.title);
  const segments=(claims?.audiences || []).filter(c=>!/^\w+ing\s/i.test(c.value));
  const purposes=[];
  // Explicit purpose clauses carry arbitrary seller vocabulary. A file
  // extension never supplies an action, buyer or compatibility claim.
  for (const part of titleParts(listing.title)) {
    const purpose=part.match(/\b(?:for|to)\s+([^,;:|]{3,60})$/i)?.[1];
    if(purpose && /^(?:kids|children|adults)\b/i.test(purpose))
      segments.push(cite(normalize(purpose),'title',part));
    if (purpose && !segments.some(s=>normalize(purpose).startsWith(normalize(s.value))) &&
      !/\b(?:gift|download|printing|sale|personal use|commercial use)\b/i.test(purpose))
      purposes.push(cite(normalize(purpose),'title',part));
  }
  const observations=[['title',listing.title],...(listing.tags||[]).map(t=>['tag',t])];
  const claimsFor=pattern=>observations.flatMap(([field,quote])=>
    [...String(quote).matchAll(pattern)].map(match=>cite(normalize(match[0]),field,quote)));
  const result={core:cite(name,'title',listing.title),purposes:[...purposes,...(claims?.functions||[])],
    segments,formats:claimsFor(encoding),functionality:claimsFor(functional),
    features:claims?.features||[],tags:(listing.tags||[]).map(t=>cite(normalize(t),'tag',t))};
  cache.set(listing,result);
  return result;
}

// Collapse labels only where the same delivered object is evidenced. A
// contextual modifier may be a buying purpose. Preserve it when sellers
// explicitly advertise different uses for otherwise identical products.
const useWords = value=>wordTokens(value).filter(t=>!['to','for','the','my','your','and'].includes(t));
const actionFamilies=[['track','tracking','record','recording','log','logging'],['compute','computing','calculate','calculating']];
const usageKey = value=>useWords(value).map(w=>actionFamilies.find(f=>f.includes(w))?.[0]||w).sort().join(' ');
function useClaim(row,core) {
  const id=listingIdentity(row);
  const explicit=id.purposes.find(p=>p.field==='title') || id.purposes.find(p=>
    useWords(p.value).some(w=>!useWords(core).includes(w) && wordTokens(row.title).includes(w)));
  if(explicit)return explicit;
  // A qualified occupational/activity phrase can distinguish two uses even
  // if no seller writes "used for". Keep its exact text and its inferred status.
  for(const part of titleParts(row.title).slice(1)){
    const name=productName(part),tokens=useWords(name);
    if(tokens.length<2 || tokens.length>6)continue;
    const qualifier=tokens.slice(0,-1).find(w=>!useWords(core).includes(w) && /ing$/.test(w));
    if(qualifier && !id.formats.some(f=>f.value===qualifier))
      return {...id.core,value:qualifier,quote:part,kind:'inferred use'};
  }
}
export function scopeMatches(scope,listing,classifyName) {
  const labels=scope.names.map(name=>classifyName(name,listing));
  if (!labels.includes('direct')) return labels.includes('adjacent')?'adjacent':labels.includes('uncertain')?'uncertain':'irrelevant';
  if (!scope.purpose) return 'direct';
  const id=listingIdentity(listing);
  const use=useClaim(listing,scope.core);
  if ([...id.purposes,use].some(p=>p && usageKey(p.value)===usageKey(scope.purpose))) return 'direct';
  return use?'adjacent':'uncertain';
}

export function identityScopes(name,rows) {
  const groups=new Map();
  for (const row of rows) {
    const purpose=useClaim(row,name);
    if (!purpose) continue;
    const k=usageKey(purpose.value);
    if (!groups.has(k)) groups.set(k,{purpose:purpose.value,claim:purpose,rows:[]});
    groups.get(k).rows.push(row);
  }
  // Split only on advertised uses. Without explicit alternatives the query
  // describes the deliverable, and a seller's unique use stays a citation.
  const contested=groups.size>1 || [...groups.values()].some(g=>g.claim.kind==='inferred use' && g.rows.length<rows.length);
  const scopes=contested?[...groups.values()]:[{rows,purpose:null}];
  return scopes.map(({rows:members,purpose,claim})=>{
    const ids=members.map(listingIdentity);
    const variations=ids.map(id=>({...id.core,value:useWords(id.core.value)
      .filter(w=>!useWords(name).includes(w)).join(' '),kind:'observed modifier'})).filter(v=>v.value);
    const phrase=claim?.kind==='inferred use' && ids.every(id=>id.core.value===ids[0].core.value) &&
      useWords(ids[0].core.value).includes(purpose)?ids[0].core.value:purpose?name+' for '+purpose:name;
    const identity={names:[name],core:name,purpose,query:phrase,variations,
      evidence:ids,listingIds:members.map(r=>String(r.id))};
    return {identity,phrase,members};
  });
}
