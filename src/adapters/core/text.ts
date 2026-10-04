import {z} from 'zod';
import {byteLength,localText} from '../../domain/common';
import type {CoreClient,CoreReply} from './http-client';
import type {CapabilityProfile} from '../../domain/connection';
import {isTextOnlyModel} from '../../application/prompts/text-model-policy';
import {sanitizeKnownSecrets} from '../../security/credential-session';
const responseSchema=z.object({id:z.string().optional(),choices:z.array(z.object({message:z.object({content:z.string()})})).min(1)});
const requestSchema=z.strictObject({model:z.string(),stream:z.literal(false),messages:z.array(z.strictObject({role:z.enum(['system','user']),content:localText})).length(2)});
export type CoreTextObservation={content:string;requestId?:string;redacted:boolean};
export async function sendCoreText(client:CoreClient,capability:CapabilityProfile,body:string,idempotencyKey:string,signal?:AbortSignal,textSessionId?:string):Promise<CoreReply<CoreTextObservation>>{
 const request=requestSchema.parse(JSON.parse(body));if(!isTextOnlyModel(request.model,capability)||capability.contractVersion!==client.profile.contractVersion)throw Error('text_model_unverified');
 const reply=await client.requestJson('POST','/v1/chat/completions',body,{idempotencyKey,signal,...(client.binding.kind==='text-api'&&textSessionId!==undefined?{textSessionId}:{})});if(!reply.ok)return reply;
 const parsed=responseSchema.safeParse(reply.value);if(!parsed.success||byteLength(parsed.data.choices[0].message.content)>65536)return {ok:false,error:{httpStatus:200,category:'protocol',errorCode:'core_text_protocol_invalid',submissionOutcome:'unknown'}};
 const raw=parsed.data.choices[0].message.content,content=sanitizeKnownSecrets(raw),id=parsed.data.id,requestId=id&&/^[-A-Za-z0-9._~]{1,256}$/.test(id)&&sanitizeKnownSecrets(id)===id?id:undefined;
 return {ok:true,value:{content,redacted:content!==raw,...(requestId?{requestId}:{})}};
}
