import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Pool} from 'pg';
import {HttpError} from '../errors.js';
import {readSession,sessionCookie,csrfToken,equalToken,type SessionRow} from './session.js';
import {enforceRate,rateKey} from './rate-limit.js';
export type AuthContext={userId:string;sessionId:string;contextId:string};
const contexts=new WeakMap<FastifyRequest,AuthContext>();
const sessions=new WeakMap<FastifyRequest,{row:SessionRow;raw:string}>();
export function requestAuthContext(request:FastifyRequest){const context=contexts.get(request);if(!context)throw new HttpError(401,'AUTH_REQUIRED');return context;}
export function requestSession(request:FastifyRequest){const session=sessions.get(request);if(!session)throw new HttpError(401,'AUTH_REQUIRED');return session;}
export function requireOrigin(request:FastifyRequest,origin:string){if(request.headers.origin!==origin)throw new HttpError(403,'CSRF_INVALID');}
function isApiPath(path:string){return path==='/studio-api'||path.startsWith('/studio-api/');}
function unmatchedPath(url:string,origin:string){try{return decodeURI(new URL(url,origin).pathname);}catch{return url.split('?')[0]!;}}
export function installAuthGuard(app:FastifyInstance,pool:Pool,origin:string,now:()=>Date){
 app.addHook('onRequest',async(request)=>{
  // Public exemptions come only from the router's matched, canonical route.
  // Raw unmatched URLs can classify a protected namespace, never grant access.
  const route=request.routeOptions.url;const matchedApi=typeof route==='string'&&isApiPath(route);
  const path=matchedApi?route!:unmatchedPath(request.url,origin);if(!isApiPath(path))return;
  const publicBootstrap=matchedApi&&path==='/studio-api/auth/bootstrap'&&request.method==='GET';
  const publicAuth=matchedApi&&['/studio-api/auth/register','/studio-api/auth/login'].includes(path)&&request.method==='POST';
  const authEndpoint=matchedApi&&(publicBootstrap||publicAuth||path==='/studio-api/auth/logout'||path==='/studio-api/session');
  if(authEndpoint)await enforceRate(pool,rateKey('auth-ip',request.ip),30,60000,now());
  if(publicBootstrap)return;if(publicAuth){requireOrigin(request,origin);return;}
  const session=await readSession(pool,request.cookies[sessionCookie],now());
  const cookieRead=matchedApi&&['/studio-api/session','/studio-api/assets/:id/content'].includes(path)&&['GET','HEAD'].includes(request.method);
  if(!cookieRead&&request.headers['x-workspace-context']!==session.row.context_id)throw new HttpError(409,'SESSION_CHANGED');
  if(!['GET','HEAD','OPTIONS'].includes(request.method)){
   requireOrigin(request,origin);if(!equalToken(request.headers['x-csrf-token'],csrfToken(session.raw,'session')))throw new HttpError(403,'CSRF_INVALID');
  }
  contexts.set(request,{userId:session.row.user_id,sessionId:session.row.token_digest,contextId:session.row.context_id});sessions.set(request,session);
  await pool.query('UPDATE sessions SET last_seen_at=GREATEST(last_seen_at,$2) WHERE token_digest=$1',[session.row.token_digest,now()]);
 });
}
