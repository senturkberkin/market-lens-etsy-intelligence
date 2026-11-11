import {normalizeEtsyListing} from './etsy-keyword.js';
import {requireVercelAccess} from './research-access.js';
import {etsyApiKey,etsyHeaders,missingEtsyKeyMessage} from './etsy-config.js';

const base='https://openapi.etsy.com/v3/application';
const digits=/^[1-9]\d{0,18}$/;
const shopName=/^[\p{L}\p{N}_-]{2,80}$/u;

export async function fetchEtsySourceEvidence({listingId,shop}, {apiKey,fetchImpl=fetch,now=new Date()}={}) {
  if(!apiKey)throw new Error(missingEtsyKeyMessage());
  if(Boolean(listingId)===Boolean(shop))throw new Error('Provide one Etsy listing or shop.');
  if(listingId&&!digits.test(String(listingId)))throw new Error('Invalid Etsy listing ID.');
  if(shop&&!shopName.test(String(shop)))throw new Error('Invalid Etsy shop name.');
  const request=async url=>{
    const response=await fetchImpl(url,{headers:etsyHeaders(apiKey)});
    if(!response.ok)throw new Error(`Etsy returned ${response.status}.`);
    return response.json();
  };
  let anchor=null,shopId=null,shopLabel=null;
  if(listingId){
    const row=await request(`${base}/listings/${encodeURIComponent(listingId)}`);
    anchor=normalizeEtsyListing(row);
    shopId=anchor.shopId;
    if(!shopId)throw new Error('The listing did not include a shop ID.');
  }else{
    const url=new URL(`${base}/shops`);url.searchParams.set('shop_name',shop);url.searchParams.set('limit','10');
    const found=await request(url);
    const match=(Array.isArray(found.results)?found.results:[]).find(x=>String(x.shop_name||'').toLowerCase()===shop.toLowerCase());
    if(!match?.shop_id)throw new Error('No exact Etsy shop match was returned.');
    shopId=String(match.shop_id);shopLabel=String(match.shop_name);
  }
  const url=new URL(`${base}/shops/${encodeURIComponent(shopId)}/listings/active`);
  url.searchParams.set('limit','50');
  const found=await request(url);
  const sample=(Array.isArray(found.results)?found.results:[]).map(normalizeEtsyListing);
  if(anchor&&!sample.some(x=>String(x.id)===String(anchor.id)))sample.unshift(anchor);
  const keyword=anchor?.tags?.find(tag=>String(tag).trim().split(/\s+/).length>=2)||
    (anchor?.title||'').split(/\s+/).slice(0,3).join(' ');
  return {
    keyword:keyword||shopLabel||shop||'',
    totalListings:Number.isSafeInteger(found.count)?found.count:null,
    sample,sampleSize:sample.length,
    digitalSampleSize:sample.filter(x=>x.listingType==='download').length,
    fetchedAt:now.toISOString(),source:'Etsy Open API v3',
    sourceContext:listingId?{type:'listing',id:String(listingId),shopId,anchorKeyword:keyword||null}:
      {type:'shop',name:shopLabel,shopId}
  };
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
  if(!requireVercelAccess(req,res))return;
  const apiKey=etsyApiKey();
  if(!apiKey)return res.status(503).json({error:missingEtsyKeyMessage()});
  const listingId=req.query?.listingId==null?null:String(req.query.listingId);
  const shop=req.query?.shop==null?null:String(req.query.shop);
  try{
    const data=await fetchEtsySourceEvidence({listingId,shop},{apiKey});
    res.setHeader('Cache-Control','private, no-store');
    return res.status(200).json(data);
  }catch(error){
    const message=error instanceof Error?error.message:'Etsy source is unavailable.';
    const invalid=message==='Invalid Etsy listing ID.'||message==='Invalid Etsy shop name.'||message==='Provide one Etsy listing or shop.';
    return res.status(invalid?400:502).json({error:invalid?message:'Etsy source is unavailable right now.'});
  }
}
