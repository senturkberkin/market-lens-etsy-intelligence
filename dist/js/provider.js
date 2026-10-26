const configuredBase = () => String(globalThis.MARKET_LENS_API_BASE || '').replace(/\/$/, '');

export function providerStatus() {
  return configuredBase()
    ? {configured:true, label:'Etsy Open API'}
    : {configured:false, label:'Live provider not configured'};
}

export async function fetchEtsyKeyword(keyword, market='US') {
  const base = configuredBase();
  if (!base) throw new Error('Live provider is not configured yet.');
  const url = new URL(`${base}/api/etsy-keyword`);
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('market', market);
  const response = await fetch(url, {headers:{accept:'application/json'}});
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Provider request failed (${response.status}).`);
  return normalizeEtsyObservation(payload);
}

export function normalizeEtsyObservation(payload) {
  const prices = Array.isArray(payload.prices)
    ? payload.prices.map(Number).filter(Number.isFinite)
    : [];
  const sorted = [...prices].sort((a,b) => a-b);
  const medianPrice = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  return {
    listings:Number.isFinite(+payload.totalListings) ? +payload.totalListings : null,
    price:medianPrice,
    prices,
    demand:null,
    trend:null,
    evidence:70,
    provider:'etsy-open-api',
    sourceLabel:'Official Etsy Open API',
    updatedAt:payload.fetchedAt || new Date().toISOString(),
    sampleSize:Number(payload.sampleSize) || prices.length,
    digitalSampleSize:Number(payload.digitalSampleSize) || 0,
    market:payload.market || null
  };
}
