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
  const amount = Number(listing?.price?.amount);
  const divisor = Number(listing?.price?.divisor) || 100;
  return Number.isFinite(amount) ? amount / divisor : null;
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed.'});

  const keyword = String(req.query.keyword || '').trim();
  const market = String(req.query.market || 'US').toUpperCase();
  if (keyword.length < 2 || keyword.length > 80) return res.status(400).json({error:'Keyword must be 2–80 characters.'});
  if (!/^[A-Z]{2}$/.test(market)) return res.status(400).json({error:'Market must be a two-letter country code.'});

  const apiKey = process.env.ETSY_API_KEY;
  if (!apiKey) return res.status(503).json({error:'Etsy provider credentials are not configured.'});

  const url = new URL('https://openapi.etsy.com/v3/application/listings/active');
  url.searchParams.set('keywords', keyword);
  url.searchParams.set('limit', '100');
  url.searchParams.set('sort_on', 'score');
  url.searchParams.set('sort_order', 'desc');

  try {
    const upstream = await fetch(url, {headers:{'x-api-key':apiKey, accept:'application/json'}});
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(502).json({
      error:'Etsy provider request failed.',
      providerStatus:upstream.status,
      providerMessage:String(data?.error || data?.message || '').slice(0, 300) || undefined
    });
    const results = Array.isArray(data.results) ? data.results : [];
    const prices = results.map(asPrice).filter(Number.isFinite);
    const digitalSampleSize = results.filter(x => x.type === 'download').length;
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json({
      keyword,
      market,
      totalListings:Number(data.count) || 0,
      prices,
      sampleSize:results.length,
      digitalSampleSize,
      fetchedAt:new Date().toISOString(),
      source:'Etsy Open API v3'
    });
  } catch {
    return res.status(502).json({error:'Unable to reach Etsy right now.'});
  }
}
