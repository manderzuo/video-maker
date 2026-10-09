import pg from 'pg';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdir,lstat} from 'node:fs/promises';
import {buildStudioApp} from './app.js';
import {readRuntimeConfig,readRuntimeSecrets} from './runtime-config.js';
import {ApiSecrets} from './security/api-secrets.js';
import {RestrictedOutbound} from './security/outbound.js';
import {migrateDatabase,verifyDatabaseMigrations} from './db/migrate.js';
export async function startRuntime(command:'serve'|'migrate',configuration:string){
 if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new Error('STRICT_TLS_REQUIRED');
 const config=await readRuntimeConfig(configuration),secret=await readRuntimeSecrets(config.secretsFile),pool=new pg.Pool({host:config.database.host,port:config.database.port,database:config.database.name,user:config.database.user,password:secret.databasePassword,max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
 const directory=resolve(dirname(fileURLToPath(import.meta.url)),'migrations');
 try{
  if(command==='migrate'){const names=await migrateDatabase(pool,directory);console.log(JSON.stringify({schemaChanges:names,seededUsers:0,seededDocuments:0}));await pool.end();return;}
  await mkdir(config.assets.root,{recursive:true,mode:0o700});const info=await lstat(config.assets.root);if(!info.isDirectory()||process.platform!=='win32'&&(info.mode&0o077)!==0)throw new Error('PRIVATE_ASSET_DIRECTORY_REQUIRED');
  await verifyDatabaseMigrations(pool,directory);
  const secrets=new ApiSecrets({activeVersion:secret.activeVersion,keys:secret.keys});for(const key of secret.keys.values())key.fill(0);
  const app=await buildStudioApp({pool,origin:config.origin,apiSettings:{secrets,outbound:new RestrictedOutbound()},workspace:true,content:true,taskWorker:true,assets:config.assets,loopbackProxy:true,videoContracts:new Map(config.videoContracts.map(row=>[row.apiBase,row.contract]))});
  app.get('/healthz',async(_request,reply)=>{try{await pool.query('SELECT 1');return {status:'ok'};}catch{return reply.code(503).send({status:'unavailable'});}});
  app.addHook('onClose',async()=>{await pool.end();});await app.listen({host:config.host,port:config.port});console.log(JSON.stringify({status:'ready',host:config.host,port:config.port}));
  let closing=false;const close=()=>{if(closing)return;closing=true;void app.close().catch(()=>{process.exitCode=1;});};process.once('SIGTERM',close);process.once('SIGINT',close);return app;
 }catch(error){await pool.end();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const [command,configuration,...extra]=process.argv.slice(2);if(!['serve','migrate'].includes(command)||!configuration||extra.length){console.error('Usage: account-server.mjs serve|migrate /absolute/runtime.json');process.exitCode=1;}else void startRuntime(command as 'serve'|'migrate',configuration).catch(()=>{console.error('Account server startup failed; configuration, private storage or database needs verification.');process.exitCode=1;});}
