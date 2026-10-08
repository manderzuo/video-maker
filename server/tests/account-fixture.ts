import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {expect} from 'vitest';
import {buildStudioApp} from '../src/app.js';
import type {ApiSettingsDependencies} from '../src/settings/service.js';
export const origin='https://studio.test';
export const fakePassword='  Fake password 测试 123  ';
export type SessionView={user:{id:string;username:string};contextId:string;csrfToken:string;onboardingCompletedAt:string|null};
export type Account={cookie:string;view:SessionView;ip:string};
const connection={host:'127.0.0.1',port:55432,database:'aiwork_studio_test',user:'aiwork_test',password:'aiwork_local_test_only',connectionTimeoutMillis:3000};
export async function fixture(options:{apiSettings?:ApiSettingsDependencies;schemaPrefix?:'api_test'}={}){
 const control=new pg.Client(connection);await control.connect();
 const identity=await control.query('SELECT current_database() AS db,current_user AS role');
 if(identity.rows[0].db!=='aiwork_studio_test'||identity.rows[0].role!=='aiwork_test')throw new Error('Dedicated fake test database required');
 const prefix=options.schemaPrefix??'account_test';
 const schema=prefix+'_'+randomUUID().replaceAll('-','');
 if(!/^(account_test|api_test)_[a-f0-9]{32}$/.test(schema))throw new Error('Invalid isolated schema');
 await control.query(`CREATE SCHEMA "${schema}"`);
 const pool=new pg.Pool({...connection,options:`-c search_path=${schema}`,max:8});
 let time=new Date('2026-10-08T12:00:00.000Z');
 let app:Awaited<ReturnType<typeof buildStudioApp>>;
 try{
  await pool.query(await readFile(new URL('../src/db/migrations/001-users.sql',import.meta.url),'utf8'));
  if(options.apiSettings)await pool.query(await readFile(new URL('../src/db/migrations/002-api-configs.sql',import.meta.url),'utf8'));
  app=await buildStudioApp({pool,origin,now:()=>new Date(time),apiSettings:options.apiSettings});
 }catch(error){await pool.end();await control.query(`DROP SCHEMA "${schema}" CASCADE`);await control.end();throw error;}
 // Test-only adapter proves resource-ID ownership using the real auth hook/repository.
 try{
  const {requestAuthContext}=await import('../src/auth/context.js');
  const {readOwnedDocument}=await import('../src/users/document-repository.js');
  app.get<{Params:{id:string}}>('/studio-api/test-documents/:id',async(request,reply)=>{
   const doc=await readOwnedDocument(pool,requestAuthContext(request),request.params.id);
   return doc??reply.code(404).send({code:'NOT_FOUND'});
  });
 }catch(error){if(!String(error).includes('Cannot find module')&&!String(error).includes('Failed to load url'))throw error;}
 let nextIp=2;
 const newIp=()=>`127.0.0.${nextIp++}`;
 const call=(method:'GET'|'HEAD'|'POST'|'PATCH'|'OPTIONS'|'DELETE'|'PUT',url:string,options:{payload?:unknown;cookie?:string;context?:string;csrf?:string;origin?:string|null;ip?:string;extraHeaders?:Record<string,string>}={})=>{
  const headers:Record<string,string>={...options.extraHeaders};
  if(options.cookie)headers.cookie=options.cookie;
  if(options.context)headers['x-workspace-context']=options.context;
  if(options.csrf)headers['x-csrf-token']=options.csrf;
  if(!['GET','HEAD','OPTIONS'].includes(method)&&options.origin!==null)headers.origin=options.origin??origin;
  if(options.payload!==undefined)headers['content-type']='application/json';
  return app.inject({method,url,payload:options.payload===undefined?undefined:JSON.stringify(options.payload),headers,remoteAddress:options.ip??'127.0.0.1'});
 };
 const cookie=(response:{cookies:Array<{name:string;value:string}>},name:string)=>{
  const value=response.cookies.find(item=>item.name===name&&item.value);expect(value).toBeDefined();return `${name}=${value!.value}`;
 };
 const bootstrap=async(ip=newIp())=>{const response=await call('GET','/studio-api/auth/bootstrap',{ip});expect(response.statusCode).toBe(200);return {cookie:cookie(response,'__Host-aiwork-preauth'),csrf:response.json<{csrfToken:string}>().csrfToken,ip};};
 const signup=async(username='FakeUser_A',password=fakePassword)=>{const boot=await bootstrap();const response=await call('POST','/studio-api/auth/register',{...boot,payload:{username,password}});expect(response.statusCode).toBe(201);return {cookie:cookie(response,'__Host-aiwork-session'),view:response.json<SessionView>(),ip:boot.ip};};
 const headers=(account:Account)=>({cookie:account.cookie,context:account.view.contextId,csrf:account.view.csrfToken,ip:account.ip});
 return {app,pool,schema,call,cookie,bootstrap,signup,headers,newIp,advance:(ms:number)=>{time=new Date(time.getTime()+ms);},close:async()=>{await app.close();await pool.end();await control.query(`DROP SCHEMA "${schema}" CASCADE`);await control.end();}};
}
export type Fixture=Awaited<ReturnType<typeof fixture>>;
