import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { repository } from './repository.js';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';
const config=loadConfig();
const pool=createPool(config.databaseUrl);
pool.on('error',error=>console.error('Database pool error:',error.message));
await migrate(pool);
const repo=repository(pool,config);
let io;
const app=createApp({config,repo,pool,broadcast:(event,data)=>io?.to('workspace').emit(event,data)});
const server=createServer({maxHeaderSize:16384},app);
server.requestTimeout=15000; server.headersTimeout=10000;
io=attachRealtime(server,config);
await repo.prune();
const cleanup=setInterval(()=>repo.prune().catch(error=>console.error('Retention cleanup failed:',error.message)),3600000);
cleanup.unref();
server.listen(config.port,'0.0.0.0',()=>console.log(`HookScope listening on port ${config.port}`));
let closing=false;
async function shutdown(){
  if(closing)return; closing=true; clearInterval(cleanup);
  const force=setTimeout(()=>process.exit(1),10000);force.unref();
  await new Promise(resolve=>io.close(resolve));
  await pool.end(); clearTimeout(force);
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
