import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {buildStudioApp} from '../src/app.js';
import {ApiSecrets} from '../src/security/api-secrets.js';
import {RestrictedOutbound} from '../src/security/outbound.js';
export async function browserBackend(origin:string){
 const connection={host:'127.0.0.1',port:55432,database:'aiwork_studio_test',user:'aiwork_test',password:'aiwork_local_test_only',connectionTimeoutMillis:3000};
 const control=new pg.Client(connection);await control.connect();
 const identity=await control.query('SELECT current_database() AS db,current_user AS role');
 if(identity.rows[0].db!=='aiwork_studio_test'||identity.rows[0].role!=='aiwork_test'){await control.end();throw new Error('Dedicated fake database required');}
 const schema='account_test_'+randomUUID().replaceAll('-','');if(!/^account_test_[a-f0-9]{32}$/.test(schema))throw new Error('Invalid schema');
 await control.query(`CREATE SCHEMA "${schema}"`);const pool=new pg.Pool({...connection,options:`-c search_path=${schema}`});
 let app:Awaited<ReturnType<typeof buildStudioApp>>|undefined;let time=new Date(),closed=false;
 const close=async()=>{if(closed)return;closed=true;try{await app?.close();}finally{try{await pool.end();}finally{try{await control.query(`DROP SCHEMA "${schema}" CASCADE`);}finally{await control.end();}}}};
 const root=randomBytes(32),secrets=new ApiSecrets({activeVersion:'fake-browser',keys:new Map([['fake-browser',root]])});root.fill(0);
 const outbound=new RestrictedOutbound({resolve:async hostname=>{if(hostname!=='api.account-fixture.test')throw new Error('Synthetic fixture host required');return [{address:'93.184.216.34',family:4}];},request:async input=>{const target=new URL(input.url);if(target.hostname!=='api.account-fixture.test'||input.address!=='93.184.216.34'||input.family!==4||!['/healthz','/v1/models'].includes(target.pathname))throw new Error('Synthetic fixture request required');return {status:200,body:Buffer.from(target.pathname==='/healthz'?'{"status":"ok"}':'{"data":[{"id":"FAKE_BROWSER_TEXT_MODEL"}]}')};}});
 try{for(const migration of['001-users.sql','002-api-configs.sql','003-workspace.sql','004-tasks-history.sql','005-video-runs.sql','006-agent.sql','007-workspace-imports.sql'])await pool.query(await readFile(new URL('../src/db/migrations/'+migration,import.meta.url),'utf8'));app=await buildStudioApp({pool,origin,now:()=>new Date(time),apiSettings:{secrets,outbound},workspace:true,content:true});await app.listen({host:'127.0.0.1',port:4181});}
 catch(error){await close();throw error;}
 return {pool,advance:(ms:number)=>{time=new Date(time.getTime()+ms);},close};
}
