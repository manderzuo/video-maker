import type {ConnectionProfile} from '../../domain/connection';
import {connectionSchema} from '../../domain/connection';
import {authBindingSchema,type AuthBinding} from '../../domain/authorization';
import type {withCredential} from '../../security/credential-session';
import {isSafeSnapshot} from '../../domain/common';
import {classifyCoreError,parseCoreModels,parseVideoTask,type CoreFailure,type CoreModel,type CoreTaskView} from './contracts';
import {allowedCorePath,requiresCoreIdempotency} from './route-policy';
import {normalizeCoreBase} from './url';
export type CredentialSession={binding:AuthBinding;withCredential:typeof withCredential};
export type CoreReply<T>={ok:true;value:T}|{ok:false;error:CoreFailure};
export type CoreClient={profile:ConnectionProfile;binding:AuthBinding;testConnection:()=>Promise<CoreReply<CoreModel[]>>;requestContent:(taskId:string,options:{maxBytes:number;signal?:AbortSignal})=>Promise<CoreReply<Blob>>;requestJson:(method:'GET'|'POST',path:string,body?:unknown,options?:{idempotencyKey?:string;signal?:AbortSignal})=>Promise<CoreReply<unknown>>;queryVideo:(taskId:string,options?:{signal?:AbortSignal})=>Promise<CoreReply<CoreTaskView>>};
export type TransportOptions={browserOrigin?:string;registry?:readonly ConnectionProfile[];fetch?:typeof fetch};
export function createCoreClient(raw:ConnectionProfile,session:CredentialSession,options:TransportOptions={}):CoreClient{return createClient(raw,session,options,false);}
export function createTextClient(raw:ConnectionProfile,session:CredentialSession,options:TransportOptions={}):CoreClient{return createClient(raw,session,options,true);}
function createClient(raw:ConnectionProfile,session:CredentialSession,options:TransportOptions,textOnly:boolean):CoreClient{
 const copied=connectionSchema.parse(structuredClone(raw)),binding=Object.freeze(authBindingSchema.parse(structuredClone(session.binding))),base=textOnly&&/^\/text-api\/registered\/[A-Za-z0-9_-]+$/.test(copied.proxyBase)?{ok:true as const,value:copied.proxyBase}:normalizeCoreBase(copied.proxyBase),upstream=normalizeCoreBase(copied.originSnapshot);
 if(!base.ok||!(textOnly?base.value.startsWith('/text-api/registered/'):base.value.startsWith('/core-api'))||binding.kind!==(textOnly?'text-api':'core-user')||!upstream.ok||upstream.value.startsWith('/'))throw new Error('core_connection_invalid');
 if(!options.registry?.some(p=>p.id===copied.id&&p.proxyBase===copied.proxyBase&&p.originSnapshot===copied.originSnapshot&&p.contractVersion===copied.contractVersion))throw new Error('core_connection_unregistered');
 if(binding.connectionId!==copied.id||binding.originSnapshot!==copied.originSnapshot)throw new Error('original_authorization_required');
 const origin=options.browserOrigin??(typeof location==='undefined'?'':location.origin),validOrigin=normalizeCoreBase(origin);if(!validOrigin.ok||new URL(origin).origin!==origin)throw new Error('core_browser_origin_invalid');
 const profile=Object.freeze({...copied,proxyBase:base.value}),send=options.fetch??globalThis.fetch.bind(globalThis),credential=session.withCredential;
 const failure=(code:string,category:CoreFailure['category']='unknown',outcome:CoreFailure['submissionOutcome']='unknown'):CoreReply<never>=>({ok:false,error:{httpStatus:0,category,errorCode:code,submissionOutcome:outcome}});
 const requestJson:CoreClient['requestJson']=async(method,path,body,requestOptions={})=>{
  if(!(textOnly?(method==='GET'&&path==='/v1/models'||method==='POST'&&path==='/v1/chat/completions'):allowedCorePath(path,method)))return failure('core_route_denied','forbidden','not_sent');
  let bodyValue=body;try{if(method==='POST'&&typeof body==='string')bodyValue=JSON.parse(body);}catch{return failure('core_request_body_invalid','invalid_request','not_sent');}
  if(method==='GET'&&body!==undefined||method==='POST'&&(bodyValue===undefined||!isSafeSnapshot(bodyValue)||!bodyValue||typeof bodyValue!=='object'||Array.isArray(bodyValue)))return failure('core_request_body_invalid','invalid_request','not_sent');
  const finalBody=method==='POST'?(typeof body==='string'?body:JSON.stringify(bodyValue)):undefined;
  if(finalBody&&new TextEncoder().encode(finalBody).byteLength>(path==='/v1/assets'?46*1024*1024:8*1024*1024))return failure('core_request_too_large','invalid_request','not_sent');
  if(requestOptions.idempotencyKey!==undefined&&!/^[-A-Za-z0-9._~]{1,256}$/.test(requestOptions.idempotencyKey))return failure('core_idempotency_invalid','invalid_request','not_sent');
  if(method==='POST'&&requiresCoreIdempotency(path)&&(!requestOptions.idempotencyKey||!/^[-A-Za-z0-9._~]{1,256}$/.test(requestOptions.idempotencyKey)))return failure('core_idempotency_required','invalid_request','not_sent');
  try{return await credential(binding.id,async key=>{
   const headers=new Headers({Accept:'application/json',Authorization:'Bearer '+key});if(method==='POST')headers.set('Content-Type','application/json');if(requestOptions.idempotencyKey)headers.set('Idempotency-Key',requestOptions.idempotencyKey);
   let response:Response;try{response=await send(origin+base.value+path,{method,headers,body:finalBody,redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:requestOptions.signal});}catch{return failure(requestOptions.signal?.aborted?'core_request_aborted':'core_transport_unknown');}
   if(response.type==='opaqueredirect'||response.status>=300&&response.status<400)return failure('core_redirect_denied','forbidden');
   let value:unknown;try{value=await readJsonBounded(response);}catch(error){if(!response.ok)return {ok:false,error:classifyCoreError(response.status,undefined,response.headers.get('retry-after')??undefined)};return failure(error instanceof Error?error.message:'core_response_invalid','protocol');}
   if(!response.ok)return {ok:false,error:classifyCoreError(response.status,value,response.headers.get('retry-after')??undefined)};
   return {ok:true,value};
  });}catch{return failure('session_credential_required','authentication','not_sent');}
 };
 const testConnection:CoreClient['testConnection']=async()=>{if(!textOnly){const health=await requestJson('GET','/healthz');if(!health.ok)return health;}const catalog=await requestJson('GET','/v1/models');if(!catalog.ok)return catalog;try{return {ok:true,value:parseCoreModels(catalog.value)};}catch{return failure('core_models_protocol_invalid','protocol');}};
 const queryVideo:CoreClient['queryVideo']=async(taskId,queryOptions)=>{const reply=await requestJson('GET','/v1/videos/'+encodeURIComponent(taskId),undefined,queryOptions);if(!reply.ok)return reply;try{const value=parseVideoTask(reply.value);if(value.taskId!==taskId)return failure('core_task_identity_mismatch','protocol');return {ok:true,value};}catch{return failure('core_task_protocol_invalid','protocol');}};
 const requestContent:CoreClient['requestContent']=async(taskId,contentOptions)=>{
  const path='/v1/videos/'+taskId+'/content';if(textOnly||!allowedCorePath(path,'GET'))return failure('core_route_denied','forbidden','not_sent');
  if(!Number.isSafeInteger(contentOptions.maxBytes)||contentOptions.maxBytes<=0||contentOptions.maxBytes>1024*1024*1024)return failure('media_budget_invalid','invalid_request','not_sent');
  try{return await credential(binding.id,async key=>{
   let response:Response;try{response=await send(origin+base.value+path,{method:'GET',headers:{Accept:'video/mp4,video/webm',Authorization:'Bearer '+key},redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:contentOptions.signal});}catch{return failure('media_transport_failed');}
   if(response.type==='opaqueredirect'||response.status>=300&&response.status<400)return failure('redirect_blocked','forbidden');
   if(!response.ok){let value:unknown;try{value=await readJsonBounded(response);}catch{/* status remains available */}return {ok:false,error:classifyCoreError(response.status,value)};}
   const mime=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();if(mime!=='video/mp4'&&mime!=='video/webm'&&mime!=='application/octet-stream')return failure('media_content_type_invalid','protocol');
   const length=response.headers.get('content-length');if(length&&/^\d+$/.test(length)&&Number(length)>contentOptions.maxBytes){await response.body?.cancel();return failure('media_cache_budget_exceeded','invalid_request');}
   const reader=response.body?.getReader();if(!reader)return failure('media_empty','protocol');let bytes=0;const parts:BlobPart[]=[];
   try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>contentOptions.maxBytes){await reader.cancel();return failure('media_cache_budget_exceeded','invalid_request');}parts.push(new Uint8Array(part.value));}if(!bytes)return failure('media_empty','protocol');return {ok:true,value:new Blob(parts,{type:mime})};}catch{return failure('media_transport_failed');}finally{reader.releaseLock();}
  });}catch{return failure('session_credential_required','authentication','not_sent');}
 };
 return Object.freeze({profile,binding,requestJson,testConnection,queryVideo,requestContent});
}
async function readJsonBounded(response:Response){
 const max=8*1024*1024,reader=response.body?.getReader();if(!reader)throw new Error('core_response_invalid');const decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>max){await reader.cancel();throw new Error('core_response_too_large');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();return JSON.parse(text) as unknown;}catch(error){if(error instanceof Error&&error.message==='core_response_too_large')throw error;throw new Error('core_response_invalid');}finally{reader.releaseLock();}
}
