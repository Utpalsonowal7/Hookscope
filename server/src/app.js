import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { safeEqual, createSession, sessionExpiry, readCookie, sessionCookie, redactHeaders, redactQuery } from './security.js';
import { createLimiter } from './limiter.js';
import { endpointInput, listInput, isUUID, METHODS } from './validation.js';
import { replay } from './replay.js';
export function createApp({config,repo,pool,broadcast}) {
  const app=express();
  app.disable('x-powered-by');
  // No trust proxy: never trust client-supplied X-Forwarded-For for rate limiting.
  app.use((req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});
    req.requestId=randomUUID(); res.set('X-Request-ID',req.requestId); next();
  });
  app.get('/health/live',(_req,res)=>res.json({status:'ok'}));
  app.get('/health/ready',async(_req,res)=>{ await pool.query('SELECT 1'); res.json({status:'ready'}); });
  const captureLimit=createLimiter({max:120}), loginLimit=createLimiter({max:10,windowMs:900000}), replayLimit=createLimiter({max:10});
  app.all(/^\/h\/([a-f0-9]{36})(?:\/.*)?$/, (req,res,next)=>{
    if (!METHODS.includes(req.method)) return res.status(405).end();
    if (!captureLimit(req.params[0])) return res.status(429).json({error:'Capture rate limit exceeded'});
    if (req.originalUrl.length > 4096) return res.status(414).json({error:'URL too long'});
    // Store wire bytes, including binary bodies. Compressed bodies are rejected.
    next();
  },express.raw({type:()=>true,limit:config.maxBody,inflate:false}),async(req,res)=>{
    const slug=req.params[0];
    const url=new URL(req.originalUrl,config.publicBase);
    const query={}; for (const [k,v] of url.searchParams) { if (Object.hasOwn(query,k)) query[k]=[].concat(query[k],v); else Object.defineProperty(query,k,{value:v,enumerable:true,writable:true,configurable:true}); }
    const item=await repo.capture(slug,{method:req.method,path:url.pathname,query:redactQuery(query),headers:redactHeaders(req.headers),body:Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0)});
    if (!item) return res.status(404).json({error:'Endpoint not found'});
    broadcast('request:created',item);
    res.status(item.response_status).json({received:true,requestId:item.id});
  });
  const api=express.Router();
  app.use('/api',api);
  api.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  api.use((req,res,next)=>{
    if (!['GET','HEAD'].includes(req.method) && req.headers.origin !== config.origin) return res.status(403).json({error:'Origin not allowed'});
    next();
  });
  api.use(express.json({limit:'8kb'}));
  api.post('/session',(req,res)=>{
    if (!loginLimit(req.socket.remoteAddress || 'unknown')) return res.status(429).json({error:'Too many login attempts. Retry in 15 minutes.'});
    if (typeof req.body?.token !== 'string' || !safeEqual(req.body.token,config.adminToken)) return res.status(401).json({error:'Invalid workspace key'});
    res.set('Set-Cookie',sessionCookie(createSession(config.sessionSecret),config.production)); res.json({authenticated:true});
  });
  api.use((req,res,next)=>{
    if (!sessionExpiry(readCookie(req.headers.cookie),config.sessionSecret)) return res.status(401).json({error:'Sign in to your workspace'});
    next();
  });
  api.get('/session',(_req,res)=>res.json({authenticated:true,publicBase:config.publicBase,replayOrigins:config.replayOrigins,retentionDays:config.retentionDays,maxRequests:config.maxRequests}));
  api.delete('/session',(_req,res)=>{res.set('Set-Cookie',sessionCookie('',config.production,true));res.status(204).end();});
  api.param('id',(req,res,next,id)=>{ if (!isUUID(id)) return res.status(400).json({error:'Invalid ID'});next(); });
  api.get('/endpoints',async(_req,res)=>res.json(await repo.endpoints()));
  api.post('/endpoints',async(req,res)=>{const item=await repo.createEndpoint(endpointInput(req.body));broadcast('endpoints:changed');res.status(201).json(item);});
  api.patch('/endpoints/:id',async(req,res)=>{const item=await repo.updateEndpoint(req.params.id,endpointInput(req.body));if(!item)return res.status(404).json({error:'Endpoint not found'});broadcast('endpoints:changed');res.json(item);});
  api.delete('/endpoints/:id',async(req,res)=>{if(!await repo.deleteEndpoint(req.params.id))return res.status(404).json({error:'Endpoint not found'});broadcast('endpoints:changed');res.status(204).end();});
  api.get('/endpoints/:id/requests',async(req,res)=>res.json(await repo.requests(req.params.id,listInput(req.query))));
  api.delete('/endpoints/:id/requests',async(req,res)=>{await repo.clear(req.params.id);broadcast('requests:cleared',{endpoint_id:req.params.id});res.status(204).end();});
  api.get('/requests/:id',async(req,res)=>{
    const item=await repo.request(req.params.id);if(!item)return res.status(404).json({error:'Request expired or deleted'});
    res.json({...item,body:item.body.toString('utf8'),body_base64:item.body.toString('base64'),replays:await repo.replays(item.id)});
  });
  api.post('/requests/:id/replay',async(req,res)=>{
    if(!replayLimit('workspace'))return res.status(429).json({error:'Replay limit: 10 per minute'});
    if(typeof req.body?.target!=='string'||req.body.target.length>2048)return res.status(400).json({error:'Provide a target URL up to 2048 characters'});
    const item=await repo.request(req.params.id);if(!item)return res.status(404).json({error:'Request expired or deleted'});
    // Validate target before network activity; validation failures are client errors.
    let result;
    try { result=await replay(item,req.body.target,config.replayOrigins); }
    catch(e) { return res.status(400).json({error:e.message}); }
    res.status(201).json(await repo.saveReplay(item.id,req.body.target,result));
  });
  api.use((_req,res)=>res.status(404).json({error:'API route not found'}));
  const dist=fileURLToPath(new URL('../../dist',import.meta.url));
  app.use(express.static(dist));
  app.get('/{*path}',(req,res,next)=>{ if(req.path.startsWith('/h/'))return res.status(404).json({error:'Endpoint not found'});res.sendFile(path.join(dist,'index.html'),e=>e&&next(e)); });
  app.use((error,req,res,_next)=>{
    const status=Number.isInteger(error.status)&&error.status>=400&&error.status<600?error.status:500;
    if(status>=500)console.error(JSON.stringify({level:'error',requestId:req.requestId,message:error.message}));
    if (!res.headersSent) res.status(status).json({error:status>=500?'Unexpected server error':error.message,requestId:req.requestId});
  });
  return app;
}
