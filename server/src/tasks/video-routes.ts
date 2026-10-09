import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import {HttpError} from '../errors.js';
import {requestAuthContext} from '../auth/context.js';
import {videoPreviewInputSchema,videoConfirmationSchema,prepareVideoPreview,confirmVideoPreview,controlVideoTask,videoCapability,type VideoTaskDependencies} from './video-repository.js';
const noQuery=z.strictObject({});
function id(value:unknown){const parsed=z.strictObject({id:z.uuid()}).safeParse(value);if(!parsed.success)throw new HttpError(404,'NOT_FOUND');return parsed.data.id;}
export function registerVideoTaskRoutes(app:FastifyInstance,pool:Pool,dependencies:VideoTaskDependencies,now:()=>Date){
 app.get('/studio-api/me/video-capability',async request=>{noQuery.parse(request.query);return videoCapability(pool,requestAuthContext(request),dependencies);});
 app.post('/studio-api/projects/:id/video-run-preview',async(request,reply)=>{noQuery.parse(request.query);return reply.code(201).send(await prepareVideoPreview(pool,requestAuthContext(request),id(request.params),videoPreviewInputSchema.parse(request.body),dependencies,now()));});
 app.post('/studio-api/projects/:id/video-runs',async(request,reply)=>{noQuery.parse(request.query);return reply.code(202).send(await confirmVideoPreview(pool,requestAuthContext(request),id(request.params),videoConfirmationSchema.parse(request.body),dependencies,now()));});
 app.post('/studio-api/runs/:id/query-control',async request=>{noQuery.parse(request.query);const input=z.strictObject({expectedRevision:z.number().int().nonnegative(),mode:z.enum(['pause','resume'])}).parse(request.body);return controlVideoTask(pool,requestAuthContext(request),id(request.params),input.expectedRevision,input.mode,dependencies,now());});
 for(const [path,action]of [['reauthorize','resume'],['withdraw','withdraw']] as const)app.post('/studio-api/runs/:id/'+path,async request=>{noQuery.parse(request.query);const input=z.strictObject({expectedRevision:z.number().int().nonnegative()}).parse(request.body);return controlVideoTask(pool,requestAuthContext(request),id(request.params),input.expectedRevision,action,dependencies,now());});
}
