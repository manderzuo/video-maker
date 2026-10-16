import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import {requestAuthContext} from '../auth/context.js';
import {HttpError} from '../errors.js';
import {createProjectSchema,projectPatchSchema,projectDeleteSchema,projectListSchema,projectCommandSchema,projectCopySchema,receiptListSchema,purgeConfirmSchema} from './contracts.js';
import {inspectPurge,confirmPurge} from './purge.js';
import {copyProject} from './copy.js';
import {exportProjectPackage,importProjectPackage,importProjectSchema} from './package.js';
import type {AssetStorageOptions} from '../assets/storage.js';
import {createProject,listProjects,readProject,readProjectGraph,updateProject,trashProject,restoreProject,readWorkspace,listReceipts,ownedProject} from './repository.js';
import {applyProjectCommand,applyProjectCommandDelta} from './commands.js';
import {privateRevalidation,matchesEtag} from '../private-cache.js';
import {createHash} from 'node:crypto';
import {summarizeVideoRun} from '../../../src/domain/cloud-video-run.js';
const noQuery=z.strictObject({}),params=z.strictObject({id:z.uuid()});
function projectId(value:unknown){const result=params.safeParse(value);if(!result.success)throw new HttpError(404,'NOT_FOUND');return result.data.id;}
export function registerProjectRoutes(app:FastifyInstance,pool:Pool,now:()=>Date,storage?:AssetStorageOptions){
 app.get('/studio-api/projects',async request=>{const query=projectListSchema.parse(request.query);return listProjects(pool,requestAuthContext(request),query.trashed==='true');});
 app.post('/studio-api/projects',async(request,reply)=>{noQuery.parse(request.query);return reply.code(201).send(await createProject(pool,requestAuthContext(request),createProjectSchema.parse(request.body),now()));});
 app.post('/studio-api/projects/import',{bodyLimit:16*1024*1024},async(request,reply)=>{noQuery.parse(request.query);return reply.code(201).send(await importProjectPackage(pool,requestAuthContext(request),importProjectSchema.parse(request.body),now(),storage));});
 app.get('/studio-api/projects/:id',async request=>{noQuery.parse(request.query);return readProject(pool,requestAuthContext(request),projectId(request.params));});
 app.get('/studio-api/projects/:id/graph',async request=>{noQuery.parse(request.query);return readProjectGraph(pool,requestAuthContext(request),projectId(request.params));});
 app.get('/studio-api/projects/:id/workspace',async(request,reply)=>{noQuery.parse(request.query);const context=requestAuthContext(request),id=projectId(request.params),project=await ownedProject(pool,context,id),etag=`"workspace-v1-${id}-${project.revision}"`;privateRevalidation(reply,etag);if(matchesEtag(request.headers['if-none-match'],etag))return reply.code(304).send();const value=await readWorkspace(pool,context,id);privateRevalidation(reply,`"workspace-v1-${id}-${value.graph.revision}"`);return value;});
 app.get('/studio-api/projects/:id/video-run-summaries',async(request,reply)=>{noQuery.parse(request.query);const context=requestAuthContext(request),id=projectId(request.params);await ownedProject(pool,context,id);const rows=await pool.query<{document:Record<string,unknown>}>("SELECT document FROM(SELECT document FROM workspace_video_runs WHERE user_id=$1 AND project_id=$2 UNION ALL SELECT document FROM workspace_task_archives WHERE user_id=$1 AND document->>'projectId'=$2::text AND document->>'kind'='video')v ORDER BY(document->>'createdAt')::bigint DESC,document->>'id'",[context.userId,id]),value=rows.rows.map(row=>summarizeVideoRun(row.document)),etag='"video-summaries-v1-'+createHash('sha256').update(JSON.stringify(value)).digest('hex')+'"';privateRevalidation(reply,etag);if(matchesEtag(request.headers['if-none-match'],etag))return reply.code(304).send();return value;});
 app.get('/studio-api/projects/:id/export',async request=>{noQuery.parse(request.query);return exportProjectPackage(pool,requestAuthContext(request),projectId(request.params),now(),storage);});
 app.patch('/studio-api/projects/:id',async request=>{noQuery.parse(request.query);return updateProject(pool,requestAuthContext(request),projectId(request.params),projectPatchSchema.parse(request.body),now());});
 app.delete('/studio-api/projects/:id',async request=>{noQuery.parse(request.query);const input=projectDeleteSchema.parse(request.body);return trashProject(pool,requestAuthContext(request),projectId(request.params),input.expectedRevision,now());});
 app.post('/studio-api/projects/:id/restore',async request=>{noQuery.parse(request.query);return restoreProject(pool,requestAuthContext(request),projectId(request.params),projectDeleteSchema.parse(request.body).expectedRevision,now());});
 app.post('/studio-api/projects/:id/copy',async(request,reply)=>{noQuery.parse(request.query);return reply.code(201).send(await copyProject(pool,requestAuthContext(request),projectId(request.params),projectCopySchema.parse(request.body),now(),storage));});
 app.post('/studio-api/projects/:id/commands',{bodyLimit:2*1024*1024},async request=>{noQuery.parse(request.query);const apply=request.headers['x-workspace-transfer']==='delta-v1'?applyProjectCommandDelta:applyProjectCommand;return apply(pool,requestAuthContext(request),projectId(request.params),projectCommandSchema.parse(request.body),now());});
 app.get('/studio-api/projects/:id/receipts',async request=>{const query=receiptListSchema.parse(request.query);return listReceipts(pool,requestAuthContext(request),projectId(request.params),query.limit);});
 app.post('/studio-api/projects/:id/purge-preview',async request=>{noQuery.parse(request.query);return inspectPurge(pool,requestAuthContext(request),projectId(request.params));});
 app.post('/studio-api/projects/:id/purge',async request=>{noQuery.parse(request.query);return confirmPurge(pool,requestAuthContext(request),projectId(request.params),purgeConfirmSchema.parse(request.body),now());});
}
