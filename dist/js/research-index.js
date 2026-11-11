import {discoverKeywords,groupPhrase,listingRelevance,normalizePhrase,wordTokens} from './discovery.js';

const MAX_LISTING_AGE=6*60*60*1000;
const MAX=12;
export const INDEX_STORAGE_KEY='market-lens-observation-index-v1';

export function parseResearchInput(value){
  const input=String(value||'').trim();
  if(!input)return null;
  if(/^(https?:\/\/)?(?:www\.)?etsy\.com\//i.test(input)){
    const url=new URL(/^https?:\/\//i.test(input)?input:`https://${input}`);
    if(!['etsy.com','www.etsy.com'].includes(url.hostname.toLowerCase()))throw new Error('Use an Etsy listing or shop URL.');
    const parts=url.pathname.split('/').filter(Boolean);
    if(parts[0]?.toLowerCase()==='listing'&&/^[1-9]\d{0,18}$/.test(parts[1]||''))
      return {type:'listing',key:`listing:${parts[1]}`,id:parts[1],label:input};
    if(parts[0]?.toLowerCase()==='shop'&&/^[\p{L}\p{N}_-]{2,80}$/u.test(parts[1]||''))
      return {type:'shop',key:`shop:${parts[1].toLowerCase()}`,shop:parts[1],label:input};
    throw new Error('Use a direct Etsy listing or shop URL.');
  }
  if(/^https?:\/\//i.test(input))throw new Error('Use an Etsy URL or enter a keyword.');
  if(input.length<2||input.length>80)throw new Error('Enter 2–80 characters.');
  return {type:'keyword',key:`keyword:${normalizePhrase(input)}`,keyword:input,label:input};
}

export function directionsFromEvidence(parsed,payload){
  const sample=Array.isArray(payload?.sample)?payload.sample:[];
  if(parsed.type==='keyword'){
    const all=discoverKeywords(parsed.keyword,sample);
    const digital=discoverKeywords(parsed.keyword,sample.filter(x=>x.listingType==='download'));
    const merged=new Map(all.map(item=>[item.keyword,item]));
    for(const item of digital)if(!merged.has(item.keyword))merged.set(item.keyword,item);
    return [...merged.values()].sort((a,b)=>
      Number(b.listingTypes.includes('download'))-Number(a.listingTypes.includes('download'))||
      b.listingIds.length-a.listingIds.length||a.keyword.localeCompare(b.keyword)).slice(0,40);
  }
  const map=new Map();
  const add=(raw,item,origin)=>{
    const phrase=normalizePhrase(raw),words=wordTokens(phrase);
    if(words.length<2||words.length>6)return;
    const current=map.get(phrase)||{keyword:phrase,kind:'observed',origins:[],listingIds:[],listingTypes:[],group:groupPhrase(phrase)};
    if(!current.origins.includes(origin))current.origins.push(origin);
    if(item.id!=null&&!current.listingIds.includes(String(item.id)))current.listingIds.push(String(item.id));
    if(item.listingType&&!current.listingTypes.includes(item.listingType))current.listingTypes.push(item.listingType);
    map.set(phrase,current);
  };
  for(const item of sample){
    for(const raw of item.tags||[])add(raw,item,'Etsy listing tag');
    const titleWords=wordTokens(item.title);
    for(let i=0;i<Math.min(titleWords.length-1,6);i++)add(titleWords.slice(i,i+4).join(' '),item,'Etsy listing title');
  }
  return [...map.values()].sort((a,b)=>
    Number(b.listingTypes.includes('download'))-Number(a.listingTypes.includes('download'))||
    b.listingIds.length-a.listingIds.length||a.keyword.localeCompare(b.keyword)).slice(0,40);
}

export function indexObservation(parsed,payload,directions){
  const sample=(Array.isArray(payload?.sample)?payload.sample:[]).map(item=>({
    id:String(item.id),url:item.url||null,title:String(item.title||''),tags:Array.isArray(item.tags)?item.tags.slice(0,13):[],
    listingType:item.listingType||null,price:item.price??null,currency:item.currency||null,
    favorites:item.favorites??null,shopId:item.shopId||null,
    relevance:parsed.type==='keyword'?listingRelevance(parsed.keyword,item):'source listing'
  }));
  return {key:parsed.key,type:parsed.type,searchKeyword:parsed.keyword||payload.keyword||null,
    fetchedAt:payload.fetchedAt||new Date().toISOString(),source:payload.source||'Etsy Open API v3',
    sourceContext:payload.sourceContext||null,totalListings:payload.totalListings??null,
    returnedListingIds:sample.map(x=>x.id),listings:sample,
    relatedPhrases:directions.map(x=>({keyword:x.keyword,kind:x.kind,listingIds:x.listingIds,group:x.group,
      basisKeyword:x.basisKeyword||null})),
    scope:'Returned sample only; membership does not establish consistent ranking.'};
}

export function upsertResearchIndex(index,observation,now=Date.now()){
  const fresh=(Array.isArray(index)?index:[]).filter(x=>x?.key!==observation.key&&
    Number.isFinite(Date.parse(x?.fetchedAt))&&now-Date.parse(x.fetchedAt)<MAX_LISTING_AGE&&Date.parse(x.fetchedAt)<=now);
  return [observation,...fresh].slice(0,MAX);
}

export function cachedObservation(index,key,now=Date.now()){
  const found=(Array.isArray(index)?index:[]).find(x=>x.key===key);
  return found&&now-Date.parse(found.fetchedAt)<15*60*1000&&now>=Date.parse(found.fetchedAt)?found:null;
}

export function relatedIndexedKeywords(index,listingIds){
  const ids=new Set(listingIds.map(String));
  return (Array.isArray(index)?index:[]).filter(x=>x.type==='keyword')
    .map(x=>({keyword:x.searchKeyword,sharedListingIds:x.returnedListingIds.filter(id=>ids.has(String(id))),fetchedAt:x.fetchedAt}))
    .filter(x=>x.sharedListingIds.length)
    .sort((a,b)=>b.sharedListingIds.length-a.sharedListingIds.length);
}

export function pruneSavedBriefs(raw,now=Date.now()){
  return (Array.isArray(raw)?raw:[]).filter(item=>item?.keyword&&item?.concept?.name&&item?.savedAt)
    .map(item=>{
      const observedAt=Date.parse(item?.report?.supply?.fetchedAt);
      if(!item.report||Number.isFinite(observedAt)&&now-observedAt<MAX_LISTING_AGE&&observedAt<=now)return item;
      return {savedAt:item.savedAt,keyword:item.keyword,concept:{id:item.concept.id,name:item.concept.name},report:null};
    });
}
