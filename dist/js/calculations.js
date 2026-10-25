export const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));
export const money = (v) => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v)||0);
export const number = (v) => new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(Number(v)||0);
export function revenueOrders(targetRevenue, price) { return price > 0 && targetRevenue >= 0 ? Math.ceil(targetRevenue / price) : null; }
export function contributionPerOrder({price, margin, adSpend, expectedOrders, variableCosts=0}) {
  const fees = price * (1 - clamp(margin,0,1));
  const ads = expectedOrders > 0 ? adSpend / expectedOrders : 0;
  return price - fees - ads - Math.max(0, variableCosts);
}
export function profitOrders({targetProfit, fixedCosts, contribution}) { return contribution > 0 && targetProfit + fixedCosts >= 0 ? Math.ceil((targetProfit + fixedCosts) / contribution) : null; }
export function revenueModel(input) {
  const orders = revenueOrders(input.targetRevenue, input.price);
  const contribution = contributionPerOrder({...input, expectedOrders: orders || 0});
  const profitOrderCount = profitOrders({targetProfit:input.targetProfit, fixedCosts:input.fixedCosts, contribution});
  const requiredOrders = Math.max(orders || 0, profitOrderCount || 0) || null;
  const visits = requiredOrders && input.conversion > 0 ? Math.ceil(requiredOrders/input.conversion) : null;
  const breakEven = contribution > 0 ? Math.ceil(input.fixedCosts/contribution) : null;
  return {orders, contribution, profitOrderCount, requiredOrders, visits, dailyOrders:requiredOrders ? requiredOrders/30 : null, breakEven, feasible:contribution>0};
}
export function percentile(value, arr) { const a=[...arr].filter(Number.isFinite).sort((x,y)=>x-y); if(!a.length)return null; return 100*a.filter(x=>x<=value).length/a.length; }
export function quartiles(arr){const a=[...arr].filter(Number.isFinite).sort((x,y)=>x-y); const q=p=>a.length? a[Math.round((a.length-1)*p)]:null; return {p25:q(.25),median:q(.5),p75:q(.75)};}
export function normalizedScore(values, weights){const total=Object.values(weights).reduce((a,b)=>a+(+b||0),0)||1; return Object.keys(weights).reduce((sum,k)=>sum+(+values[k]||0)*(+weights[k]||0)/total,0);}
export function sensitivity(input){return [-20,-10,0,10,20].map(delta=>{const price=+(input.price*(1+delta/100)).toFixed(2); const model=revenueModel({...input,price});return {price,orders:model.requiredOrders,visits:model.visits};});}
export function decisionGate(product, thresholds={signalMin:55, burdenMax:65}) {
  const model = revenueModel(product);
  const scores = product.scores || {};
  const signal = Math.round(clamp(
    (+scores.demand || 0) * .45 +
    (+scores.competition || 0) * .35 +
    (+scores.pricing || 0) * .20, 0, 100));
  const trafficCoverage = model.visits && product.demand > 0 ? clamp(model.visits / product.demand * 100, 0, 100) : 100;
  const competitionPressure = 100 - clamp(+scores.competition || 0, 0, 100);
  const marginDrag = 100 - clamp((+product.margin || 0) * 100, 0, 100);
  const burden = Math.round(clamp(trafficCoverage * .50 + competitionPressure * .30 + marginDrag * .20, 0, 100));
  const passesSignal = signal >= thresholds.signalMin;
  const passesBurden = burden <= thresholds.burdenMax;
  const feasible = model.feasible && model.requiredOrders !== null;
  const pass = feasible && passesSignal && passesBurden;
  const lowEvidence = !String(product.confidence || '').toLowerCase().startsWith('high');
  const status = !feasible ? 'NO-GO' : pass && lowEvidence ? 'GO — VALIDATE' : pass ? 'GO' : 'NO-GO';
  const reasons = [];
  if (!feasible) reasons.push('Contribution per order is not positive.');
  if (!passesSignal) reasons.push(`Market signal is ${thresholds.signalMin - signal} points below the gate.`);
  if (!passesBurden) reasons.push(`Execution burden is ${burden - thresholds.burdenMax} points above the gate.`);
  if (pass && lowEvidence) reasons.push('The numeric gate passes, but the evidence is not yet high-confidence.');
  if (pass && !lowEvidence) reasons.push('Both decision metrics pass with high-confidence evidence.');
  return {status, pass, signal, burden, passesSignal, passesBurden, feasible, lowEvidence, trafficCoverage:Math.round(trafficCoverage), competitionPressure:Math.round(competitionPressure), marginDrag:Math.round(marginDrag), reasons};
}
export function keywordOpportunityIndex({demand, listings, price}) {
  const demandScore = clamp(demand / 80, 0, 100);
  const competitionOpening = 100 - clamp(listings / 250, 0, 100);
  const pricePotential = clamp(price * 4, 0, 100);
  return Math.round(demandScore * .50 + competitionOpening * .30 + pricePotential * .20);
}
