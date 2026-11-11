import {listingRelevance,normalizePhrase,wordTokens} from './discovery.js';

const STOP=new Set(['a','an','and','as','by','digital','download','editable','file','files','for','from','in','instant','of','on','or','printable','the','to','with','your']);
// Generic activity verbs, not a catalogue of product niches or buyer needs.
// The object of the verb always comes from the listing's own words.
const ACTION=/\b(track|record|log|plan|schedule|calculate|manage|organize|organise|monitor|design|create|customize|customise|edit|map|teach|learn|measure|compare|budget|journal|document|catalog|catalogue|analyze|analyse|visualize|visualise|display|estimate|forecast|prepare|build)(?:s|ed|ing)?\b\s+(?:your\s+|the\s+|a\s+|an\s+)?([\p{L}\p{N}][\p{L}\p{N}\s'-]{2,65})/iu;
const NON_AUDIENCE=/^(?:you|your|me|use|download|printing|print|home|office|wall|room|sale|commercial|personal|instant|all|any|everyone|gift|gifts|today)$/i;
const GENERIC=/^(?:digital|instant|download|printable|editable|custom|personalized|personalised|handmade|pdf|svg|dxf|png|jpg|template|file|files|art|wall|print|poster)$/i;
const tidy=value=>String(value||'').replace(/&(?:amp|quot|apos|#39|lt|gt);/gi,entity=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&#39;':"'",'&lt;':'<','&gt;':'>'}[entity.toLowerCase()]||entity))
  .replace(/\s+/g,' ').trim();
const words=value=>wordTokens(value).filter(token=>!STOP.has(token));
const looksLikeBuyer=value=>{
  const text=String(value||'').trim();
  if(/[a-z][A-Z]/.test(text)||/\d/.test(text))return false;
  const end=text.split(/\s+/).at(-1)?.toLowerCase()||'';
  return /s$/.test(end)||/^(?:people|anyone|someone|everybody|men|women|children)$/i.test(end);
};
const stem=token=>token.length>6&&token.endsWith('ing')?token.slice(0,-3):token.length>5&&token.endsWith('ed')?token.slice(0,-2):token;
const meaning=value=>[...new Set(words(value).map(stem))].sort();
const overlap=(a,b)=>{
  const left=new Set(meaning(a)),right=new Set(meaning(b));
  const common=[...left].filter(x=>right.has(x)).length;
  return common/Math.max(left.size,right.size,1);
};
const claim=(listing,field,quote,value,kind='observed')=>({
  value:tidy(value),kind,listingId:String(listing.id),listingUrl:listing.url||null,
  field,quote:tidy(quote).slice(0,180)
});
const clauses=(listing)=>{
  const rows=[{field:'title',text:listing.title},
    ...(Array.isArray(listing.tags)?listing.tags:[]).map(text=>({field:'tag',text})),
    ...String(listing.description||'').split(/[.!?\n•]+/).slice(0,12).map(text=>({field:'description',text}))];
  return rows.map(row=>({...row,text:tidy(row.text)})).filter(row=>row.text.length>=4&&row.text.length<=240);
};
const featureLines=listing=>{
  const lines=String(listing.description||'').split(/\r?\n/).map(tidy);
  const rows=[];let inside=0;
  for(const line of lines){
    if(/^(?:what(?:'s| is| you get| you receive)?|inside|included|includes|features|pages|worksheets|modules|templates|contents)\b.{0,32}:?$/i.test(line)){
      inside=12;continue;
    }
    if(/^[A-Z][A-Z\s&'-]{5,50}$/.test(line)&&inside){inside=0;continue}
    if(!inside||!line)continue;
    inside--;
    const value=line.replace(/^[\s\p{Emoji_Presentation}✓✔✦✧•*\-–—\d.)]+/gu,'').split(/\s+(?:—|–|:)\s+/)[0].trim();
    if(value.length<4||value.length>90||/\b(?:download|shipping|refund|copyright|license|printer|purchase|files? you receive)\b/i.test(value))continue;
    if(words(value).length>=2&&words(value).length<=9)rows.push(claim(listing,'description',line,value));
  }
  return rows;
};

export function extractListingCharacteristics(listing){
  if(!listing?.id||listing.listingType!=='download')return null;
  const statements=clauses(listing);
  const audiences=[],functions=[],features=featureLines(listing),formats=[];
  for(const row of statements){
    const text=row.text;
    const forMatch=text.match(/\b(?:designed|made|ideal|perfect|created)?\s*for\s+([\p{L}\p{N}][\p{L}\p{N}'-]*(?:\s+[\p{L}\p{N}][\p{L}\p{N}'-]*){0,3})/iu);
    if(forMatch&&!NON_AUDIENCE.test(forMatch[1])){
      const value=forMatch[1].split(/\b(?:with|who|that|using|to|and|in|on)\b/i)[0].trim();
      if(words(value).length>=1&&words(value).length<=4&&looksLikeBuyer(value))audiences.push(claim(listing,row.field,text,value));
    }
    const action=row.field==='description'?text.match(ACTION):null;
    if(action){
      const object=action[2].split(/\b(?:with|for|and|while|using|including|in|on|by)\b|[,;|–—]/i)[0].trim().split(/\s+/).slice(0,5).join(' ');
      if(words(object).length>=1)functions.push(claim(listing,row.field,text,`${action[1]} ${object}`));
    }
    const withMatch=text.match(/\b(?:with|includes?|featuring|contains?)\s+([^;|–—.!?]{4,120})/iu);
    if(withMatch){
      for(const part of withMatch[1].split(/,|\band\b|\bplus\b/i)){
        const value=part.split(/\b(?:for|to)\b/i)[0].trim().replace(/^(?:a|an|the)\s+/i,'').split(/\s+/).slice(0,6).join(' ');
        if(words(value).length>=2)features.push(claim(listing,row.field,text,value));
      }
    }
    if(row.field==='tag'&&words(text).length>=2&&!/\b(?:download|gift|sale)\b/i.test(text))
      features.push(claim(listing,row.field,text,text));
  }
  const title=tidy(listing.title).split(/[|,;–—]/)[0].split(/\bfor\b/i)[0].trim();
  const productPhrases=[title,...statements.filter(x=>x.field==='tag').map(x=>x.text)]
    .map(value=>normalizePhrase(value.split(/\bfor\b/i)[0])).filter(value=>{
      const terms=words(value);
      return terms.length>=2&&terms.length<=6&&terms.some(term=>!GENERIC.test(term));
    });
  for(const phrase of productPhrases){
    const last=words(phrase).at(-1);
    if(last&&statements.some(row=>wordTokens(row.text).includes(last)))formats.push(claim(listing,'title/tag',phrase,last,'inferred'));
  }
  const unique=rows=>[...new Map(rows.map(row=>[normalizePhrase(row.value),row])).values()];
  return {listingId:String(listing.id),url:listing.url||null,title:tidy(listing.title),
    audiences:unique(audiences),functions:unique(functions),features:unique(features),
    formats:unique(formats),productPhrases:[...new Set(productPhrases)]};
}

export function relevantDigitalListings(keyword,sample){
  return (Array.isArray(sample)?sample:[]).filter(row=>row?.id!=null&&row.listingType==='download'&&listingRelevance(keyword,row)!=='irrelevant');
}

// Phrase groups are built from marketplace text, with no niche or audience catalogue.
// Token order and simple inflection are normalized; phrases repeated on the same
// listings may also join when they describe the same product head.
export function groupProductEvidence(keyword,sample){
  const relevant=relevantDigitalListings(keyword,sample);
  const records=relevant.map(extractListingCharacteristics).filter(Boolean);
  const groups=[];
  for(const record of records){
    for(const phrase of record.productPhrases){
      const terms=words(phrase),head=stem(terms.at(-1)||'');
      if(!head||terms.length<2||terms.filter(term=>!GENERIC.test(term)).length<1)continue;
      let group=groups.find(item=>item.head===head&&overlap(item.phrase,phrase)>=0.6);
      if(!group){group={phrase,head,aliases:[],listingIds:new Set()};groups.push(group)}
      group.listingIds.add(record.listingId);
      if(!group.aliases.includes(phrase))group.aliases.push(phrase);
      if(words(phrase).length>words(group.phrase).length&&words(phrase).length<=5)group.phrase=phrase;
    }
  }
  // Market language can call one product a log, journal, or tracker. Group
  // phrases that recur on the same listings and describe the same extracted
  // audience and function; this works for vocabulary absent from our code.
  const roleKey=group=>{
    const matches=records.filter(row=>group.listingIds.has(row.listingId));
    const shared=kind=>{
      const counts=new Map();
      for(const row of matches)for(const value of new Set(row[kind].map(item=>normalizePhrase(item.value))))
        counts.set(value,(counts.get(value)||0)+1);
      return [...counts].filter(([,count])=>count>=2).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||null;
    };
    const audience=shared('audiences'),functionText=shared('functions');
    return audience&&functionText?`${audience}|${functionText}`:null;
  };
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
    const a=groups[i],b=groups[j];
    const intersection=[...a.listingIds].filter(id=>b.listingIds.has(id)).length;
    if(intersection<2||intersection/Math.max(a.listingIds.size,b.listingIds.size)<0.8)continue;
    const role=roleKey(a);
    if(!role||role!==roleKey(b))continue;
    a.aliases.push(...b.aliases.filter(alias=>!a.aliases.includes(alias)));
    for(const id of b.listingIds)a.listingIds.add(id);
    const aFromTitle=records.some(row=>a.listingIds.has(row.listingId)&&normalizePhrase(row.title).startsWith(a.phrase));
    const bFromTitle=records.some(row=>b.listingIds.has(row.listingId)&&normalizePhrase(row.title).startsWith(b.phrase));
    if(bFromTitle&&!aFromTitle){a.phrase=b.phrase;a.head=b.head}
    groups.splice(j,1);j--;
  }
  return groups.filter(group=>group.listingIds.size>=2).sort((a,b)=>
    b.listingIds.size-a.listingIds.size||words(b.phrase).length-words(a.phrase).length||a.phrase.localeCompare(b.phrase))
    .map(group=>({...group,listingIds:[...group.listingIds],records:records.filter(row=>group.listingIds.has(row.listingId))}));
}
