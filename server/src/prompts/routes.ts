import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import {requestAuthContext} from '../auth/context.js';
import {HttpError} from '../errors.js';
import {libraryCreateSchema,libraryPatchSchema,draftCreateSchema,draftPatchSchema,manualResultSchema,type ContentKind} from './contracts.js';
import {createContent,listContent,ownedContent,contentRevision,changeContent,appendManualResult} from './repository.js';
const noQuery=z.strictObject({}),revision=z.strictObject({expectedRevision:z.number().int().nonnegative()});
function id(params:unknown){const parsed=z.strictObject({id:z.uuid()}).safeParse(params);if(!parsed.success)throw new HttpError(404,'NOT_FOUND');return parsed.data.id;}
export function registerPromptRoutes(app:FastifyInstance,pool:Pool,now:()=>Date){
 for(const kind of ['prompt','draft'] as const){
  const path=kind==='prompt'?'/studio-api/prompts':'/studio-api/prompt-drafts';
  const create=kind==='prompt'?libraryCreateSchema:draftCreateSchema,patch=kind==='prompt'?libraryPatchSchema:draftPatchSchema;
  app.get(path,async request=>{const query=z.strictObject({trashed:z.enum(['true','false']).optional()}).parse(request.query);return listContent(pool,requestAuthContext(request),kind,query.trashed==='true');});
  app.post(path,{bodyLimit:256*1024},async(request,reply)=>{noQuery.parse(request.query);return reply.code(201).send(await createContent(pool,requestAuthContext(request),kind,create.parse(request.body),now()));});
  app.get(path+'/:id',async request=>{noQuery.parse(request.query);return (await ownedContent(pool,requestAuthContext(request),id(request.params),kind)).document;});
  app.patch(path+'/:id',{bodyLimit:256*1024},async request=>{noQuery.parse(request.query);const {expectedRevision,...fields}=patch.parse(request.body);return changeContent(pool,requestAuthContext(request),id(request.params),kind,expectedRevision,fields,now());});
  app.get(path+'/:id/revisions/:revision',async request=>{
   noQuery.parse(request.query);const parameters=z.strictObject({id:z.uuid(),revision:z.string().regex(/^\d{1,9}$/)}).safeParse(request.params);if(!parameters.success)throw new HttpError(404,'NOT_FOUND');return contentRevision(pool,requestAuthContext(request),parameters.data.id,kind,Number(parameters.data.revision));
  });
  for(const action of ['trash','restore'] as const)app.route({method:action==='trash'?'DELETE':'POST',url:path+'/:id'+(action==='restore'?'/restore':''),handler:async request=>{noQuery.parse(request.query);return changeContent(pool,requestAuthContext(request),id(request.params),kind,revision.parse(request.body).expectedRevision,{},now(),action);}});
 }
 app.post('/studio-api/prompt-drafts/:id/compile',async request=>{noQuery.parse(request.query);return changeContent(pool,requestAuthContext(request),id(request.params),'draft' satisfies ContentKind,revision.parse(request.body).expectedRevision,{},now(),'compile');});
 app.post('/studio-api/prompt-drafts/:id/results',{bodyLimit:256*1024},async request=>{noQuery.parse(request.query);const input=manualResultSchema.parse(request.body);return appendManualResult(pool,requestAuthContext(request),id(request.params),input.expectedRevision,input.result,now());});
 app.post('/studio-api/prompt-drafts/:id/results/:versionId/restore',async request=>{noQuery.parse(request.query);const params=z.strictObject({id:z.uuid(),versionId:z.uuid()}).safeParse(request.params);if(!params.success)throw new HttpError(404,'NOT_FOUND');return appendManualResult(pool,requestAuthContext(request),params.data.id,revision.parse(request.body).expectedRevision,params.data.versionId,now());});
}
