import {discoverKeywords,listingRelevance,normalizePhrase,wordTokens} from './discovery.js';
import {generateProductConcepts} from './concepts.js';

const canonical = value => String(value || '').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
const finiteCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

// A report keeps the providers' measurements separate. Etsy's broad count is
// never treated as demand or as the number of comparable digital products.
export function buildResearchReport(keyword, etsy, alura = null, purchase = null) {
  const sample=Array.isArray(etsy?.sample) ? etsy.sample : [];
  const relevant=sample.filter(item=>listingRelevance(keyword,item)!=='irrelevant');
  const competitors=relevant.filter(item=>item.listingType==='download');
  const demandRows=[alura?.exact,...(alura?.related||[])].filter(Boolean);
  const demand=demandRows.find(row=>canonical(row.keyword)===canonical(keyword)) || null;
  const prices={};
  for(const item of competitors){
    if(!Number.isFinite(item.price) || !item.currency)continue;
    (prices[item.currency] ||= []).push(item.price);
  }
  const priceRanges=Object.entries(prices).map(([currency,values])=>({
    currency,min:Math.min(...values),max:Math.max(...values),count:values.length
  })).sort((a,b)=>b.count-a.count||a.currency.localeCompare(b.currency));
  const tagMap=new Map();
  for(const item of competitors){
    for(const raw of item.tags||[]){
      const phrase=normalizePhrase(raw);
      if(wordTokens(phrase).length<2||phrase===normalizePhrase(keyword))continue;
      const entry=tagMap.get(phrase)||{phrase,listingIds:new Set()};
      entry.listingIds.add(String(item.id));tagMap.set(phrase,entry);
    }
  }
  const advertisedTerms=[...tagMap.values()].map(item=>({phrase:item.phrase,listingIds:[...item.listingIds]}))
    .sort((a,b)=>b.listingIds.length-a.listingIds.length||a.phrase.localeCompare(b.phrase)).slice(0,8);
  const directions=discoverKeywords(keyword,sample);
  const concepts=generateProductConcepts(keyword,sample);
  const reviewEvidence=Array.isArray(purchase?.evidence) ? purchase.evidence : [];
  const datedReviews=reviewEvidence.filter(item=>finiteCount(item.reviewCount90d)>0);
  let nextAction;
  if(!sample.length)nextAction='Retry the Etsy listing lookup before comparing products.';
  else if(!competitors.length)nextAction='Refine the keyword toward a digital format and inspect the resulting listings.';
  else if(!concepts.length)nextAction='Narrow the search toward a specific buyer problem and product format, then inspect competitor descriptions for advertised functionality.';
  else if(demand?.estimatedSearchesMonthly==null)nextAction='Validate buyer search interest for this exact direction before committing to a product.';
  else if(demand.estimatedSearchesMonthly===0)nextAction='Check nearby buyer phrases and another source before treating this zero estimate as no market.';
  else if(!datedReviews.length)nextAction='Inspect dated reviews or another purchase-linked source for these specific competitors.';
  else nextAction='Inspect the products and reviews behind the proposed difference, then test that positioning with buyers.';
  return {
    keyword,
    demand:{measurement:demand?.estimatedSearchesMonthly ?? null,period:alura?.searchPeriod||null,
      asOf:demand?.asOf||null,source:demand?'Alura API estimate':null,
      competingListings:demand?.competingListings ?? null,geography:alura?.geography||null},
    supply:{broadMatches:finiteCount(etsy?.totalListings),sampleSize:sample.length,
      relevantCount:relevant.length,digitalCompetitorCount:competitors.length,
      priceRanges,source:etsy?.source||'Etsy Open API v3',fetchedAt:etsy?.fetchedAt||null,
      marketCaveat:'Etsy keyword results are not localized buyer-search measurements.'},
    purchase:{status:datedReviews.length?'dated reviews observed':'unverified',
      datedReviewListings:datedReviews.length,reviewEvidence,
      caveat:'Favorites are engagement, not purchases. A dated review indicates a prior purchase, not its purchase date. Shop-wide sales and listing age are not listing sales.'},
    competitors:competitors.slice(0,12),advertisedTerms,directions:directions.slice(0,16),concepts,
    conclusion:sample.length===0?'No Etsy sample is available yet. The market cannot be assessed.':
      `${competitors.length} of ${sample.length} sampled Etsy listings are relevant digital competitors. `+
      (demand?.estimatedSearchesMonthly!=null?'Alura estimates search interest for this exact phrase. ':'Demand for this exact phrase is unmeasured here. ')+
      (datedReviews.length?'Some sampled listings have dated review evidence.':'Recent purchasing activity has not been verified.'),
    nextAction
  };
}
