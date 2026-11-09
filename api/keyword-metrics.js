// Personal research only. Alura's Free plan is the only permitted data path here.
import {requireVercelAccess} from './research-access.js';

const BASE = 'https://api.alura.io/v1';
const SOURCE = 'Alura API';
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const canonical = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

export function normalizeKeywordMetrics(seed, lookup, related = {data:[]}, fetchedAt = new Date().toISOString()) {
  if (!lookup || !Array.isArray(lookup.data) || !related || !Array.isArray(related.data))
    throw new Error('Provider response has no keyword results.');
  const rows = [...lookup.data, ...related.data].filter(item => item && typeof item === 'object');
  const seen = new Set();
  const measurements = [];
  for (const item of rows) {
    const keyword = String(item.keyword || '').trim().replace(/\s+/g, ' ');
    const key = canonical(keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    measurements.push({
      keyword,
      estimatedSearchesMonthly:count(item.volume?.etsy_monthly),
      competingListings:count(item.competition?.competing_listings),
      asOf:typeof item.as_of === 'string' ? item.as_of : null
    });
  }
  const exact = measurements.find(row => canonical(row.keyword) === canonical(seed)) || null;
  return {
    query:seed,
    exact,
    related:measurements.filter(row => canonical(row.keyword) !== canonical(seed)),
    status:exact ? 'available' : lookup.pending?.some(p => canonical(p) === canonical(seed)) ? 'pending' : 'unavailable',
    source:SOURCE,
    sourceUrl:'https://docs.alura.io/guides/keyword-research',
    fetchedAt,
    searchPeriod:'average of the last 12 complete Etsy months, as described by Alura',
    searchMethod:'Alura estimate; not Etsy Marketplace Insights measured searches',
    competitionMethod:'Alura-reported count of competing listings',
    geography:'not specified by this endpoint',
    validatedAgainstEtsy:false,
    creditsUsed:'up to 2 included Free-plan API credits; no monetary charge'
  };
}

export async function fetchFreeMetrics(seed, {apiKey, fetchImpl = fetch} = {}) {
  if (!apiKey) throw new Error('Free-plan keyword provider is not configured.');
  const headers = {Authorization:`Bearer ${apiKey}`,Accept:'application/json'};
  const request = async path => {
    const response = await fetchImpl(`${BASE}${path}`, {headers});
    if (response.status === 401 || response.status === 403) throw new Error('Keyword provider access was rejected.');
    if (response.status === 429) throw new Error('Keyword provider rate limit reached. Try again later.');
    if (!response.ok) throw new Error(`Keyword provider returned ${response.status}.`);
    return response.json();
  };
  // This documented endpoint costs zero credits. Refuse any paid plan or unknown balance.
  const usage = await request('/usage');
  if (String(usage.plan).toLowerCase() !== 'free')
    throw new Error('Research is disabled because the provider account is not on its Free plan.');
  if (!Number.isSafeInteger(usage.credits?.remaining) || usage.credits.remaining < 2)
    throw new Error('Research is disabled because fewer than 2 included Free-plan credits remain.');
  const url = new URL(`${BASE}/research/keywords`);
  url.searchParams.set('q',seed);
  url.searchParams.set('language','en');
  const lookup = await request(`/research/keywords${url.search}`);
  const exact = lookup.data?.find(item => canonical(item.keyword) === canonical(seed));
  const related = exact?.id ? await request(`/research/keywords/${encodeURIComponent(exact.id)}/related`) : {data:[]};
  return normalizeKeywordMetrics(seed, lookup, related);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed.'});
  if (!requireVercelAccess(req,res)) return;
  const seed = String(req.query?.keyword || '').trim();
  if (seed.length < 2 || seed.length > 80) return res.status(400).json({error:'Enter a keyword of 2–80 characters.'});
  try {
    const result = await fetchFreeMetrics(seed, {apiKey:process.env.ALURA_API_KEY});
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Keyword data is unavailable.';
    const status = message.includes('not configured') || message.includes('disabled') ? 503 : 502;
    return res.status(status).json({error:message});
  }
}
