import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import {hashPassword,verifyPassword,passwordSchema} from '../security/password.js';
import {defaultPreferences} from '../users/contracts.js';
import {createSession,digest,randomToken,validatePreauth} from './session.js';
import {consumeRate,enforceRate,failedLogins,rateKey} from './rate-limit.js';
export const credentialsSchema=z.strictObject({username:z.string().transform(value=>value.normalize('NFKC').trim()).refine(value=>Array.from(value).length>=3&&Array.from(value).length<=32&&/^[\p{Script=Han}A-Za-z0-9_-]+$/u.test(value)),password:passwordSchema});
export function authService(pool:Pool,now:()=>Date){
 const dummyHash=hashPassword(randomToken());
 return {
  async register(input:z.infer<typeof credentialsSchema>,raw:unknown,csrf:unknown,oldRaw:unknown,ip:string){
   await validatePreauth(pool,raw,csrf,now());await enforceRate(pool,rateKey('register-ip',ip),10,3600000,now());
   const passwordHash=await hashPassword(input.password);const userId=randomUUID();
   try{return await transaction(pool,async client=>{
    const preauth=await validatePreauth(client,raw,csrf,now(),true);
    await client.query('INSERT INTO users(id,username,username_key,password_hash,created_at) VALUES($1,$2,$3,$4,$5)',[userId,input.username,input.username.toLowerCase(),passwordHash,now()]);
    await client.query('INSERT INTO user_documents(id,user_id,preferences) VALUES($1,$2,$3)',[randomUUID(),userId,JSON.stringify(defaultPreferences)]);
    await client.query('DELETE FROM preauth_sessions WHERE token_digest=$1',[preauth]);return await createSession(client,userId,now(),oldRaw);
   });}catch(error){if((error as {code?:string}).code==='23505')throw new HttpError(409,'USERNAME_TAKEN');throw error;}
  },
  async login(input:z.infer<typeof credentialsSchema>,raw:unknown,csrf:unknown,oldRaw:unknown,ip:string){
   const result=await transaction(pool,async client=>{
    const preauth=await validatePreauth(client,raw,csrf,now(),true);const key=rateKey('failed-login',input.username.toLowerCase()+'\0'+ip);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
    if(await failedLogins(client,key,now())>=5)return {error:new HttpError(429,'RATE_LIMITED')};
    const found=await client.query<{id:string;password_hash:string}>('SELECT id,password_hash FROM users WHERE username_key=$1',[input.username.toLowerCase()]);const user=found.rows[0];
    const verified=await verifyPassword(user?.password_hash??await dummyHash,input.password);
    if(!user||!verified){await consumeRate(client,key,5,15*60000,now());return {error:new HttpError(401,'AUTH_INVALID')};}
    await client.query('DELETE FROM auth_rate_limits WHERE key_digest=$1',[key]);await client.query('DELETE FROM preauth_sessions WHERE token_digest=$1',[preauth]);
    return {raw:await createSession(client,user.id,now(),oldRaw)};
   });if(result.error)throw result.error;return result.raw!;
  },
  async bootstrap(oldRaw:unknown){
   const raw=randomToken(),expiresAt=new Date(now().getTime()+600000);
   await transaction(pool,async client=>{
    if(typeof oldRaw==='string')await client.query('DELETE FROM preauth_sessions WHERE token_digest=$1',[digest(oldRaw)]);
    await client.query('DELETE FROM preauth_sessions WHERE expires_at<=$1',[now()]);await client.query('DELETE FROM auth_rate_limits WHERE expires_at<=$1',[now()]);
    await client.query('INSERT INTO preauth_sessions(token_digest,expires_at) VALUES($1,$2)',[digest(raw),expiresAt]);
   });return {raw,expiresAt};
  }
 };
}
