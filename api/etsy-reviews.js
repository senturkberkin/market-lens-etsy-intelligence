import {requireVercelAccess} from './research-access.js';

export async function fetchDatedEtsyReviews(ids,{apiKey,fetchImpl=fetch,now=new Date()}={}){
  if(!apiKey)throw new Error('Etsy provider credentials are not configured.');
  const start=new Date(now.getTime()-90*24*60*60*1000);
  const since=Math.floor(start.getTime()/1000);
  const evidence=[];
  for(const id of ids){
    const url=new URL(`https://openapi.etsy.com/v3/application/listings/${id}/reviews`);
    url.searchParams.set('limit','100');
    url.searchParams.set('min_created',String(since));
    try{
      const response=await fetchImpl(url,{headers:{'x-api-key':apiKey,accept:'application/json'}});
      if(!response.ok)throw new Error(`Etsy returned ${response.status}`);
      const payload=await response.json();
      const count=Number.isSafeInteger(payload.count)&&payload.count>=0?payload.count:null;
      const dates=(Array.isArray(payload.results)?payload.results:[])
        .map(row=>row?.created_timestamp??row?.create_timestamp)
        .filter(value=>Number.isSafeInteger(value)&&value>=since&&value<=Math.floor(now.getTime()/1000));
      const verifiedCount=dates.length|| (count===0 ? 0 : null);
      evidence.push({id,reviewCount90d:verifiedCount,providerMatchingCount:count,
        latestReviewAt:dates.length?new Date(Math.max(...dates)*1000).toISOString():null,
        status:verifiedCount==null?'unknown':'observed'});
    }catch{
      evidence.push({id,reviewCount90d:null,latestReviewAt:null,status:'unavailable'});
    }
  }
  return {source:'Etsy Open API v3 listing reviews',checkedAt:now.toISOString(),reviewPeriodStart:start.toISOString(),evidence,
    method:'Returned review dates were checked within the last 90 days for these listing IDs. At most 100 reviews per listing were inspected; counts are not sales totals.'};
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
  if(!requireVercelAccess(req,res))return;
  const ids=String(req.query?.ids||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!ids.length||ids.length>3||ids.some(id=>!/^[1-9]\d{0,18}$/.test(id))||new Set(ids).size!==ids.length)
    return res.status(400).json({error:'Provide one to three distinct Etsy listing IDs.'});
  try{
    const data=await fetchDatedEtsyReviews(ids,{apiKey:process.env.ETSY_API_KEY});
    res.setHeader('Cache-Control','private, no-store');
    return res.status(200).json(data);
  }catch(error){
    return res.status(503).json({error:error instanceof Error?error.message:'Etsy reviews are unavailable.'});
  }
}
