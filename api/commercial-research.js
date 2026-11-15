import {requireVercelAccess} from './research-access.js';

const BASE='https://api.alura.io/v1';
const clean=value=>String(value||'').trim().replace(/\s+/g,' ');
const safeCount=value=>Number.isSafeInteger(value)&&value>=0?value:null;

export const planCommercialResearch=(directions,maxBudget=33)=>{
  const unique=[...new Set((Array.isArray(directions)?directions:[]).map(clean).filter(value=>value.length>=2&&value.length<=80))].slice(0,3);
  const cost=unique.length*11;
  return {directions:unique,maxCredits:cost,withinBudget:cost<=maxBudget};
};

export const normalizeProducts=data=>(Array.isArray(data?.data)?data.data:[]).map(row=>({
  id:String(row.id||''),title:String(row.title||''),url:typeof row.url==='string'?row.url:null,
  shop:row.shop&&typeof row.shop==='object'?{id:row.shop.id==null?null:String(row.shop.id),name:typeof row.shop.name==='string'?row.shop.name:null}:null,
  price:row.price||null,sales:{est_last_month:safeCount(row.sales?.est_last_month),est_monthly_avg:safeCount(row.sales?.est_monthly_avg),est_lifetime:safeCount(row.sales?.est_lifetime),est_trend_3m:typeof row.sales?.est_trend_3m==='number'?row.sales.est_trend_3m:null},
  as_of:typeof row.as_of==='string'?row.as_of:null
}));

export async function runCommercialResearch(directions,{apiKey,fetchImpl=fetch,maxBudget=33}={}){
  const plan=planCommercialResearch(directions,maxBudget);
  if(!apiKey)throw new Error('ALURA_API_KEY is not configured for this deployment.');
  if(!plan.directions.length)throw new Error('No research directions were supplied.');
  if(!plan.withinBudget)throw new Error(`The requested research needs up to ${plan.maxCredits} credits, above this session’s approved budget.`);
  const request=async path=>{
    const response=await fetchImpl(`${BASE}${path}`,{headers:{Authorization:`Bearer ${apiKey}`,Accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(response.status===402?'Alura credits are exhausted.':response.status===401||response.status===403?'Alura access was rejected.':data.detail||`Alura returned ${response.status}.`);
    return data;
  };
  const usage=await request('/usage');
  if(String(usage.plan).toLowerCase()!=='free')throw new Error('Commercial research is limited to the Alura Free plan.');
  if(!Number.isSafeInteger(usage.credits?.remaining)||usage.credits.remaining<plan.maxCredits)throw new Error(`Commercial research needs up to ${plan.maxCredits} included credits; the account balance is insufficient.`);
  const results=[];
  for(const direction of plan.directions){
    const keyword=await request(`/research/keywords?${new URLSearchParams({q:direction,language:'en'})}`);
    const exact=(keyword.data||[]).find(row=>clean(row.keyword).toLocaleLowerCase('en-US')===direction.toLocaleLowerCase('en-US'))||null;
    const query=new URLSearchParams({q:direction,is_digital:'true',limit:'10',sort:'est_last_month',order:'desc',est_last_month_min:'0',fields:'title,url,shop,price,sales.est_last_month,sales.est_monthly_avg,sales.est_lifetime,sales.est_trend_3m'});
    const products=await request(`/research/products?${query}`);
    results.push({direction,keyword:exact?{keyword:exact.keyword,estimatedSearchesMonthly:safeCount(exact.volume?.etsy_monthly),competingListings:safeCount(exact.competition?.competing_listings),asOf:typeof exact.as_of==='string'?exact.as_of:null}:null,products:normalizeProducts(products),total:products.total||null});
  }
  return {plan,results,source:'Alura API estimates',retrievedAt:new Date().toISOString()};
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
  if(!requireVercelAccess(req,res))return;
  const body=req.body&&typeof req.body==='object'?req.body:{};
  if(body.approved!==true)return res.status(400).json({error:'Explicit approval is required before Alura credits are used.'});
  try{return res.status(200).json(await runCommercialResearch(body.directions,{apiKey:process.env.ALURA_API_KEY,maxBudget:Number.isSafeInteger(body.maxBudget)?body.maxBudget:33}));}
  catch(error){return res.status(502).json({error:error instanceof Error?error.message:'Commercial research is unavailable.'});}
}
