import {z} from 'zod';
import {byteLength,localText} from '../../domain/common';
import type {CoreClient,CoreReply} from './http-client';
import type {CapabilityProfile} from '../../domain/connection';
import {isTextOnlyModel} from '../../application/prompts/text-model-policy';
import {sanitizeKnownSecrets} from '../../security/credential-session';
import {completionContent} from '../../domain/prompt-engine/structured-result';
const requestSchema=z.strictObject({model:z.string(),stream:z.literal(false),messages:z.array(z.strictObject({role:z.enum(['system','user']),content:localText})).length(2),tools:z.array(z.unknown()).max(1).optional(),tool_choice:z.unknown().optional(),parallel_tool_calls:z.literal(false).optional(),max_tokens:z.number().int().positive().max(8192).optional()});
export type CoreTextObservation={content:string;requestId?:string;redacted:boolean};
export async function sendCoreText(client:CoreClient,capability:CapabilityProfile,body:string,idempotencyKey:string,signal?:AbortSignal,textSessionId?:string):Promise<CoreReply<CoreTextObservation>>{
 const request=requestSchema.parse(JSON.parse(body));if(!isTextOnlyModel(request.model,capability)||capability.contractVersion!==client.profile.contractVersion)throw Error('text_model_unverified');
 const reply=await client.requestJson('POST','/v1/chat/completions',body,{idempotencyKey,signal,...(client.binding.kind==='text-api'&&textSessionId!==undefined?{textSessionId}:{})});if(!reply.ok)return reply;
 let raw:string;try{raw=completionContent(reply.value);if(byteLength(raw)>65536)throw Error('too large');}catch{return {ok:false,error:{httpStatus:200,category:'protocol',errorCode:'core_text_protocol_invalid',submissionOutcome:'unknown'}};}
 const content=sanitizeKnownSecrets(raw),id=(reply.value as {id?:unknown}).id,requestId=typeof id==='string'&&/^[-A-Za-z0-9._~]{1,256}$/.test(id)&&sanitizeKnownSecrets(id)===id?id:undefined;
 return {ok:true,value:{content,redacted:content!==raw,...(requestId?{requestId}:{})}};
}
