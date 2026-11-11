import {extractListingCharacteristics,groupProductEvidence,relevantDigitalListings} from './product-evidence.js';
import {normalizePhrase,wordTokens} from './discovery.js';

const titleCase=value=>value.replace(/\b\p{L}/gu,letter=>letter.toUpperCase());
const generic=/\b(?:digital|instant|download|printable|editable|template|file|files|gift|art|wall|print|poster|pdf|svg|dxf)\b/gi;
const meaningful=value=>normalizePhrase(String(value||'').replace(generic,'')).split(' ').filter(Boolean);
const evidenceLink=claim=>({id:claim.listingId,url:claim.listingUrl,field:claim.field,quote:claim.quote,value:claim.value,kind:claim.kind});
const unique=claims=>[...new Map(claims.map(item=>[normalizePhrase(item.value),item])).values()];
const shared=(a,b)=>{
  const left=new Set(wordTokens(a)),right=new Set(wordTokens(b));
  return [...left].filter(token=>right.has(token)).length/Math.max(left.size,right.size,1);
};
const coMentioned=(a,b,listings)=>listings.some(item=>{
  const text=normalizePhrase(`${item.title||''} ${item.description||''} ${(item.tags||[]).join(' ')}`);
  return text.includes(normalizePhrase(a.value))&&text.includes(normalizePhrase(b.value));
});

export function generateProductConcepts(keyword,sample){
  const relevant=relevantDigitalListings(keyword,sample);
  if(relevant.length<2)return [];
  const groups=groupProductEvidence(keyword,relevant);
  const concepts=[],used=new Set();
  for(const group of groups){
    const records=group.records;
    const allFunctions=records.flatMap(row=>row.functions);
    const allFeatures=records.flatMap(row=>row.features)
      .filter(item=>item.field!=='tag'&&meaningful(item.value).length>=2&&shared(group.phrase,item.value)<0.7)
      .sort((a,b)=>Number(b.field==='description')-Number(a.field==='description'));
    const distinctFeatures=unique(allFeatures);
    const functionClaim=allFunctions.find(item=>meaningful(item.value).length>=1);
    if(!functionClaim||distinctFeatures.length<2)continue;
    const audienceClaim=records.flatMap(row=>row.audiences)
      .find(item=>meaningful(item.value).length>=1);
    if(!audienceClaim)continue;
    const supporting=records.slice(0,4).map(row=>({id:row.listingId,title:row.title,url:row.url}));
    let firstFeature=null,secondFeature=null;
    for(const a of distinctFeatures){
      const b=distinctFeatures.find(item=>item.listingId!==a.listingId&&
        shared(a.value,item.value)<0.7&&!coMentioned(a,item,relevant));
      if(b){firstFeature=a;secondFeature=b;break}
    }
    if(!firstFeature)continue;
    const format=group.head;
    const formatClaim=records.flatMap(row=>row.formats).find(item=>item.value===format);
    if(!formatClaim)continue;
    const purpose=normalizePhrase(functionClaim.value);
    const audience=audienceClaim.value;
    const problem=`Need to ${purpose}`;
    const identity=`${records.map(row=>row.listingId).sort().join(',')}|${normalizePhrase(functionClaim.value)}|${normalizePhrase(audience)}`;
    if(used.has(identity))continue;
    used.add(identity);
    const features=[firstFeature,secondFeature].map(evidenceLink);
    const difference=`Test a ${group.phrase} that combines “${firstFeature.value}” and “${secondFeature.value}” for ${audience.toLowerCase()}. The sampled text does not establish an unmet need.`;
    const observed=`${records.length} relevant downloadable Etsy listings advertise this product direction; the cited text supports the audience, function, and feature claims shown below.`;
    concepts.push({
      id:`concept-${concepts.length+1}`,keyword,name:titleCase(group.phrase),audience,
      problem,format,coreFunctionality:functionClaim.value,
      includedFeatures:features.map(item=>item.value),potentialDifferentiation:difference,
      characteristics:{audience:evidenceLink(audienceClaim),
        problem:{kind:'inferred',value:problem,basis:evidenceLink(functionClaim)},
        format:evidenceLink(formatClaim),function:evidenceLink(functionClaim),features},
      gapAssessment:{status:'hypothesis',observed,inference:difference,
        supportingListings:supporting,featureEvidence:features,comparisonCount:records.length},
      provenance:{phrase:group.phrase,aliases:group.aliases,observedListingCount:records.length}
    });
  }
  return concepts;
}

export function explainConceptAbstention(keyword,sample){
  const relevant=relevantDigitalListings(keyword,sample);
  if(relevant.length<2)return 'Fewer than two relevant downloadable listings were returned.';
  if(!groupProductEvidence(keyword,relevant).length)return 'The sample does not show a specific digital product offered by more than one relevant listing.';
  const records=relevant.map(extractListingCharacteristics).filter(Boolean);
  if(!records.some(row=>row.functions.length))return 'The returned listing text does not clearly describe what the product does.';
  if(records.flatMap(row=>row.features).filter(row=>row.field!=='tag').length<2)
    return 'The listings do not describe enough included functionality to support a specific product difference.';
  return 'The sample does not support a specific audience, format, and differentiation hypothesis together.';
}
