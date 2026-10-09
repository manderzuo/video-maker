import {beforeEach,afterEach,expect,it} from 'vitest';
import {fixture,type Fixture} from './account-fixture.js';
import {ApiSecrets} from '../src/security/api-secrets.js';
import {RestrictedOutbound,type OutboundRequest} from '../src/security/outbound.js';
let f:Fixture;let status:number;let body:string;let healthStatus:number;let healthBody:string;let calls:OutboundRequest[];
let secondStatus:number;let secondBody:string;
const base='https://api.example.test',key='FAKE_EPHEMERAL_PROBE_KEY';
beforeEach(async()=>{status=200;body=JSON.stringify({data:[{id:'Vendor/CaseModel'},{id:'Vendor/CaseModel'}]});healthStatus=200;healthBody='{"status":"ok"}';calls=[];secondStatus=200;secondBody='';
 const outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async request=>{calls.push(request);if(request.url.endsWith('/healthz'))return {status:healthStatus,body:Buffer.from(healthBody)};if(request.url.includes('page=2'))return {status:secondStatus,body:Buffer.from(secondBody)};return {status,body:Buffer.from(body)};}});
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
it.each([401,403,404,500])('ignores failed video health %d and still verifies an accessible catalog',async code=>{
 healthStatus=code;const a=await f.signup();const result=await f.call('POST','/studio-api/me/model-configs/video/test',{...f.headers(a),payload:{apiBase:base,apiKey:key,requestId:'video-fallback'}});
 expect(result.json()).toMatchObject({connection:'verified',catalogStatus:'ready',complete:true});expect(calls.map(call=>call.url)).toEqual([base+'/healthz',base+'/v1/models']);
});
it('treats malformed video health as a gateway without healthz and keeps unavailable video catalog unknown',async()=>{
 const a=await f.signup();healthBody='not-json';const payload={apiBase:base,apiKey:key,requestId:'video-shape'};
 const verified=await f.call('POST','/studio-api/me/model-configs/video/test',{...f.headers(a),payload});expect(verified.json()).toMatchObject({connection:'verified',catalogStatus:'ready',complete:true});expect(calls.map(call=>call.url)).toEqual([base+'/healthz',base+'/v1/models']);
 healthBody='{"status":"ok"}';status=404;const unavailable=await f.call('POST','/studio-api/me/model-configs/video/test',{...f.headers(a),payload});expect(unavailable.json()).toMatchObject({connection:'unknown',catalogStatus:'unavailable'});
});
it.each([401,403])('reports catalog %d as a permission failure without exposing the key',async code=>{
 status=code;body=key;const a=await f.signup();const result=await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),payload:{apiBase:base,apiKey:key,requestId:'denied'}});
 expect(result.json()).toMatchObject({connection:'failed',catalogStatus:'failed',models:[]});expect(result.body).not.toContain(key);
});
it('merges same-origin catalog pages and reports complete',async()=>{
 body=JSON.stringify({data:[{id:'Vendor/PageOne'}],next:'/v1/models?page=2'});secondBody=JSON.stringify({data:[{id:'Vendor/PageTwo'}]});
 const a=await f.signup();const result=await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),payload:{apiBase:base,apiKey:key,requestId:'paged'}});
 expect(result.json()).toMatchObject({connection:'verified',catalogStatus:'ready',models:['Vendor/PageOne','Vendor/PageTwo'],complete:true});
 expect(calls.map(call=>call.url)).toEqual([base+'/v1/models',base+'/v1/models?page=2']);expect(calls.every(call=>new URL(call.url).origin===base)).toBe(true);
});
it('marks a cross-origin next page as incomplete without sending the key there',async()=>{
 body=JSON.stringify({data:[{id:'Vendor/PageOne'}],next:'https://other.example.test/v1/models'});
 const a=await f.signup();const result=await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),payload:{apiBase:base,apiKey:key,requestId:'paged-foreign'}});
 expect(result.json()).toMatchObject({connection:'verified',catalogStatus:'ready',models:['Vendor/PageOne'],complete:false});
 expect(calls).toHaveLength(1);expect(calls.every(call=>new URL(call.url).origin===base)).toBe(true);
});
it('stops a self-referencing next page without looping forever',async()=>{
 body=JSON.stringify({data:[{id:'Vendor/PageOne'}],next:'/v1/models?page=2'});secondBody=JSON.stringify({data:[{id:'Vendor/PageTwo'}],next:'/v1/models?page=2'});
 const a=await f.signup();const result=await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),payload:{apiBase:base,apiKey:key,requestId:'paged-loop'}});
 expect(result.json()).toMatchObject({models:['Vendor/PageOne','Vendor/PageTwo'],complete:false});expect(calls).toHaveLength(2);
});
it('marks a failed second page and a dangling has_more as incomplete while keeping the first page',async()=>{
 body=JSON.stringify({data:[{id:'Vendor/PageOne'}],next:'/v1/models?page=2'});secondStatus=500;secondBody='nope';
 const a=await f.signup();const failed=await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),payload:{apiBase:base,apiKey:key,requestId:'paged-broken'}});
 expect(failed.json()).toMatchObject({connection:'verified',catalogStatus:'ready',models:['Vendor/PageOne'],complete:false});
 body=JSON.stringify({data:[{id:'Vendor/PageOne'}],has_more:true});
 const dangling=await f.call('POST','/studio-api/me/model-configs/text/test',{...f.headers(a),payload:{apiBase:base,apiKey:key,requestId:'paged-dangling'}});
 expect(dangling.json()).toMatchObject({models:['Vendor/PageOne'],complete:false});
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
