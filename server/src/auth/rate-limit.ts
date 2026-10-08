import type {Pool,PoolClient} from 'pg';
import {digest} from './session.js';
import {HttpError} from '../errors.js';
export const rateKey=(scope:string,identity:string)=>digest(scope+'\0'+identity);
export async function consumeRate(db:Pool|PoolClient,key:string,limit:number,duration:number,now:Date){
 const result=await db.query<{hits:number}>(`INSERT INTO auth_rate_limits(key_digest,hits,expires_at) VALUES($1,1,$3) ON CONFLICT(key_digest) DO UPDATE SET hits=CASE WHEN auth_rate_limits.expires_at<=$2 THEN 1 ELSE LEAST(auth_rate_limits.hits+1,$4) END,expires_at=CASE WHEN auth_rate_limits.expires_at<=$2 THEN $3 ELSE auth_rate_limits.expires_at END RETURNING hits`,[key,now,new Date(now.getTime()+duration),limit+1]);
 return result.rows[0]!.hits<=limit;
}
export async function enforceRate(db:Pool,key:string,limit:number,duration:number,now:Date){if(!await consumeRate(db,key,limit,duration,now))throw new HttpError(429,'RATE_LIMITED');}
export async function failedLogins(db:PoolClient,key:string,now:Date){const result=await db.query<{hits:number}>('SELECT hits FROM auth_rate_limits WHERE key_digest=$1 AND expires_at>$2',[key,now]);return result.rows[0]?.hits??0;}
