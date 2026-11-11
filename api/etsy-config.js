// One server-side Etsy configuration for every Etsy API route.
export const ETSY_KEY_ENV = 'ETSY_API_KEY';

export function etsyApiKey() {
  const value = process.env[ETSY_KEY_ENV];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function missingEtsyKeyMessage() {
  const environment = {
    production:'Production', preview:'Preview', development:'Development'
  }[process.env.VERCEL_ENV] || 'current';
  return `${ETSY_KEY_ENV} is not configured for the ${environment} deployment environment.`;
}

export function etsyHeaders(apiKey) {
  return {'x-api-key':apiKey,accept:'application/json'};
}
