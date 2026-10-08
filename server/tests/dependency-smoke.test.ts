import {describe,expect,it} from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import * as argon2 from 'argon2';
import {z} from 'zod';

// These are dependency checks; no auth route or listening service exists yet.
const hashOptions={type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1} as const;
const fakePassword='Fake local password with spaces 123';

describe('pinned backend dependencies',()=>{
 it('Fastify and cookie plugin serialize host-only flags and parse a fake cookie',async()=>{
  const app=Fastify({logger:false});
  try{
   await app.register(cookie);
   app.get('/dependency-smoke',(request,reply)=>{
    reply.setCookie('__Host-aiwork-smoke','FAKE_TEST_COOKIE_ONLY',{secure:true,httpOnly:true,sameSite:'lax',path:'/'});
    return {received:request.cookies['__Host-aiwork-smoke']??null};
   });
   const first=await app.inject({method:'GET',url:'/dependency-smoke'});
   expect(first.statusCode).toBe(200);
   const serialized=String(first.headers['set-cookie']);
   expect(serialized).toContain('__Host-aiwork-smoke=FAKE_TEST_COOKIE_ONLY');
   for(const flag of ['Path=/','HttpOnly','Secure','SameSite=Lax'])expect(serialized).toContain(flag);
   expect(serialized).not.toMatch(/Domain=/i);
   const next=await app.inject({method:'GET',url:'/dependency-smoke',headers:{cookie:'__Host-aiwork-smoke=FAKE_TEST_COOKIE_ONLY'}});
   expect(next.json()).toEqual({received:'FAKE_TEST_COOKIE_ONLY'});
  }finally{await app.close();}
 });
 it('loads native Argon2id with explicit memory/time/parallelism and rejects wrong password',async()=>{
  const encoded=await argon2.hash(fakePassword,hashOptions);
  const fields=encoded.split('$');
  expect(fields.slice(1,3)).toEqual(['argon2id','v=19']);
  expect(Object.fromEntries(fields[3]!.split(',').map(pair=>pair.split('=')))).toEqual({m:'19456',t:'2',p:'1'});
  expect(await argon2.verify(encoded,fakePassword)).toBe(true);
  expect(await argon2.verify(encoded,'Wrong fake password 456')).toBe(false);
 });
 it('generates distinct random salts for identical fake passwords',async()=>{
  const first=await argon2.hash(fakePassword,hashOptions);
  const second=await argon2.hash(fakePassword,hashOptions);
  expect(first).not.toBe(second);
  expect(await argon2.verify(second,fakePassword)).toBe(true);
 });
 it('preserves unicode, case and leading/trailing password spaces',async()=>{
  const original='  测试密码 Mixed Case 123  ';
  const encoded=await argon2.hash(original,hashOptions);
  expect(await argon2.verify(encoded,original)).toBe(true);
  expect(await argon2.verify(encoded,original.trim())).toBe(false);
  expect(await argon2.verify(encoded,original.toLowerCase())).toBe(false);
 });
 it('loads the pinned strict schema library',()=>{
  const schema=z.object({username:z.string()}).strict();
  expect(schema.parse({username:'FAKE_USER_A'})).toEqual({username:'FAKE_USER_A'});
  expect(schema.safeParse({username:'FAKE_USER_A',userId:'FAKE_OTHER_OWNER'}).success).toBe(false);
 });
});
