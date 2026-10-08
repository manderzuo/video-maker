import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {HttpError} from '../errors.js';
export const preauthCookie='__Host-aiwork-preauth',sessionCookie='__Host-aiwork-session';
export const cookieOptions={secure:true,httpOnly:true,sameSite:'lax',path:'/'} as const;
export const randomToken=()=>randomBytes(32).toString('base64url');
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const csrfToken=(raw:string,purpose:'preauth'|'session')=>createHmac('sha256',raw).update('aiwork-csrf:'+purpose).digest('base64url');
export function equalToken(left:unknown,right:string){if(typeof left!=='string'||left.length!==right.length)return false;const actual=Buffer.from(left),expected=Buffer.from(right);return actual.length===expected.length&&timingSafeEqual(actual,expected);}
export function validToken(raw:unknown):raw is string{return typeof raw==='string'&&/^[A-Za-z0-9_-]{43}$/.test(raw);}
export async function validatePreauth(db:Pool|PoolClient,raw:unknown,csrf:unknown,now:Date,lock=false){
 if(!validToken(raw)||!equalToken(csrf,csrfToken(raw,'preauth')))throw new HttpError(403,'PREAUTH_INVALID');
 const found=await db.query('SELECT token_digest FROM preauth_sessions WHERE token_digest=$1 AND expires_at>$2'+(lock?' FOR UPDATE':''),[digest(raw),now]);
 if(found.rowCount!==1)throw new HttpError(403,'PREAUTH_INVALID');return digest(raw);
}
export type SessionRow={token_digest:string;user_id:string;context_id:string;created_at:Date;last_seen_at:Date;expires_at:Date;username:string;onboarding_completed_at:Date|null};
export async function readSession(pool:Pool,raw:unknown,now:Date){
 if(!validToken(raw))throw new HttpError(401,'AUTH_REQUIRED');
 const found=await pool.query<SessionRow>('SELECT s.*,u.username,d.onboarding_completed_at FROM sessions s JOIN users u ON u.id=s.user_id JOIN user_documents d ON d.user_id=s.user_id WHERE s.token_digest=$1 AND s.expires_at>$2 AND s.last_seen_at>$3',[digest(raw),now,new Date(now.getTime()-24*3600000)]);
 if(!found.rows[0])throw new HttpError(401,'AUTH_REQUIRED');return {row:found.rows[0],raw};
}
export const sessionView=(row:SessionRow,raw:string)=>({user:{id:row.user_id,username:row.username},contextId:row.context_id,csrfToken:csrfToken(raw,'session'),onboardingCompletedAt:row.onboarding_completed_at?.toISOString()??null});
export async function createSession(client:PoolClient,userId:string,now:Date,oldRaw:unknown){
 if(validToken(oldRaw))await client.query('DELETE FROM sessions WHERE token_digest=$1',[digest(oldRaw)]);
 const raw=randomToken();await client.query('INSERT INTO sessions(token_digest,user_id,context_id,created_at,last_seen_at,expires_at) VALUES($1,$2,$3,$4,$4,$5)',[digest(raw),userId,randomToken(),now,new Date(now.getTime()+7*24*3600000)]);return raw;
}
