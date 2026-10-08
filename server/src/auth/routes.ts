import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import {authService,credentialsSchema} from './service.js';
import {cookieOptions,csrfToken,preauthCookie,readSession,sessionCookie,sessionView} from './session.js';
import {requestAuthContext,requestSession,requireOrigin} from './context.js';
export function registerAuthRoutes(app:FastifyInstance,pool:Pool,origin:string,now:()=>Date){
 const service=authService(pool,now);
 app.get('/studio-api/auth/bootstrap',async(request,reply)=>{
  const boot=await service.bootstrap(request.cookies[preauthCookie]);reply.setCookie(preauthCookie,boot.raw,{...cookieOptions,maxAge:600});return {csrfToken:csrfToken(boot.raw,'preauth'),expiresAt:boot.expiresAt.toISOString()};
 });
 for(const operation of ['register','login'] as const)app.post('/studio-api/auth/'+operation,async(request,reply)=>{
  requireOrigin(request,origin);const credentials=credentialsSchema.parse(request.body);
  const raw=await service[operation](credentials,request.cookies[preauthCookie],request.headers['x-csrf-token'],request.cookies[sessionCookie],request.ip);
  reply.clearCookie(preauthCookie,cookieOptions);reply.setCookie(sessionCookie,raw,{...cookieOptions,maxAge:7*24*3600});if(operation==='register')reply.code(201);
  const session=await readSession(pool,raw,now());return sessionView(session.row,raw);
 });
 app.get('/studio-api/session',async request=>{const session=requestSession(request);return sessionView(session.row,session.raw);});
 app.post('/studio-api/auth/logout',async(request,reply)=>{await pool.query('DELETE FROM sessions WHERE token_digest=$1',[requestAuthContext(request).sessionId]);reply.clearCookie(sessionCookie,cookieOptions);return reply.code(204).send();});
}
