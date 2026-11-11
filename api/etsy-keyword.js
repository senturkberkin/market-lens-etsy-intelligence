import {etsyApiKey,etsyHeaders,missingEtsyKeyMessage} from './etsy-config.js';

const ALLOWED_ORIGINS = new Set([
  'https://senturkberkin.github.io',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
]);

function cors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
}

function asPrice(listing) {
  if (listing?.price?.amount == null || listing?.price?.divisor == null) return null;
  const amount = Number(listing?.price?.amount);
  const divisor = Number(listing?.price?.divisor);
  return Number.isFinite(amount) && Number.isFinite(divisor) && divisor > 0 ? amount / divisor : null;
}

export function normalizeEtsyListing(x) {
  return {
    id:x.listing_id,
    url:x.url || null,
    title:String(x.title || ''),
    tags:Array.isArray(x.tags) ? x.tags.filter(t => typeof t === 'string') : [],
    listingType:x.listing_type || null,
    price:asPrice(x),
    currency:typeof x.price?.currency_code === 'string' ? x.price.currency_code : null,
    description:typeof x.description === 'string' ? x.description.slice(0, 1200) : null,
    shopId:x.shop_id == null ? null : String(x.shop_id),
    favorites:Number.isFinite(x.num_favorers) ? x.num_favorers : null,
    createdAt:Number.isFinite(x.original_creation_timestamp) ? x.original_creation_timestamp : null
  };
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed.'});

  const keyword = String(req.query.keyword || '').trim();
  const market = String(req.query.market || 'US').toUpperCase();
  if (keyword.length < 2 || keyword.length > 80) return res.status(400).json({error:'Keyword must be 2–80 characters.'});
  if (!/^[A-Z]{2}$/.test(market)) return res.status(400).json({error:'Market must be a two-letter country code.'});

  const apiKey = etsyApiKey();
  if (!apiKey) return res.status(503).json({error:missingEtsyKeyMessage()});

  const url = new URL('https://openapi.etsy.com/v3/application/listings/active');
  url.searchParams.set('keywords', keyword);
  url.searchParams.set('limit', '100');
  url.searchParams.set('sort_on', 'score');
  url.searchParams.set('sort_order', 'desc');

  try {
    const upstream = await fetch(url, {headers:etsyHeaders(apiKey)});
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(502).json({
      error:'Etsy provider request failed.',
      providerStatus:upstream.status
    });
    const results = Array.isArray(data.results) ? data.results : [];
    const prices = results.map(asPrice).filter(Number.isFinite);
    const sample = results.map(normalizeEtsyListing);
    const digitalSampleSize = sample.filter(x => x.listingType === 'download').length;
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json({
      keyword,
      market,
      totalListings:Number(data.count) || 0,
      prices,
      sample,
      sampleSize:results.length,
      digitalSampleSize,
      fetchedAt:new Date().toISOString(),
      source:'Etsy Open API v3'
    });
  } catch {
    return res.status(502).json({error:'Unable to reach Etsy right now.'});
  }
}
