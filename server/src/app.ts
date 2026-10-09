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
import {registerAssetRoutes} from './assets/routes.js';
import type {AssetStorageOptions} from './assets/storage.js';
import {registerPromptRoutes} from './prompts/routes.js';
import {registerTaskRoutes} from './tasks/routes.js';
import {startPromptWorker} from './tasks/prompt-worker.js';
import {startVideoWorker} from './tasks/video-worker.js';
import {registerVideoTaskRoutes} from './tasks/video-routes.js';
import type {DeploymentContract} from '../../src/adapters/core/capabilities.js';
import {registerAgentRoutes} from './agent/routes.js';
import {startAgentWorker} from './agent/worker.js';
export async function buildStudioApp(options:{pool:Pool;origin:string;now?:()=>Date;apiSettings?:ApiSettingsDependencies;workspace?:true;content?:true;taskWorker?:true;videoContracts?:ReadonlyMap<string,DeploymentContract>;assets?:AssetStorageOptions}){
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
  if(error instanceof HttpError)return reply.code(error.status).send({code:error.code,...(error.issues?{issues:error.issues}:{})});
  if(error instanceof ZodError)return reply.code(400).send({code:'INVALID_REQUEST'});
  const status=(error as {statusCode?:number}).statusCode;if(status===413)return reply.code(413).send({code:'BODY_TOO_LARGE'});if(status&&status>=400&&status<500)return reply.code(status).send({code:'INVALID_REQUEST'});
  return reply.code(500).send({code:'INTERNAL_ERROR'});
 });
 app.setNotFoundHandler((_request,reply)=>reply.code(404).send({code:'NOT_FOUND'}));
 registerAuthRoutes(app,options.pool,options.origin,now);registerUserRoutes(app,options.pool,now);
 if(options.apiSettings)registerApiSettingsRoutes(app,options.pool,options.apiSettings,now);
 if(options.workspace)registerProjectRoutes(app,options.pool,now,options.assets);
 if(options.content){if(!options.workspace)throw new Error('Workspace required for content');registerPromptRoutes(app,options.pool,now);if(options.apiSettings){registerTaskRoutes(app,options.pool,options.apiSettings,now);registerAgentRoutes(app,options.pool,options.apiSettings,now);}}
 if(options.videoContracts){if(!options.content||!options.apiSettings||!options.assets)throw new Error('Content, settings and assets required for video tasks');registerVideoTaskRoutes(app,options.pool,{...options.apiSettings,assets:options.assets,contracts:options.videoContracts},now);}
 if(options.taskWorker){if(!options.content||!options.apiSettings)throw new Error('Content and API settings required for task worker');let worker:ReturnType<typeof startPromptWorker>|undefined,videoWorker:ReturnType<typeof startVideoWorker>|undefined,agentWorker:ReturnType<typeof startAgentWorker>|undefined;app.addHook('onReady',async()=>{worker=startPromptWorker(options.pool,options.apiSettings!,now);agentWorker=startAgentWorker(options.pool,options.apiSettings!,now);if(options.videoContracts&&options.assets)videoWorker=startVideoWorker(options.pool,{...options.apiSettings!,assets:options.assets,contracts:options.videoContracts},now);});app.addHook('onClose',async()=>{await Promise.all([worker?.stop(),videoWorker?.stop(),agentWorker?.stop()]);});}
 if(options.assets){if(!options.workspace)throw new Error('Workspace required for private assets');registerAssetRoutes(app,options.pool,options.assets,now);}return app;
}
