// Candidate phrases are research directions found in a relevance-ranked sample, not demand estimates.
const STOP = new Set(['a','an','and','for','in','of','on','or','the','to','with','your','you','my','new']);
const ALIASES = [
  ['mom','mother','mum','parent'],['dad','father','parent'],['baby','infant','newborn'],
  ['kid','child','children','toddler'],['planner','organizer','organiser'],
  ['budget','finance','expense'],['wedding','bridal'],['meal','food'],
  ['resume','cv'],['teacher','educator'],['pet','animal'],['habit','routine']
];
const FORMATS = new Set(['template','printable','spreadsheet','planner','tracker','checklist','worksheet','calendar','journal','guide','bundle','chart','invitation','pattern']);
const AUDIENCES = new Set(['mom','mother','mum','dad','father','parent','family','baby','infant','newborn','kid','child','children','toddler','teacher','educator','student','bride','couple','freelancer','freelancing','adhd','business','pet']);
const NEEDS = new Set(['budget','finance','expense','meal','food','habit','routine','wedding','bridal','fitness','cleaning','travel','sleep','school','work']);
const normalizeToken = token => token.length > 4 && token.endsWith('ies') ? token.slice(0,-3)+'y' :
  token.length > 4 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0,-1) : token;
export const wordTokens = text => (String(text||'').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).map(normalizeToken);
export const normalizePhrase = text => wordTokens(text).join(' ').trim();
const core = text => wordTokens(text).filter(t=>!STOP.has(t));
const equivalent = (a,b) => a===b || ALIASES.some(group=>group.includes(a)&&group.includes(b));

export function listingRelevance(seed, listing) {
  const wanted=[...new Set(core(seed))];
  const actual=new Set([...wordTokens(listing?.title),...(Array.isArray(listing?.tags)?listing.tags:[]).flatMap(wordTokens)]);
  if(!wanted.length||!actual.size)return 'irrelevant';
  if(wanted.every(token=>actual.has(token)))return 'exact';
  return wanted.every(token=>[...actual].some(found=>equivalent(token,found)))?'semantic':'irrelevant';
}

function groupFor(phrase, seed) {
  const terms=core(phrase);
  return {
    audience:terms.find(t=>AUDIENCES.has(t))||'general',
    need:terms.find(t=>NEEDS.has(t))||core(seed)[0]||'other',
    intent:terms.find(t=>FORMATS.has(t))||'unspecified format'
  };
}
export const groupPhrase = (phrase,seed=phrase) => groupFor(phrase,seed);

// A second, explicitly labelled query can surface digital evidence when a broad
// physical search fills the entire first page. Its results are never combined
// with the original query's supply observation.
export function digitalFollowUpQuery(seed, sample) {
  const query=String(seed||'').trim();
  if(!query||query.length>72||!Array.isArray(sample)||!sample.length||
     /\b(digital|download)\b/i.test(query)||sample.some(item=>item.listingType==='download'))return null;
  return `${query} digital`;
}

export async function collectDiscoveryEvidence(seed, fetchObservation) {
  const primary=await fetchObservation(seed);
  const followUpQuery=digitalFollowUpQuery(seed,primary.sample);
  if(!followUpQuery)return {primary,discovery:primary,followUpQuery:null,followUpFailed:false};
  try {
    const discovery=await fetchObservation(followUpQuery);
    return {primary,discovery,followUpQuery,followUpFailed:false};
  } catch {
    return {primary,discovery:primary,followUpQuery,followUpFailed:true};
  }
}

export function discoverKeywords(seed, sample) {
  const query=normalizePhrase(seed);
  if(!core(query).length||!Array.isArray(sample)||!sample.length)return [];
  const candidates=new Map();
  const add=(text,origin,listing,match)=>{
    const phrase=wordTokens(text).filter((word,index,all)=>index!==0&&index!==all.length-1||!STOP.has(word)).join(' '),words=core(phrase);
    if(words.length<2||words.length>6||phrase===query)return;
    // The phrase itself must retain a seed concept or a documented synonym.
    if(listingRelevance(seed,{title:phrase,tags:[]})==='irrelevant')return;
    const key=phrase;
    const current=candidates.get(key)||{keyword:phrase,kind:'observed',origins:new Set(),listingIds:new Set(),listingTypes:new Set(),match,group:groupFor(phrase,seed)};
    current.origins.add(origin);
    if(listing?.id!=null)current.listingIds.add(String(listing.id));
    if(listing?.listingType)current.listingTypes.add(listing.listingType);
    if(match==='exact')current.match='exact';
    candidates.set(key,current);
  };
  for(const listing of sample){
    const match=listingRelevance(seed,listing);
    if(match==='irrelevant')continue;
    for(const tag of (Array.isArray(listing.tags)?listing.tags:[]).slice(0,13))add(tag,'tag',listing,match);
    const words=wordTokens(listing.title);
    for(let i=0;i<words.length-1;i++){
      const segment=words.slice(i,i+4);
      if(segment.length>=2)add(segment.join(' '),'title',listing,match);
    }
  }
  const observed=[...candidates.values()].sort((a,b)=>b.listingIds.size-a.listingIds.size||a.keyword.localeCompare(b.keyword)).slice(0,40);
  const generated=[];
  // Only propose a replacement when a synonym actually explained a semantic match.
  for(const item of observed.filter(x=>x.match==='semantic')){
    const words=wordTokens(item.keyword);
    const wanted=core(seed);
    const replacement=wanted.find(t=>!words.includes(t)&&words.some(w=>equivalent(t,w)));
    if(!replacement)continue;
    const index=words.findIndex(w=>equivalent(replacement,w));
    const phrase=words.map((w,i)=>i===index?replacement:w).join(' ');
    if(phrase!==query&&!candidates.has(phrase)&&!generated.some(x=>x.keyword===phrase))
      generated.push({keyword:phrase,kind:'hypothesis',origins:[],listingIds:[],listingTypes:[],match:'semantic',group:groupFor(phrase,seed),basis:item.keyword});
    if(generated.length>=8)break;
  }
  return [...observed.map(x=>({...x,origins:[...x.origins],listingIds:[...x.listingIds],listingTypes:[...x.listingTypes]})),...generated];
}

export function groupDiscovered(candidates){
  const groups=new Map();
  for(const candidate of candidates){
    const {need,audience,intent}=candidate.group;
    const key=`${need}|${audience}|${intent}`;
    if(!groups.has(key))groups.set(key,{need,audience,intent,candidates:[]});
    groups.get(key).candidates.push(candidate);
  }
  return [...groups.values()];
}
