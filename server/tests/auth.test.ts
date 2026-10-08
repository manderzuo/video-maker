import {beforeEach,afterEach,describe,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {fixture,fakePassword,origin,type Fixture} from './account-fixture.js';
let f:Fixture;beforeEach(async()=>{f=await fixture();});afterEach(async()=>{await f?.close();});
describe('real database account bootstrap and authentication',()=>{
 it('anonymous bootstrap requires no workspace context and uses a ten-minute host-only cookie',async()=>{
  const response=await f.call('GET','/studio-api/auth/bootstrap');expect(response.statusCode).toBe(200);
  expect(response.json().csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(response.json().expiresAt).toBe('2026-10-08T12:10:00.000Z');
  const value=String(response.headers['set-cookie']);for(const flag of ['__Host-aiwork-preauth=','Max-Age=600','Path=/','HttpOnly','Secure','SameSite=Lax'])expect(value).toContain(flag);expect(value).not.toMatch(/Domain=/i);
  expect(response.headers['cache-control']).toBe('no-store');
 });
 it('registers from fresh bootstrap and stores only password hash/session digest',async()=>{
  const a=await f.signup('  ＦａｋｅUser_Ａ  ');expect(a.view.user.username).toBe('FakeUser_A');expect(a.view.contextId).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(JSON.stringify(a.view)).not.toContain(a.cookie.split('=')[1]);expect(JSON.stringify(a.view)).not.toContain(fakePassword);
  const stored=await f.pool.query('SELECT username_key,password_hash FROM users');expect(stored.rows[0].username_key).toBe('fakeuser_a');expect(stored.rows[0].password_hash).toMatch(/^\$argon2id\$/);
  const sessions=await f.pool.query('SELECT token_digest FROM sessions');expect(sessions.rows[0].token_digest).toBe(createHash('sha256').update(a.cookie.split('=')[1]!).digest('hex'));
  const session=await f.call('GET','/studio-api/session',{cookie:a.cookie,ip:a.ip});expect(session.statusCode).toBe(200);expect(session.json()).toEqual(a.view);
 });
 it.each(['missing-cookie','missing-token','wrong-token','other-bootstrap-token','expired','wrong-origin','missing-origin'])('rejects invalid preauthentication %s without creating a user',async(kind)=>{
  const b=await f.bootstrap();let cookie:string|undefined=b.cookie,csrf:string|undefined=b.csrf,requestOrigin:string|null=origin;
  if(kind==='missing-cookie')cookie=undefined;if(kind==='missing-token')csrf=undefined;if(kind==='wrong-token')csrf='FAKE_WRONG_TOKEN';if(kind==='other-bootstrap-token')csrf=(await f.bootstrap()).csrf;if(kind==='expired')f.advance(600000);if(kind==='wrong-origin')requestOrigin='https://other.test';if(kind==='missing-origin')requestOrigin=null;
  const response=await f.call('POST','/studio-api/auth/register',{cookie,csrf,origin:requestOrigin,ip:b.ip,payload:{username:'Fake_Reject',password:fakePassword}});expect(response.statusCode).toBe(403);expect((await f.pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(0);
 });
 it('consumes successful bootstrap, removes preauth cookie and rotates existing session',async()=>{
  const a=await f.signup();const b=await f.bootstrap(a.ip);
  const logged=await f.call('POST','/studio-api/auth/login',{...b,cookie:b.cookie+'; '+a.cookie,payload:{username:'fakeuser_a',password:fakePassword}});expect(logged.statusCode).toBe(200);
  const fresh=f.cookie(logged,'__Host-aiwork-session');expect(fresh).not.toBe(a.cookie);expect(logged.cookies.find(c=>c.name==='__Host-aiwork-preauth')?.value).toBe('');
  expect((await f.call('GET','/studio-api/session',{cookie:a.cookie,ip:a.ip})).statusCode).toBe(401);
  expect((await f.call('POST','/studio-api/auth/login',{...b,payload:{username:'fakeuser_a',password:fakePassword}})).statusCode).toBe(403);
 });
 it('rejects concurrent normalized duplicate usernames with exactly one created account',async()=>{
  const one=await f.bootstrap(),two=await f.bootstrap();const requests=await Promise.all([f.call('POST','/studio-api/auth/register',{...one,payload:{username:'Ｆａｋｅ_One',password:fakePassword}}),f.call('POST','/studio-api/auth/register',{...two,payload:{username:'fake_one',password:fakePassword}})]);
  expect(requests.map(r=>r.statusCode).sort()).toEqual([201,409]);expect((await f.pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(1);
 });
 it('wrong/unknown password results are identical and issue no authenticated cookie',async()=>{
  await f.signup();const boot=await f.bootstrap();const wrong=await f.call('POST','/studio-api/auth/login',{...boot,payload:{username:'FakeUser_A',password:'Wrong fake password 123'}});const absent=await f.call('POST','/studio-api/auth/login',{...boot,payload:{username:'FakeMissing',password:'Wrong fake password 123'}});
  expect(wrong.statusCode).toBe(401);expect(absent.statusCode).toBe(401);expect(wrong.json()).toEqual(absent.json());expect(wrong.cookies.find(c=>c.name==='__Host-aiwork-session')).toBeUndefined();
 });
 it.each([{username:'ab',password:fakePassword},{username:'Bad @ name',password:fakePassword},{username:'A'.repeat(33),password:fakePassword},{username:'Fake_Len',password:'x'.repeat(14)},{username:'Fake_Len',password:'x'.repeat(129)}])('rejects invalid username/password boundaries %#',async(payload)=>{const b=await f.bootstrap();expect((await f.call('POST','/studio-api/auth/register',{...b,payload})).statusCode).toBe(400);});
 it('accepts 15 unicode codepoints and does not trim passwords at login',async()=>{const password='😀'.repeat(15)+' ';await f.signup('Fake_Unicode',password);const b=await f.bootstrap();expect((await f.call('POST','/studio-api/auth/login',{...b,payload:{username:'fake_unicode',password:password.trim()}})).statusCode).toBe(401);expect((await f.call('POST','/studio-api/auth/login',{...b,payload:{username:'fake_unicode',password}})).statusCode).toBe(200);});
 it('logout revokes the session immediately and clears its cookie',async()=>{const a=await f.signup();const response=await f.call('POST','/studio-api/auth/logout',f.headers(a));expect(response.statusCode).toBe(204);expect(response.cookies.find(c=>c.name==='__Host-aiwork-session')?.value).toBe('');expect((await f.call('GET','/studio-api/session',{cookie:a.cookie,ip:a.ip})).statusCode).toBe(401);});
 it('expires idle sessions at 24 hours',async()=>{const a=await f.signup();f.advance(24*3600000);expect((await f.call('GET','/studio-api/session',{cookie:a.cookie,ip:a.ip})).statusCode).toBe(401);});
 it('expires absolute sessions at seven days despite daily use',async()=>{const a=await f.signup();for(let i=0;i<13;i++){f.advance(12*3600000);expect((await f.call('GET','/studio-api/session',{cookie:a.cookie,ip:a.ip})).statusCode).toBe(200);}f.advance(12*3600000);expect((await f.call('GET','/studio-api/session',{cookie:a.cookie,ip:a.ip})).statusCode).toBe(401);});
 it('rejects oversized bodies before password hashing',async()=>{const b=await f.bootstrap();expect((await f.call('POST','/studio-api/auth/register',{...b,payload:{username:'X'.repeat(20000),password:fakePassword}})).statusCode).toBe(413);});
 it('throttles 30 auth requests per IP per minute and ignores spoofed forwarded IP',async()=>{const ip=f.newIp();for(let i=0;i<30;i++)expect((await f.call('GET','/studio-api/auth/bootstrap',{ip,extraHeaders:{'x-forwarded-for':`192.0.2.${i}`}})).statusCode).toBe(200);expect((await f.call('GET','/studio-api/auth/bootstrap',{ip})).statusCode).toBe(429);f.advance(60000);expect((await f.call('GET','/studio-api/auth/bootstrap',{ip})).statusCode).toBe(200);});
 it('throttles five failed account+IP logins for fifteen minutes',async()=>{await f.signup();const b=await f.bootstrap();for(let i=0;i<5;i++)expect((await f.call('POST','/studio-api/auth/login',{...b,payload:{username:'fakeuser_a',password:'Wrong fake password 123'}})).statusCode).toBe(401);expect((await f.call('POST','/studio-api/auth/login',{...b,payload:{username:'fakeuser_a',password:fakePassword}})).statusCode).toBe(429);f.advance(15*60000);const fresh=await f.bootstrap(b.ip);expect((await f.call('POST','/studio-api/auth/login',{...fresh,payload:{username:'fakeuser_a',password:fakePassword}})).statusCode).toBe(200);});
 it('throttles ten registrations per IP per hour',async()=>{const ip=f.newIp();for(let i=0;i<10;i++){const b=await f.bootstrap(ip);expect((await f.call('POST','/studio-api/auth/register',{...b,payload:{username:`Fake_Reg_${i}`,password:fakePassword}})).statusCode).toBe(201);}const b=await f.bootstrap(ip);expect((await f.call('POST','/studio-api/auth/register',{...b,payload:{username:'Fake_Reg_11',password:fakePassword}})).statusCode).toBe(429);});
});

it('renewing preauth invalidates the previous anonymous cookie',async()=>{const b=await f.bootstrap();expect((await f.call('GET','/studio-api/auth/bootstrap',{cookie:b.cookie,ip:b.ip})).statusCode).toBe(200);expect((await f.call('POST','/studio-api/auth/register',{...b,payload:{username:'Fake_Renew',password:fakePassword}})).statusCode).toBe(403);});
it('concurrent wrong-password attempts enforce exactly five failures before throttling',async()=>{await f.signup();const ip=f.newIp();const boots=await Promise.all(Array.from({length:8},()=>f.bootstrap(ip)));const results=await Promise.all(boots.map(b=>f.call('POST','/studio-api/auth/login',{...b,payload:{username:'fakeuser_a',password:'Wrong fake password 123'}})));expect(results.filter(r=>r.statusCode===401)).toHaveLength(5);expect(results.filter(r=>r.statusCode===429)).toHaveLength(3);});

it('session state and revocation persist across separate application instances',async()=>{const a=await f.signup();const {buildStudioApp}=await import('../src/app.js');const second=await buildStudioApp({pool:f.pool,origin,now:()=>new Date('2026-10-08T12:00:00.000Z')});try{const session=await second.inject({method:'GET',url:'/studio-api/session',headers:{cookie:a.cookie}});expect(session.statusCode).toBe(200);expect(session.json()).toEqual(a.view);expect((await second.inject({method:'POST',url:'/studio-api/auth/logout',headers:{cookie:a.cookie,origin,'x-workspace-context':a.view.contextId,'x-csrf-token':a.view.csrfToken}})).statusCode).toBe(204);expect((await f.call('GET','/studio-api/session',{cookie:a.cookie})).statusCode).toBe(401);}finally{await second.close();}});
it('forged or malformed cookie cannot be authenticated by a context header alone',async()=>{const a=await f.signup();for(const cookie of ['__Host-aiwork-session=FAKE_FORGED','__Host-aiwork-session='+('a'.repeat(43))])expect((await f.call('GET','/studio-api/me/document',{cookie,context:a.view.contextId})).statusCode).toBe(401);});

it('same preauth concurrent successful registrations consume it only once',async()=>{const b=await f.bootstrap();const responses=await Promise.all(['Fake_Claim_A','Fake_Claim_B'].map(username=>f.call('POST','/studio-api/auth/register',{...b,payload:{username,password:fakePassword}})));expect(responses.map(r=>r.statusCode).sort()).toEqual([201,403]);expect((await f.pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(1);});
it.each([15,128])('accepts exact%d Unicode password codepoints and verifies them',async(length)=>{const password='😀'.repeat(length);const username=`Fake_Exact_${length}`;await f.signup(username,password);const b=await f.bootstrap();expect((await f.call('POST','/studio-api/auth/login',{...b,payload:{username,password}})).statusCode).toBe(200);});
