// Local manual UI fixture only. Never used in production or bundled by the app.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname,resolve} from 'node:path';

const root=resolve('dist');
const sample=Array.from({length:40},(_,i)=>({
  id:i+1,title:i%2?'Weekly meal planner printable for families':'Wedding budget planner spreadsheet',
  tags:i%2?['family meal planner','weekly meal planner printable']:['wedding budget planner','wedding spreadsheet planner'],
  listingType:'download',price:10+i/10
}));
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4174');
  if(url.pathname==='/api/keyword-metrics'){
    const keyword=(url.searchParams.get('keyword')||'').trim();
    const rows=[keyword,`${keyword} custom`,`${keyword} handmade`].map((term,i)=>({keyword:term,estimatedSearchesMonthly:[420,170,90][i],competingListings:[1200,360,210][i]}));
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({query:keyword,exact:rows[0],related:rows.slice(1),source:'Local test fixture',sourceUrl:'',fetchedAt:new Date().toISOString(),searchPeriod:'test fixture',searchMethod:'synthetic data for UI testing',competitionMethod:'synthetic data for UI testing',geography:'test fixture',validatedAgainstEtsy:false,creditsUsed:'No provider credits used in local fixture.'}));
    return;
  }
  if(url.pathname==='/api/etsy-keyword'){
    const keyword=url.searchParams.get('keyword')||'';
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({keyword,market:'US',totalListings:1200,prices:sample.map(x=>x.price),sample,
      sampleSize:sample.length,digitalSampleSize:sample.length,fetchedAt:new Date().toISOString(),source:'Local test fixture'}));
    return;
  }
  if(url.pathname==='/config.js'){
    res.setHeader('Content-Type','text/javascript');
    res.end("window.MARKET_LENS_API_BASE='http://127.0.0.1:4174';");
    return;
  }
  const path=resolve(join(root,url.pathname==='/'?'index.html':url.pathname.slice(1)));
  if(!path.startsWith(root+'/')){res.writeHead(403);res.end();return}
  try{res.setHeader('Content-Type',types[extname(path)]||'text/plain');res.end(await readFile(path))}
  catch{res.writeHead(404);res.end()}
}).listen(4174,'127.0.0.1');
