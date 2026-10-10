import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import type {ApiSettingsDependencies} from '../settings/service.js';
import type {AssetStorageOptions} from '../assets/storage.js';
import {requestAuthContext} from '../auth/context.js';
import {HttpError} from '../errors.js';
import {optimizationInputSchema,optimizationDecisionSchema,prepareOptimization,confirmOptimization,ownedTask,listTasks} from './prompt-repository.js';
const noQuery=z.strictObject({});
function id(input:unknown){const parsed=z.strictObject({id:z.uuid()}).safeParse(input);if(!parsed.success)throw new HttpError(404,'NOT_FOUND');return parsed.data.id;}
export function registerTaskRoutes(app:FastifyInstance,pool:Pool,dependencies:ApiSettingsDependencies&{assets?:AssetStorageOptions},now:()=>Date){
 app.post('/studio-api/prompt-drafts/:id/optimization-preview',async(request,reply)=>{noQuery.parse(request.query);return reply.code(201).send(await prepareOptimization(pool,requestAuthContext(request),id(request.params),optimizationInputSchema.parse(request.body),dependencies,now()));});
 app.post('/studio-api/prompt-drafts/:id/optimize',async(request,reply)=>{noQuery.parse(request.query);return reply.code(202).send(await confirmOptimization(pool,requestAuthContext(request),id(request.params),optimizationDecisionSchema.parse(request.body),now()));});
 app.get('/studio-api/runs/:id',async request=>{noQuery.parse(request.query);return ownedTask(pool,requestAuthContext(request),id(request.params));});
 app.get('/studio-api/runs',async request=>{noQuery.parse(request.query);return listTasks(pool,requestAuthContext(request));});
}
