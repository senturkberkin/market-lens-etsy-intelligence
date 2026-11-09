// Buyer activity is evidenced by dated reviews of relevant sampled listings.
// Sales numbers supplied by Alura remain estimates and are labelled separately.
import {timingSafeEqual} from 'node:crypto';

const BASE='https://api.alura.io/v1';
const ORIGINS=new Set(['https://senturkberkin.github.io','http://localhost:4173','http://127.0.0.1:4173','http://127.0.0.1:4174']);
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const words=value=>String(value||'').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu)||[];
const relevant=(seed,product)=>{
  const tokens=words(seed);
  const fields=[product.title,...(Array.isArray(product.tags)?product.tags:[])];
  return tokens.length>0&&fields.some(field=>tokens.every(token=>words(field).includes(token)));
};

export function normalizeBuyerPull(seed,products,reviewPages,from,checkedAt=new Date().toISOString()){
  if(!Array.isArray(products?.data)||!Array.isArray(reviewPages))throw new Error('Provider response has no product evidence.');
  const evidence=products.data.slice(0,3).map((product,index)=>{
    const page=reviewPages[index];
    const summary=page?.summary;
    const ready=summary?.status==='ready'&&summary.collected===true;
    const reviews=Array.isArray(page?.data)?page.data:[];
    const latest=reviews.map(item=>item.created_at).filter(value=>typeof value==='string'&&!Number.isNaN(Date.parse(value))&&value.slice(0,10)>=from).sort().at(-1)||null;
    const id=String(product.id||'');
    return {
      listingId:id,
      title:String(product.title||'Untitled listing'),
      url:/^[1-9]\d{0,18}$/.test(id)?`https://www.etsy.com/listing/${id}`:null,
      estimatedSalesLastMonth:count(product.sales?.est_last_month),
      reviewCount90d:ready?count(summary.count):null,
      latestReviewAt:latest,
      reviewStatus:ready?'observed':summary?.collected===false?'not collected':'unknown',
      asOf:typeof product.as_of==='string'?product.as_of:null
    };
  });
  return {
    query:seed,
    status:evidence.length?'sampled':'no-relevant-sample',
    sampleSize:evidence.length,
    listingsWithRecentReviews:evidence.filter(item=>item.reviewCount90d!==null&&item.reviewCount90d>0).length,
    evidence,
    reviewPeriodStart:from,
    checkedAt,
    source:'Alura API',
    method:'Dated Etsy listing reviews are observed purchase-linked evidence. They are not a count of all sales. Last-month sales figures are Alura estimates, not verified transactions.',
    maxIncludedCredits:13
  };
}

export async function fetchBuyerPull(seed,{apiKey,fetchImpl=fetch,now=new Date()}={}){
  if(!apiKey)throw new Error('Buyer activity provider is not configured.');
  const headers={Authorization:`Bearer ${apiKey}`,Accept:'application/json'};
  const request=async path=>{
    const response=await fetchImpl(`${BASE}${path}`,{headers});
    if(response.status===401||response.status===403)throw new Error('Buyer activity provider access was rejected.');
    if(response.status===402)throw new Error('Included Free-plan credits are exhausted.');
    if(response.status===429)throw new Error('Buyer activity provider rate limit reached.');
    if(!response.ok)throw new Error(`Buyer activity provider returned ${response.status}.`);
    return response.json();
  };
  const usage=await request('/usage');
  if(String(usage.plan).toLowerCase()!=='free')throw new Error('Buyer activity check is disabled outside the Free plan.');
  if(!Number.isSafeInteger(usage.credits?.remaining)||usage.credits.remaining<13)
    throw new Error('Buyer activity check is disabled with fewer than 13 included Free-plan credits.');
  const search=new URL(`${BASE}/research/products`);
  search.searchParams.set('q',seed);
  search.searchParams.set('limit','10');
  search.searchParams.set('fields','id,title,url,tags,sales.est_last_month,as_of');
  const products=await request(`/research/products${search.search}`);
  if(!Array.isArray(products?.data))throw new Error('Provider response has no product evidence.');
  const sample=products.data.filter(product=>relevant(seed,product)).slice(0,3);
  const from=new Date(now.valueOf()-90*86400000).toISOString().slice(0,10);
  const reviewPages=[];
  for(const product of sample){
    if(!/^[1-9]\d{0,18}$/.test(String(product.id||''))){reviewPages.push(null);continue}
    try{
      reviewPages.push(await request(`/research/products/${product.id}/reviews?from=${from}&limit=1`));
    }catch{reviewPages.push(null)}
  }
  return normalizeBuyerPull(seed,{data:sample},reviewPages,from,now.toISOString());
}

export default async function handler(req,res){
  const origin=req.headers?.origin;
  if(ORIGINS.has(origin))res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Accept, X-Research-Token');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
  const expected=process.env.ZETY_ACCESS_TOKEN;
  if(!expected||expected.length<24)return res.status(503).json({error:'Personal access is not configured.'});
  const supplied=String(req.headers?.['x-research-token']||'');
  const a=Buffer.from(expected),b=Buffer.from(supplied);
  if(a.length!==b.length||!timingSafeEqual(a,b))return res.status(401).json({error:'Personal access key was rejected.'});
  const seed=String(req.query?.keyword||'').trim();
  if(seed.length<2||seed.length>80)return res.status(400).json({error:'Enter a keyword of 2–80 characters.'});
  try{
    const data=await fetchBuyerPull(seed,{apiKey:process.env.ALURA_API_KEY});
    res.setHeader('Cache-Control','private, no-store');
    return res.status(200).json(data);
  }catch(error){
    const message=error instanceof Error?error.message:'Buyer activity is unavailable.';
    const status=message.includes('not configured')||message.includes('disabled')?503:502;
    return res.status(status).json({error:message});
  }
}
