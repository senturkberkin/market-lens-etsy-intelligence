// Evidence based keyword decision engine. No search volume or sales are inferred from supply.
export const OPPORTUNITY_VERSION = 'OE-1.1';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const tokens = value => String(value || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const percentile = (sorted, p) => {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * p;
  const low = Math.floor(position), high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
};

export function normalizeDemandObservation(record, keyword) {
  const value = Number(record?.value);
  const observedAt = String(record?.observedAt || '');
  const source = String(record?.source || '').trim();
  const period = String(record?.period || '').trim();
  const market = String(record?.market || '').trim().toUpperCase();
  const metric = String(record?.metric || '').trim();
  const term = String(record?.keyword || '').trim().toLowerCase();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(observedAt) &&
    !Number.isNaN(Date.parse(`${observedAt}T00:00:00Z`));
  if (!term || term !== String(keyword || '').trim().toLowerCase() ||
      !Number.isFinite(value) || value < 0 || !source || !validDate ||
      !period || !metric || (market && !/^[A-Z]{2}$/.test(market))) return null;
  return {keyword:term,value,source,observedAt,period,market:market || null,metric};
}

export function assessDemand(records, keyword, now = new Date()) {
  const valid = (Array.isArray(records) ? records : [])
    .map(record => normalizeDemandObservation(record, keyword)).filter(Boolean);
  if (!valid.length) return {status:'UNKNOWN',observations:[],selected:null,conflicting:false};
  // Sort by date then source for reproducibility. Never sum unlike measurements.
  valid.sort((a,b) => b.observedAt.localeCompare(a.observedAt) || a.source.localeCompare(b.source));
  const selected = valid[0];
  const ageDays=(now.getTime()-Date.parse(`${selected.observedAt}T00:00:00Z`))/86400000;
  if(ageDays < -1 || ageDays > 90) return {status:'STALE',observations:valid,selected,conflicting:false,comparableCount:0};
  const comparable = valid.filter(x => x.metric === selected.metric && x.period === selected.period &&
    x.market === selected.market);
  const conflicting = comparable.some(x => (x.value > 0) !== (selected.value > 0));
  return {status:conflicting ? 'CONFLICTING' : selected.value > 0 ? 'OBSERVED' : 'NO_SIGNAL',
    observations:valid,selected,conflicting,comparableCount:comparable.length};
}

export function assessProductGap(concept, relevantDigital) {
  const fields = ['audience','problem','format','difference'];
  const complete = fields.every(key => String(concept?.[key] || '').trim());
  const hypothesis = complete ? `${concept.format} for ${concept.audience}: ${concept.problem}` : null;
  const ids = new Set(relevantDigital.map(item => String(item.id)));
  const cited = [...new Set((Array.isArray(concept?.competitorIds) ? concept.competitorIds : [])
    .map(String))].filter(id => ids.has(id));
  const observed = complete && cited.length >= 2 &&
    String(concept?.gapEvidence || '').trim().length >= 20;
  return {status:observed ? 'OBSERVED DIFFERENCE' : complete ? 'HYPOTHESIS' : 'UNDEFINED',
    direction:hypothesis,comparatorCount:cited.length,
    evidence:observed ? String(concept.gapEvidence).trim() : null};
}

export function analyzeOpportunity(input, now = new Date()) {
  const keyword = String(input.keyword || '').trim();
  const sample = Array.isArray(input.sample) ? input.sample : [];
  const terms = [...new Set(tokens(keyword))];
  const relevant = sample.filter(item => {
    const words = new Set([...tokens(item.title), ...(item.tags || []).flatMap(tokens)]);
    return terms.length > 0 && terms.every(term => words.has(term));
  });
  const digital = relevant.filter(item => item.listingType === 'download');
  const prices = digital.map(item => item.price).filter(value => finite(value) && value >= 0).sort((a,b) => a-b);
  const observedAt = Date.parse(input.updatedAt || '');
  const ageHours = Number.isFinite(observedAt) ? (now.getTime() - observedAt) / 3600000 : Infinity;
  const fresh = ageHours >= 0 && ageHours <= 6;
  const count = finite(input.listings) && input.listings >= 0 ? input.listings : null;
  const demand = assessDemand(input.demandObservations || (input.demandObservation ? [input.demandObservation] : []),keyword,now);
  const positiveDemand = demand.status === 'OBSERVED';
  const gap = assessProductGap(input.productConcept,digital);
  const sufficientSample = sample.length >= 30 && relevant.length >= 20 && digital.length >= 10;
  const coverage = sample.length ? relevant.length / sample.length : null;
  const evidenceQuality = !fresh ? 'Stale or missing' : sufficientSample ? 'Partial sample' : 'Limited sample';
  const reasons = [];
  if (count !== null) reasons.push(`${count.toLocaleString('en-US')} active listings match the broad Etsy query; this measures supply.`);
  if (sample.length) reasons.push(`${digital.length} of ${sample.length} sampled results are relevant digital downloads.`);
  if (positiveDemand) reasons.push(`${demand.selected.source} reports ${demand.selected.value.toLocaleString('en-US')} ${demand.selected.metric} in ${demand.selected.period}${demand.selected.market ? ` for ${demand.selected.market}` : ''}.`);
  else if (demand.status === 'CONFLICTING') reasons.push('Comparable demand observations conflict.');
  else if (demand.status === 'STALE') reasons.push('The latest demand observation is over 90 days old or dated in the future.');
  else reasons.push('Buyer search demand is unknown.');
  if (gap.status === 'OBSERVED DIFFERENCE') reasons.push(`The proposed gap was checked against ${gap.comparatorCount} sampled competitors.`);
  const direction = gap.direction;
  let decision = 'VALIDATE';
  let nextAction = 'Find an independent, dated demand observation and check the product angle against real listings.';
  if (positiveDemand && fresh && sufficientSample && gap.status === 'OBSERVED DIFFERENCE') {
    decision = 'EXPLORE';
    nextAction = 'Inspect the sampled competitors and test the proposed product angle with buyers.';
  }
  // AVOID requires explicit validated rejection evidence, never missing demand or a high listing count alone.
  if (fresh && sufficientSample && gap.status === 'OBSERVED DIFFERENCE' && input.rejectionEvidence?.verified === true &&
      typeof input.rejectionEvidence.reason === 'string' && input.rejectionEvidence.reason.trim() &&
      typeof input.rejectionEvidence.source === 'string' && input.rejectionEvidence.source.trim()) {
    decision = 'AVOID';
    reasons.push(`Documented rejection: ${input.rejectionEvidence.reason.trim()} (${input.rejectionEvidence.source.trim()}).`);
    nextAction = 'Try a different keyword or product angle.';
  }
  return {
    version:OPPORTUNITY_VERSION, decision,
    demandIndicator:positiveDemand ? 'Observed externally' : demand.status === 'CONFLICTING' ? 'Conflicting' : 'Unknown',
    competitionIndicator:count === null ? 'Unknown' : `${count.toLocaleString('en-US')} broad matches`,
    evidenceQuality, evidenceComplete:!!(positiveDemand && fresh && sufficientSample && gap.status === 'OBSERVED DIFFERENCE'),
    uncertainty:!fresh ? 'The listing observation is missing or over six hours old.' :
      !positiveDemand ? 'No reliable buyer demand observation is available.' :
      !sufficientSample ? 'The relevant digital sample is too small for a strong comparison.' :
      !direction ? 'A specific product direction is not defined.' :
      gap.status !== 'OBSERVED DIFFERENCE' ? 'The product gap has not been checked against two relevant sampled competitors.' :
      'Buyer conversion and competitor sales remain unknown.',
    reasons:reasons.slice(-3), nextAction, direction, demand, gap,
    sample:{returned:sample.length, relevant:relevant.length, digital:digital.length, relevanceShare:coverage,
      priceP25:percentile(prices,.25), priceMedian:percentile(prices,.5), priceP75:percentile(prices,.75)},
    observedAt:input.updatedAt || null
  };
}
