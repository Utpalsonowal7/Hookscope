import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { resolveTarget } from './replay-policy.js';
export async function replay(request, target, allowedOrigins) {
  // Validate once, pin the resolved IP in the socket lookup, and never follow redirects.
  let dnsTimer;
  let resolved;
  try { resolved=await Promise.race([resolveTarget(target, allowedOrigins, lookup),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(new Error('DNS lookup timed out')),3000);})]); }
  finally {clearTimeout(dnsTimer);}
  const {url,address}=resolved;
  const start = performance.now();
  return new Promise(resolve => {
    let finished = false, timer;
    const done = result => { if (!finished) { finished = true; clearTimeout(timer); resolve({...result,durationMs:Math.round(performance.now()-start)}); } };
    const headers = {'user-agent':'HookScope/1.0', 'accept':'*/*'};
    if (typeof request.headers['content-type'] === 'string') headers['content-type'] = request.headers['content-type'];
    // Node sets Content-Length itself here; captured credentials and hop-by-hop headers are never forwarded.
    if (!['GET','HEAD'].includes(request.method)) headers['content-length'] = request.body.length;
    const outgoing = https.request(url, {method:request.method,headers,agent:false,
      lookup:(_host,options,callback) => options.all ? callback(null,[{address,family:4}]) : callback(null,address,4)}, response => {
      const chunks=[]; let size=0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 262144) { outgoing.destroy(); done({status:response.statusCode,body:'',error:'Response exceeded 256 KiB'}); }
        else chunks.push(chunk);
      });
      response.on('end',()=>done({status:response.statusCode,body:Buffer.concat(chunks).toString('utf8'),error:null}));
      response.on('error',()=>done({status:null,body:'',error:'Response stream failed'}));
    });
    timer=setTimeout(()=>{ outgoing.destroy(); done({status:null,body:'',error:'Replay timed out after 5 seconds'}); },5000);
    outgoing.on('error',()=>done({status:null,body:'',error:'Unable to reach replay target'}));
    outgoing.end(['GET','HEAD'].includes(request.method) ? undefined : request.body);
  });
}
