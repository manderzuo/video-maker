import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {fixture,type Fixture} from './account-fixture.js';
import {ApiSecrets} from '../src/security/api-secrets.js';
import {RestrictedOutbound,type OutboundRequest} from '../src/security/outbound.js';
let f:Fixture;
let calls:OutboundRequest[];
let secrets:ApiSecrets;
const base='https://api.example.test';
const fakeKeyA='FAKE_API_KEY_ACCOUNT_A';
const fakeKeyB='FAKE_API_KEY_ACCOUNT_B';
beforeEach(async()=>{
 calls=[];secrets=new ApiSecrets({activeVersion:'test-1',keys:new Map([['test-1',Buffer.alloc(32,7)]])});
 const outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async request=>{calls.push(request);return {status:200,body:Buffer.from(JSON.stringify({data:[{id:'Vendor/Manual-Model'}]}))};}});
 f=await fixture({schemaPrefix:'api_test',apiSettings:{secrets,outbound}});
});
afterEach(async()=>{await f?.close();});
it('isolates A/B config and key while returning only safe views',async()=>{
 const a=await f.signup('FakeApi_A'),b=await f.signup('FakeApi_B');
 for(const [account,key] of [[a,fakeKeyA],[b,fakeKeyB]] as const){
  const saved=await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(account),payload:{apiBase:base,model:' Vendor/Manual-Model ',apiKey:key,expectedRevision:null}});
  expect(saved.statusCode).toBe(200);expect(saved.json()).toEqual({channel:'text',apiBase:base,model:'Vendor/Manual-Model',revision:1,hasKey:true});expect(saved.body).not.toContain(key);
  const probe=await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(account),payload:{apiBase:base,requestId:'probe-own'}});
  expect(probe.statusCode).toBe(200);expect(probe.body).not.toContain(key);
 }
 expect(calls.map(c=>c.apiKey)).toEqual([fakeKeyA,fakeKeyB]);
 const rows=(await f.pool.query('SELECT * FROM api_secret_versions')).rows;
 expect(rows).toHaveLength(2);for(const row of rows){expect(JSON.stringify(row)).not.toContain(fakeKeyA);expect(JSON.stringify(row)).not.toContain(fakeKeyB);}
 const read=await f.call('GET','/studio-api/me/model-configs',f.headers(a));expect(read.statusCode).toBe(200);expect(read.json()).toEqual({configs:[{channel:'text',apiBase:base,model:'Vendor/Manual-Model',revision:1,hasKey:true}]});
});
it('saves untested directory-free names without any outbound request',async()=>{
 const a=await f.signup();const response=await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a),payload:{apiBase:base+'/v1',model:'Vendor/Not-In-Catalog',apiKey:fakeKeyA,expectedRevision:null}});
 expect(response.statusCode).toBe(200);expect(response.json().apiBase).toBe(base);expect(response.json().model).toBe('Vendor/Not-In-Catalog');expect(calls).toHaveLength(0);
});
it('keeps same-address omitted key, versions new key, rejects omitted key at another address',async()=>{
 const a=await f.signup();const save=(payload:unknown)=>f.call('PATCH','/studio-api/me/model-configs/video',{...f.headers(a),payload});
 expect((await save({apiBase:base,model:'v1',apiKey:fakeKeyA,expectedRevision:null})).statusCode).toBe(200);
 expect((await save({apiBase:base+'/v1',model:'v2',expectedRevision:1})).statusCode).toBe(200);
 expect((await f.pool.query('SELECT count(*)::int n FROM api_secret_versions')).rows[0].n).toBe(1);
 expect((await save({apiBase:'https://other.example.test',model:'v3',expectedRevision:2})).statusCode).toBe(422);
 const rejected=await f.call('POST','/studio-api/me/model-configs/video/test',{...f.headers(a),payload:{apiBase:'https://other.example.test',requestId:'new-address'}});expect(rejected.statusCode).toBe(422);expect(calls).toHaveLength(0);
 expect((await save({apiBase:base,model:'v3',apiKey:fakeKeyB,expectedRevision:2})).statusCode).toBe(200);
 expect((await f.pool.query('SELECT secret_version FROM api_secret_versions ORDER BY secret_version')).rows.map(r=>r.secret_version)).toEqual([1,2]);
});
it('rejects stale revisions, null after first save, and cross-session context',async()=>{
 const a=await f.signup('FakeApi_A'),b=await f.signup('FakeApi_B');const payload={apiBase:base,model:'M',apiKey:fakeKeyA,expectedRevision:null};
 expect((await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a),payload})).statusCode).toBe(200);
 expect((await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a),payload})).statusCode).toBe(409);
 expect((await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a),payload:{...payload,expectedRevision:0}})).statusCode).toBe(409);
 expect((await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a),cookie:b.cookie,payload})).statusCode).toBe(409);
 expect((await f.call('GET','/studio-api/me/model-configs',f.headers(b))).json()).toEqual({configs:[]});
});
it('rolls back both config and secret version on encryption failure',async()=>{
 const a=await f.signup();const save=(payload:unknown)=>f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a),payload});
 await save({apiBase:base,model:'Original',apiKey:fakeKeyA,expectedRevision:null});
 vi.spyOn(secrets,'seal').mockImplementation(()=>{throw new Error(fakeKeyB);});
 const failed=await save({apiBase:base,model:'Changed',apiKey:fakeKeyB,expectedRevision:1});expect(failed.statusCode).toBe(500);expect(failed.body).not.toContain(fakeKeyB);
 expect((await f.call('GET','/studio-api/me/model-configs',f.headers(a))).json().configs[0]).toMatchObject({model:'Original',revision:1});
 expect((await f.pool.query('SELECT count(*)::int n FROM api_secret_versions')).rows[0].n).toBe(1);
});
it('rolls back on database insertion failure and does not lose original configuration',async()=>{
 const a=await f.signup();const save=(payload:unknown)=>f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a),payload});
 await save({apiBase:base,model:'Original',apiKey:fakeKeyA,expectedRevision:null});
 await f.pool.query("CREATE FUNCTION reject_new_secret() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic write failure'; END $$; CREATE TRIGGER reject_new_secret BEFORE INSERT ON api_secret_versions FOR EACH ROW EXECUTE FUNCTION reject_new_secret()");
 expect((await save({apiBase:base,model:'Changed',apiKey:fakeKeyB,expectedRevision:1})).statusCode).toBe(500);
 expect((await f.call('GET','/studio-api/me/model-configs',f.headers(a))).json().configs[0]).toMatchObject({model:'Original',revision:1});
 expect((await f.pool.query('SELECT count(*)::int n FROM api_secret_versions')).rows[0].n).toBe(1);
});
it('serializes concurrent first saves with exactly one success and one conflict',async()=>{
 const a=await f.signup();const results=await Promise.all(['One','Two'].map(model=>f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a),payload:{apiBase:base,model,apiKey:fakeKeyA,expectedRevision:null}})));
 expect(results.map(r=>r.statusCode).sort()).toEqual([200,409]);expect((await f.pool.query('SELECT count(*)::int n FROM api_secret_versions')).rows[0].n).toBe(1);
});
it.each(['','   ','********','sk-****','bad\nheader'])('rejects invalid key %# without outbound request',async apiKey=>{
 const a=await f.signup();const response=await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a),payload:{apiBase:base,model:'M',apiKey,expectedRevision:null}});expect(response.statusCode).toBe(400);expect(calls).toHaveLength(0);
});
it('rejects client ownership fields and unsigned writes before any provider request',async()=>{
 const a=await f.signup();const payload={apiBase:base,model:'M',apiKey:fakeKeyA,expectedRevision:null};
 expect((await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a),payload:{...payload,userId:'another'}})).statusCode).toBe(400);
 expect((await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),csrf:undefined,payload:{apiBase:base,apiKey:fakeKeyA,requestId:'csrf'}})).statusCode).toBe(403);
 expect((await f.call('GET','/studio-api/me/model-configs')).statusCode).toBe(401);expect(calls).toHaveLength(0);
});
