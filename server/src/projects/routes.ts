import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import {requestAuthContext} from '../auth/context.js';
import {HttpError} from '../errors.js';
import {createProjectSchema,projectPatchSchema,projectDeleteSchema,projectListSchema,projectCommandSchema,projectCopySchema} from './contracts.js';
import {copyProject} from './copy.js';
import {exportProjectPackage,importProjectPackage,importProjectSchema} from './package.js';
import type {AssetStorageOptions} from '../assets/storage.js';
import {createProject,listProjects,readProject,readProjectGraph,updateProject,trashProject,restoreProject,readWorkspace} from './repository.js';
import {applyProjectCommand} from './commands.js';
const noQuery=z.strictObject({}),params=z.strictObject({id:z.uuid()});
function projectId(value:unknown){const result=params.safeParse(value);if(!result.success)throw new HttpError(404,'NOT_FOUND');return result.data.id;}
export function registerProjectRoutes(app:FastifyInstance,pool:Pool,now:()=>Date,storage?:AssetStorageOptions){
 app.get('/studio-api/projects',async request=>{const query=projectListSchema.parse(request.query);return listProjects(pool,requestAuthContext(request),query.trashed==='true');});
 app.post('/studio-api/projects',async(request,reply)=>{noQuery.parse(request.query);return reply.code(201).send(await createProject(pool,requestAuthContext(request),createProjectSchema.parse(request.body),now()));});
 app.post('/studio-api/projects/import',{bodyLimit:16*1024*1024},async(request,reply)=>{noQuery.parse(request.query);return reply.code(201).send(await importProjectPackage(pool,requestAuthContext(request),importProjectSchema.parse(request.body),now(),storage));});
 app.get('/studio-api/projects/:id',async request=>{noQuery.parse(request.query);return readProject(pool,requestAuthContext(request),projectId(request.params));});
 app.get('/studio-api/projects/:id/graph',async request=>{noQuery.parse(request.query);return readProjectGraph(pool,requestAuthContext(request),projectId(request.params));});
 app.get('/studio-api/projects/:id/workspace',async request=>{noQuery.parse(request.query);return readWorkspace(pool,requestAuthContext(request),projectId(request.params));});
 app.get('/studio-api/projects/:id/export',async request=>{noQuery.parse(request.query);return exportProjectPackage(pool,requestAuthContext(request),projectId(request.params),now(),storage);});
 app.patch('/studio-api/projects/:id',async request=>{noQuery.parse(request.query);return updateProject(pool,requestAuthContext(request),projectId(request.params),projectPatchSchema.parse(request.body),now());});
 app.delete('/studio-api/projects/:id',async request=>{noQuery.parse(request.query);const input=projectDeleteSchema.parse(request.body);return trashProject(pool,requestAuthContext(request),projectId(request.params),input.expectedRevision,now());});
 app.post('/studio-api/projects/:id/restore',async request=>{noQuery.parse(request.query);return restoreProject(pool,requestAuthContext(request),projectId(request.params),projectDeleteSchema.parse(request.body).expectedRevision,now());});
 app.post('/studio-api/projects/:id/copy',async(request,reply)=>{noQuery.parse(request.query);return reply.code(201).send(await copyProject(pool,requestAuthContext(request),projectId(request.params),projectCopySchema.parse(request.body),now(),storage));});
 app.post('/studio-api/projects/:id/commands',{bodyLimit:2*1024*1024},async request=>{noQuery.parse(request.query);return applyProjectCommand(pool,requestAuthContext(request),projectId(request.params),projectCommandSchema.parse(request.body),now());});
}
