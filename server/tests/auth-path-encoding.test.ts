import {beforeEach,afterEach,expect,it} from 'vitest';
import {fixture,fakePassword,type Fixture} from './account-fixture.js';
let f:Fixture;beforeEach(async()=>{f=await fixture();});afterEach(async()=>{await f?.close();});
it('encoded bootstrap route applies the same no-store and30-IP limit',async()=>{
 const ip=f.newIp();for(let i=0;i<30;i++){const response=await f.call('GET','/%73tudio-%61pi/%61uth/%62ootstrap',{ip});expect(response.statusCode).toBe(200);expect(response.headers['cache-control']).toBe('no-store');}
 expect((await f.call('GET','/%73tudio-api/auth/bootstrap',{ip})).statusCode).toBe(429);
});
it('encoded login route cannot bypass global auth-IP rate by rotating unknown usernames',async()=>{
 const b=await f.bootstrap();for(let i=0;i<29;i++)expect((await f.call('POST','/%73tudio-api/auth/login',{...b,payload:{username:`Fake_Unknown_${i}`,password:fakePassword}})).statusCode).toBe(401);
 const rejected=await f.call('POST','/%73tudio-api/auth/login',{...b,payload:{username:'Fake_Unknown_30',password:fakePassword}});expect(rejected.statusCode).toBe(429);expect(rejected.headers['cache-control']).toBe('no-store');
});
it('encoded private route still derives the current context and enforces cross-account conflict',async()=>{
 const a=await f.signup('Fake_A'),b=await f.signup('Fake_B');const own=await f.call('GET','/%73tudio-api/me/document',f.headers(a));expect(own.statusCode).toBe(200);expect(own.headers['cache-control']).toBe('no-store');
 expect((await f.call('GET','/%73tudio-api/me/document',{...f.headers(b),context:a.view.contextId})).statusCode).toBe(409);
 expect((await f.call('GET','/%73tudio-api/unknown-deep-resource')).statusCode).toBe(401);
});

it('normal encoded and absolute-form auth routes share the same global IP counter',async()=>{
 const ip=f.newIp();for(let i=0;i<30;i++){const url=i<15?'/studio-api/auth/bootstrap':'/%73tudio-api/auth/bootstrap';expect((await f.call('GET',url,{ip})).statusCode).toBe(200);}
 expect((await f.call('GET','https://studio.test/%73tudio-api/auth/bootstrap',{ip})).statusCode).toBe(429);
});
it('authenticated unknown API error is fixed and does not reflect method path or query',async()=>{
 const a=await f.signup();const response=await f.call('GET','/studio-api/FAKE_PRIVATE_PATH?draft=FAKE_PRIVATE_QUERY_DO_NOT_REFLECT',f.headers(a));expect(response.statusCode).toBe(404);expect(response.json()).toEqual({code:'NOT_FOUND'});expect(response.headers['cache-control']).toBe('no-store');expect(response.body).not.toContain('FAKE_PRIVATE');
});

it('malformed URL framework error is sanitized and no-store before request hooks',async()=>{
 const response=await f.call('GET','/studio-api/%ZZ?probe=FAKE_PRIVATE_QUERY_DO_NOT_REFLECT');expect(response.statusCode).toBe(400);expect(response.json()).toEqual({code:'INVALID_REQUEST'});expect(response.headers['cache-control']).toBe('no-store');expect(response.body).not.toContain('FAKE_PRIVATE');expect(response.body).not.toContain('%ZZ');
});
it('oversized route parameter framework error is sanitized and no-store',async()=>{
 const response=await f.call('GET','/studio-api/test-documents/FAKE_PRIVATE_'+ 'a'.repeat(200));expect(response.statusCode).toBe(414);expect(response.json()).toEqual({code:'INVALID_REQUEST'});expect(response.headers['cache-control']).toBe('no-store');expect(response.body).not.toContain('FAKE_PRIVATE');
});
