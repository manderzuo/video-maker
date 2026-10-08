import {beforeEach,afterEach,expect,it} from 'vitest';
import {fixture,type Fixture} from './account-fixture.js';
import {ApiSecrets} from '../src/security/api-secrets.js';
import {RestrictedOutbound,type OutboundRequest} from '../src/security/outbound.js';
let f:Fixture;let status:number;let body:string;let healthStatus:number;let healthBody:string;let calls:OutboundRequest[];
const base='https://api.example.test',key='FAKE_EPHEMERAL_PROBE_KEY';
beforeEach(async()=>{status=200;body=JSON.stringify({data:[{id:'Vendor/CaseModel'},{id:'Vendor/CaseModel'}]});healthStatus=200;healthBody='{"status":"ok"}';calls=[];
 const outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async request=>{calls.push(request);return request.url.endsWith('/healthz')?{status:healthStatus,body:Buffer.from(healthBody)}:{status,body:Buffer.from(body)};}});
 f=await fixture({schemaPrefix:'api_test',apiSettings:{secrets:new ApiSecrets({activeVersion:'fake',keys:new Map([['fake',Buffer.alloc(32,3)]])}),outbound}});
});afterEach(async()=>{await f?.close();});
it.each(['','/v1','/v1/','/v1/chat/completions'])('tests an unsaved empty-model draft at %s without creating config or key',async suffix=>{
 const a=await f.signup();const result=await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),payload:{apiBase:base+suffix,apiKey:key,requestId:'draft-1'}});
 expect(result.statusCode).toBe(200);expect(result.json()).toMatchObject({requestId:'draft-1',connection:'verified',catalogStatus:'ready',models:['Vendor/CaseModel']});expect(result.body).not.toContain(key);
 expect(calls[0]?.url).toBe(base+'/v1/models');expect((await f.pool.query('SELECT count(*)::int n FROM api_configs')).rows[0].n).toBe(0);expect((await f.pool.query('SELECT count(*)::int n FROM api_secret_versions')).rows[0].n).toBe(0);
});
it.each([404,405,501])('reports catalog %d as unavailable and connection unknown',async code=>{
 status=code;body='upstream '+key;const a=await f.signup();const result=await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),payload:{apiBase:base,apiKey:key,requestId:'missing'}});
 expect(result.json()).toMatchObject({connection:'unknown',catalogStatus:'unavailable',models:[]});expect(result.body).not.toContain(key);expect(calls).toHaveLength(1);
});
it.each([401,403,500,302])('never reports %d as verified or exposes raw upstream body',async code=>{
 status=code;body=key;const a=await f.signup();const result=await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),payload:{apiBase:base,apiKey:key,requestId:'failed'}});
 expect(result.json()).toMatchObject({connection:'failed',catalogStatus:'failed',models:[]});expect(result.body).not.toContain(key);
});
it.each([{response:'{"data":[]}',connection:'verified',catalogStatus:'empty'},{response:'bad json',connection:'unknown',catalogStatus:'failed'},{response:'{"unexpected":[]}',connection:'unknown',catalogStatus:'failed'},{response:'{"data":[{"id":"bad\\nname"}]}',connection:'unknown',catalogStatus:'failed'}])('distinguishes empty catalog and malformed data %#',async data=>{
 body=data.response;const a=await f.signup();const result=await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),payload:{apiBase:base,apiKey:key,requestId:'shape'}});expect(result.json()).toMatchObject({connection:data.connection,catalogStatus:data.catalogStatus,models:[]});
});
it('does not alter saved config or version when probing a different draft',async()=>{
 const a=await f.signup();await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a),payload:{apiBase:base,model:'Saved',apiKey:'FAKE_SAVED_PROBE_KEY',expectedRevision:null}});
 await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),payload:{apiBase:base,apiKey:key,requestId:'draft-new'}});
 expect(calls[0]?.apiKey).toBe(key);expect((await f.call('GET','/studio-api/me/model-configs',f.headers(a))).json().configs[0]).toMatchObject({model:'Saved',revision:1});expect((await f.pool.query('SELECT count(*)::int n FROM api_secret_versions')).rows[0].n).toBe(1);
});
it('checks video health before catalog using the same pinned address and no generation request',async()=>{
 const a=await f.signup();const result=await f.call('POST','/studio-api/me/model-configs/video/test',{...f.headers(a),payload:{apiBase:base,apiKey:key,requestId:'video'}});
 expect(result.json()).toMatchObject({connection:'verified',catalogStatus:'ready'});expect(calls.map(call=>call.url)).toEqual([base+'/healthz',base+'/v1/models']);expect(calls.every(call=>call.address==='93.184.216.34')).toBe(true);
});
it.each([401,403,404,500])('stops after failed video health %d without fetching catalog',async code=>{
 healthStatus=code;const a=await f.signup();const result=await f.call('POST','/studio-api/me/model-configs/video/test',{...f.headers(a),payload:{apiBase:base,apiKey:key,requestId:'video-failed'}});
 expect(result.json()).toMatchObject({connection:'failed',catalogStatus:'failed',models:[]});expect(calls.map(call=>call.url)).toEqual([base+'/healthz']);
});
it('rejects malformed video health and keeps unavailable video catalog unknown',async()=>{
 const a=await f.signup();healthBody='not-json';const payload={apiBase:base,apiKey:key,requestId:'video-shape'};
 const failed=await f.call('POST','/studio-api/me/model-configs/video/test',{...f.headers(a),payload});expect(failed.json().connection).toBe('failed');expect(calls).toHaveLength(1);
 healthBody='{"status":"ok"}';status=404;const unavailable=await f.call('POST','/studio-api/me/model-configs/video/test',{...f.headers(a),payload});expect(unavailable.json()).toMatchObject({connection:'unknown',catalogStatus:'unavailable'});
});
it('atomically limits concurrent probes per user, including encoded routes, before DNS or decryption',async()=>{
 const a=await f.signup();const payload={apiBase:base,apiKey:key,requestId:'rate'};
 const results=await Promise.all(Array.from({length:12},()=>f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),payload})));
 expect(results.filter(result=>result.statusCode===200)).toHaveLength(10);expect(results.filter(result=>result.statusCode===429)).toHaveLength(2);expect(calls).toHaveLength(10);
 expect((await f.call('POST','/studio-api/me/model-configs/%74ext/test',{...f.headers(a),payload})).statusCode).toBe(429);expect(calls).toHaveLength(10);
 f.advance(60000);expect((await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),payload})).statusCode).toBe(200);expect(calls).toHaveLength(11);
});
it('caps aggregate probe traffic per real IP across users',async()=>{
 const accounts=await Promise.all(['FakeRate_A','FakeRate_B','FakeRate_C','FakeRate_D'].map(name=>f.signup(name)));
 const payload={apiBase:base,apiKey:key,requestId:'rate-ip'},ip='127.0.1.9';
 for(const account of accounts.slice(0,3)){
  const responses=await Promise.all(Array.from({length:10},()=>f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(account),ip,payload})));expect(responses.every(response=>response.statusCode===200)).toBe(true);
 }
 const rejected=await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(accounts[3]!),ip,payload,extraHeaders:{'x-forwarded-for':'93.184.216.34'}});expect(rejected.statusCode).toBe(429);expect(calls).toHaveLength(30);
});
