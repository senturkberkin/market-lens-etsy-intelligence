import {discoverKeywords,groupPhrase,listingRelevance,wordTokens} from './discovery.js';

const titleCase = value => value.replace(/\b\p{L}/gu, letter=>letter.toUpperCase());
const formatFromPhrase = (candidate) => candidate.group.intent==='unspecified format'
  ? wordTokens(candidate.keyword).at(-1) || 'digital product' : candidate.group.intent;
const mentions = (listing, term) => wordTokens(`${listing.title} ${(listing.tags||[]).join(' ')}`).includes(term);

export function generateProductConcepts(keyword, sample) {
  if(!Array.isArray(sample))return [];
  const relevant=sample.filter(x=>x?.listingType==='download'&&x.id!=null&&listingRelevance(keyword,x)!=='irrelevant');
  if(relevant.length<2)return [];
  const candidates=discoverKeywords(keyword,relevant).filter(x=>x.kind==='observed'&&x.listingIds.length>=2);
  if(!candidates.length){
    const group=groupPhrase(keyword);
    if(group.intent==='unspecified format')group.intent=groupPhrase(relevant[0].title).intent;
    candidates.push({keyword,kind:'observed',listingIds:relevant.map(x=>String(x.id)),origins:['query and sampled listings'],group});
  }
  const concepts=[],seen=new Set();
  for(const candidate of candidates){
    const format=formatFromPhrase(candidate);
    const audience=candidate.group.audience==='general'
      ? `People working on ${keyword}` : candidate.group.audience==='adhd' ? 'People with ADHD' :
        candidate.group.audience==='freelancing' ? 'Freelancers' : candidate.group.audience;
    const identity=`${candidate.group.audience}|${format}|${candidate.group.need}`;
    if(seen.has(identity))continue;
    seen.add(identity);
    const supporting=relevant.filter(x=>candidate.listingIds.includes(String(x.id))).slice(0,3)
      .map(x=>({id:String(x.id),title:x.title,url:x.url||null}));
    const term=candidate.group.audience!=='general'?candidate.group.audience:format;
    const mentioned=relevant.filter(x=>mentions(x,term));
    const observed=`${mentioned.length} of ${relevant.length} relevant sampled digital listings mention “${term}” in title or tags.`;
    const possibleDifference=mentioned.length<relevant.length
      ? `A ${term}-focused version may be worth testing; absence from some sampled text does not prove a market gap.`
      : `No uncommon ${term} positioning was found in this sample; inspect functionality before claiming a gap.`;
    concepts.push({
      id:`concept-${concepts.length+1}`,keyword,
      name:titleCase(candidate.keyword),audience,
      problem:`Organize or manage ${candidate.group.need} tasks for ${audience.toLowerCase()}.`,
      format,coreFunctionality:`A digital ${format} organized around ${candidate.keyword}.`,
      potentialDifferentiation:possibleDifference,
      gapAssessment:{status:'hypothesis',observed, inference:possibleDifference,
        supportingListings:supporting,mentionCount:mentioned.length,comparisonCount:relevant.length},
      provenance:{phrase:candidate.keyword,origins:candidate.origins,observedListingCount:candidate.listingIds.length}
    });
    if(concepts.length>=5)break;
  }
  return concepts;
}
