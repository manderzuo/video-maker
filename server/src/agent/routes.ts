import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import type {ApiSettingsDependencies} from '../settings/service.js';
import {requestAuthContext} from '../auth/context.js';
import {HttpError} from '../errors.js';
import {createConversationSchema,noteSchema,grantSchema,previewSchema,confirmationSchema,decisionSchema,createConversation,listConversations,ownedConversation,appendNote,changeGrant,prepareAgentPreview,confirmAgentPreview,ownedProposal,listProposals,decideProposal} from './repository.js';
const noQuery=z.strictObject({}),revision=z.strictObject({expectedRevision:z.number().int().nonnegative()});
function id(value:unknown){const result=z.strictObject({id:z.uuid()}).safeParse(value);if(!result.success)throw new HttpError(404,'NOT_FOUND');return result.data.id;}
export function registerAgentRoutes(app:FastifyInstance,pool:Pool,dependencies:ApiSettingsDependencies,now:()=>Date){
 app.get('/studio-api/projects/:id/agent-conversations',async request=>{noQuery.parse(request.query);return listConversations(pool,requestAuthContext(request),id(request.params));});
 app.post('/studio-api/projects/:id/agent-conversations',{bodyLimit:16384},async(request,reply)=>{noQuery.parse(request.query);return reply.code(201).send(await createConversation(pool,requestAuthContext(request),id(request.params),createConversationSchema.parse(request.body),now()));});
 app.get('/studio-api/agent-conversations/:id',async request=>{noQuery.parse(request.query);return ownedConversation(pool,requestAuthContext(request),id(request.params));});
 app.post('/studio-api/agent-conversations/:id/notes',{bodyLimit:256*1024},async request=>{noQuery.parse(request.query);return appendNote(pool,requestAuthContext(request),id(request.params),noteSchema.parse(request.body),now());});
 app.post('/studio-api/agent-conversations/:id/grant',{bodyLimit:128*1024},async request=>{noQuery.parse(request.query);return changeGrant(pool,requestAuthContext(request),id(request.params),grantSchema.parse(request.body),now());});
 app.post('/studio-api/agent-conversations/:id/revoke',async request=>{noQuery.parse(request.query);return changeGrant(pool,requestAuthContext(request),id(request.params),revision.parse(request.body),now());});
 app.post('/studio-api/agent-conversations/:id/preview',{bodyLimit:256*1024},async(request,reply)=>{noQuery.parse(request.query);return reply.code(201).send(await prepareAgentPreview(pool,requestAuthContext(request),id(request.params),previewSchema.parse(request.body),dependencies,now()));});
 app.post('/studio-api/agent-conversations/:id/runs',async(request,reply)=>{noQuery.parse(request.query);return reply.code(202).send(await confirmAgentPreview(pool,requestAuthContext(request),id(request.params),confirmationSchema.parse(request.body),now()));});
 app.get('/studio-api/agent-conversations/:id/proposals',async request=>{noQuery.parse(request.query);return listProposals(pool,requestAuthContext(request),id(request.params));});
 app.get('/studio-api/agent-proposals/:id',async request=>{noQuery.parse(request.query);return (await ownedProposal(pool,requestAuthContext(request),id(request.params))).document;});
 app.post('/studio-api/agent-proposals/:id/decision',{bodyLimit:128*1024},async request=>{noQuery.parse(request.query);return decideProposal(pool,requestAuthContext(request),id(request.params),decisionSchema.parse(request.body),now());});
}
