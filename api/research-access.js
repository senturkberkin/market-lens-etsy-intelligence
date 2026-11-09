// Preview requests reach this function only after Vercel Authentication.
// Fail closed elsewhere until production deployment protection is explicitly configured.
export function requireProtectedPreview(req,res){
  if(process.env.VERCEL_ENV!=='preview'){
    res.status(503).json({error:'Research is unavailable on this deployment. Vercel Authentication must protect the production domain before research can be enabled there.'});
    return false;
  }
  const host=String(req.headers?.host||'').toLowerCase();
  const origin=req.headers?.origin;
  if(!host.endsWith('.vercel.app')||(origin&&origin!==`https://${host}`)){
    res.status(403).json({error:'Research is only available on its protected Vercel Preview page.'});
    return false;
  }
  return true;
}
