import {z} from 'zod';
import type {RunBinding} from '../../domain/common';
import type {CoreClient} from './http-client';
import {getActiveCore} from './current-connection';
import {sanitizeKnownSecrets} from '../../security/credential-session';
const identity=z.string().regex(/^[-A-Za-z0-9._~]{1,256}$/).refine(v=>sanitizeKnownSecrets(v)===v);
const versionSchema=z.object({version_id:identity,work_id:identity,operation_request_id:identity,state:z.enum(['preparing','running','completed','failed','unknown']),parent_version_id:identity.nullable().optional(),ordinal:z.number().int().positive().optional(),action:z.enum(['create','revise','continue']).optional(),deleted_at_ms:z.number().int().nonnegative().nullable().optional()});
const workSchema=z.object({work_id:identity,versions:z.array(versionSchema).max(1000)});
export type VideoWork={workId:string;versions:{versionId:string;workId:string;operationRequestId:string;state:string;parentVersionId?:string;ordinal?:number;action?:'create'|'revise'|'continue'}[]};
export function parseVideoWork(value:unknown,workId:string):VideoWork{
 const parsed=workSchema.safeParse(value);if(!parsed.success||parsed.data.work_id!==workId||parsed.data.versions.some(v=>v.work_id!==workId)||new Set(parsed.data.versions.map(v=>v.version_id)).size!==parsed.data.versions.length)throw Error('video_work_protocol_invalid');
 return {workId,versions:parsed.data.versions.filter(v=>v.deleted_at_ms==null).map(v=>({versionId:v.version_id,workId:v.work_id,operationRequestId:v.operation_request_id,state:v.state,...(v.parent_version_id?{parentVersionId:v.parent_version_id}:{}),...(v.ordinal===undefined?{}:{ordinal:v.ordinal}),...(v.action?{action:v.action}:{})}))};
}
export async function getVideoWork(workId:string,binding:RunBinding,options:{client?:CoreClient}={}):Promise<VideoWork>{
 if(!identity.safeParse(workId).success)throw Error('video_work_identity_invalid');const client=options.client??getActiveCore()?.client;
 if(!client||binding.connectionId!==client.profile.id||binding.authBindingId!==client.binding.id||binding.originSnapshot!==client.profile.originSnapshot)throw Error('original_authorization_required');
 const reply=await client.requestJson('GET','/v1/video-works/'+workId);
 if(!reply.ok)throw Error(reply.error.httpStatus===404?'work_context_unavailable':reply.error.category==='authentication'?'original_authorization_required':'work_query_failed');
 return parseVideoWork(reply.value,workId);
}
