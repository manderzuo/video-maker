import Fastify,{type FastifyError,type FastifyRequest,type FastifyReply} from 'fastify';
import cookie from '@fastify/cookie';
import {ZodError} from 'zod';
import type {Pool} from 'pg';
import {HttpError} from './errors.js';
import {installAuthGuard} from './auth/context.js';
import {registerAuthRoutes} from './auth/routes.js';
import {registerUserRoutes} from './users/routes.js';
import {registerApiSettingsRoutes} from './settings/routes.js';
import type {ApiSettingsDependencies} from './settings/service.js';
import {registerProjectRoutes} from './projects/routes.js';
export async function buildStudioApp(options:{pool:Pool;origin:string;now?:()=>Date;apiSettings?:ApiSettingsDependencies;workspace?:true}){
 const configured=new URL(options.origin);if(configured.protocol!=='https:'||configured.origin!==options.origin)throw new Error('Exact HTTPS origin required');
 const now=options.now??(()=>new Date());const app=Fastify({logger:false,bodyLimit:16384,trustProxy:false,frameworkErrors(error:FastifyError,_request:FastifyRequest,reply:FastifyReply){
  reply.header('Cache-Control','no-store');
  if(error.code==='FST_ERR_BAD_URL')return reply.code(400).send({code:'INVALID_REQUEST'});
  if(error.code==='FST_ERR_MAX_PARAM_LENGTH')return reply.code(414).send({code:'INVALID_REQUEST'});
  return reply.code(500).send({code:'INTERNAL_ERROR'});
 }});
 app.addHook('onRequest',async(_request,reply)=>{reply.header('Cache-Control','no-store');});
 await app.register(cookie);installAuthGuard(app,options.pool,options.origin,now);
 app.setErrorHandler((error,_request,reply)=>{
  if(error instanceof HttpError)return reply.code(error.status).send({code:error.code});
  if(error instanceof ZodError)return reply.code(400).send({code:'INVALID_REQUEST'});
  const status=(error as {statusCode?:number}).statusCode;if(status===413)return reply.code(413).send({code:'BODY_TOO_LARGE'});if(status&&status>=400&&status<500)return reply.code(status).send({code:'INVALID_REQUEST'});
  return reply.code(500).send({code:'INTERNAL_ERROR'});
 });
 app.setNotFoundHandler((_request,reply)=>reply.code(404).send({code:'NOT_FOUND'}));
 registerAuthRoutes(app,options.pool,options.origin,now);registerUserRoutes(app,options.pool,now);
 if(options.apiSettings)registerApiSettingsRoutes(app,options.pool,options.apiSettings,now);
 if(options.workspace)registerProjectRoutes(app,options.pool,now);return app;
}
