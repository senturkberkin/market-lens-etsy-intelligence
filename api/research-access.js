// Vercel Authentication runs before these functions. Production needs an explicit
// flag set only after the project has All Deployments protection enabled.
export function requireVercelAccess(req,res){
  const environment=process.env.VERCEL_ENV;
  const protectedEnvironment=environment==='preview'||
    (environment==='production'&&process.env.ZETY_VERCEL_AUTH_ALL==='1');
  if(!protectedEnvironment){
    res.status(503).json({error:'Research is unavailable on this deployment. Vercel Authentication must protect all deployments before production research is enabled.'});
    return false;
  }
  const host=String(req.headers?.host||'').toLowerCase();
  const origin=req.headers?.origin;
  if(!host.endsWith('.vercel.app')||(origin&&origin!==`https://${host}`)){
    res.status(403).json({error:'Research is only available from its protected Vercel page.'});
    return false;
  }
  return true;
}
