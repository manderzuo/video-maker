import {z} from 'zod';
import {projectSchema} from '../../domain/project';
import {graphSchema,type Graph,type Viewport} from '../../domain/graph';
import {assetSchema} from '../../domain/asset';
import {promptLibrarySchema,promptDraftSchema,type PromptDraft,type PromptLibraryEntry,type PromptCompileResult} from '../../domain/prompt';
import type {GraphOperation} from '../../application/commands/registry';
import {ApiError} from './client';
import {cloudProjectPackageSchema,privateFileSchema,type CloudProjectPackage} from '../../domain/cloud-project-package';
import {cloudTaskSchema,promptOptimizationPreviewSchema} from '../../domain/cloud-task';
export type WorkspaceIdentity={userId:string;contextId:string;csrfToken:string};
export type WorkspaceBridge={getIdentity:()=>WorkspaceIdentity|null;subscribe:(cb:()=>void)=>()=>void;refresh:()=>Promise<unknown>};
export type CloudCommand={type:'operations';operations:GraphOperation[];viewport?:Viewport}|{type:'undo'|'redo'}|{type:'viewport';viewport:Viewport};
const historySchema=z.strictObject({undoDepth:z.number().int().nonnegative(),redoDepth:z.number().int().nonnegative()});
const receiptSchema=z.strictObject({id:z.uuid(),status:z.enum(['applied','replayed']),revision:z.number().int().nonnegative(),commandRevision:z.number().int().nonnegative().optional(),project:projectSchema,graph:graphSchema,history:historySchema.optional()}).refine(value=>value.project.id===value.graph.projectId&&value.revision===value.project.revision&&value.revision===value.graph.revision);
export const workspaceSchema=z.strictObject({project:projectSchema,graph:graphSchema,history:z.strictObject({undoDepth:z.number().int().nonnegative(),redoDepth:z.number().int().nonnegative()})}).refine(value=>value.project.id===value.graph.projectId&&value.project.revision===value.graph.revision);
export type WorkspaceSnapshot=z.infer<typeof workspaceSchema>;
const errors=new Set(['AUTH_REQUIRED','SESSION_CHANGED','CSRF_INVALID','REVISION_CONFLICT','INVALID_COMMAND','IDEMPOTENCY_CONFLICT','HISTORY_EMPTY','HISTORY_CHANGED','PROJECT_IN_TRASH','ASSET_IN_USE','ASSET_ALREADY_COMPLETE','UPLOAD_INVALID','UPLOAD_INCOMPLETE','USER_QUOTA_EXCEEDED','MEDIA_UNAVAILABLE','NOT_FOUND','INVALID_REQUEST','BODY_TOO_LARGE','INTERNAL_ERROR','PACKAGE_INCOMPLETE','CONFIG_CHANGED','PREVIEW_EXPIRED','MODEL_CONFIG_REQUIRED','PROMPT_INPUT_INVALID','INPUT_CONTAINS_CREDENTIAL','PRIOR_UNKNOWN_CONFIRMATION_REQUIRED']);
export function workspaceMessage(error:unknown){
 const code=error instanceof ApiError?error.code:'';
 const messages:Record<string,string>={REVISION_CONFLICT:'另一设备已修改此内容。本次输入尚未保存，请重新加载后核对。',HISTORY_EMPTY:'没有可撤销或重做的操作。',HISTORY_CHANGED:'画布已发生变化，无法应用这条历史。',USER_QUOTA_EXCEEDED:'云端空间不足，本次文件尚未保存。',UPLOAD_INVALID:'文件内容与上传清单不符，请重新选择原文件。',UPLOAD_INCOMPLETE:'文件尚未上传完整，请重试。',ASSET_IN_USE:'素材仍被项目或撤销历史引用，暂不能移入回收站。',AUTH_REQUIRED:'登录已过期，请重新登录。',STALE_RESPONSE:'账号已变化，旧请求已停止。',SESSION_CHANGED:'账号已变化，请重新登录。',NOT_FOUND:'内容不存在或不属于当前账号。'};
 const taskMessages:Record<string,string>={CONFIG_CHANGED:'API 配置已变化，请重新预览并确认。',PREVIEW_EXPIRED:'本次预览已失效，请重新预览。',MODEL_CONFIG_REQUIRED:'请先在 API 设置保存文字模型配置。',PROMPT_INPUT_INVALID:'请检查创意、规格冲突及参考素材选择。',INPUT_CONTAINS_CREDENTIAL:'写作输入包含已保存的密钥，请移除后再调用。',PRIOR_UNKNOWN_CONFIRMATION_REQUIRED:'此前的调用结果未知，请先核对并明确确认再次调用的风险。'};
 return messages[code]??taskMessages[code]??'云端操作未完成，请保留当前输入并重试。';
}
export function createWorkspaceClient(bridge:WorkspaceBridge,fetcher:typeof fetch=fetch){
 const initial=bridge.getIdentity(),controllers=new Set<AbortController>();let disposed=false,invalid=false;
 const current=()=>{const now=bridge.getIdentity();return !disposed&&!invalid&&!!initial&&!!now&&now.userId===initial.userId&&now.contextId===initial.contextId;};
 const abort=()=>{invalid=true;for(const controller of controllers)controller.abort();};
 const unsubscribe=bridge.subscribe(()=>{if(!current())abort();});
 const resource=(id:string)=>{if(!z.uuid().safeParse(id).success)throw new ApiError(0,'INVALID_REQUEST');return id;};
 async function request<T>(path:string,schema:z.ZodType<T>,options:{method?:'GET'|'POST'|'PATCH'|'DELETE'|'PUT';body?:unknown;binary?:Blob}={}):Promise<T>{
  if(!current())throw new ApiError(0,'STALE_RESPONSE');const identity=initial!,controller=new AbortController();controllers.add(controller);
  const method=options.method??'GET',headers:Record<string,string>={Accept:'application/json','X-Workspace-Context':identity.contextId};if(method!=='GET')headers['X-CSRF-Token']=identity.csrfToken;
  if(options.body!==undefined)headers['Content-Type']='application/json';if(options.binary)headers['Content-Type']='application/octet-stream';
  try{
   const response=await fetcher(path,{method,headers,credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(options.binary?120000:15000)]),body:options.binary??(options.body===undefined?undefined:JSON.stringify(options.body))});
   if(!current())throw new ApiError(0,'STALE_RESPONSE');
   if(response.status===204&&response.ok)return schema.parse(undefined);
   const text=await response.text();if(!current())throw new ApiError(0,'STALE_RESPONSE');if(new TextEncoder().encode(text).length>16*1024*1024)throw new ApiError(response.status,'INVALID_RESPONSE');
   let value:unknown;try{value=JSON.parse(text);}catch{throw new ApiError(response.status,'INVALID_RESPONSE');}
   if(!response.ok){const parsed=z.strictObject({code:z.string()}).safeParse(value),code=parsed.success&&errors.has(parsed.data.code)?parsed.data.code:'INTERNAL_ERROR';if(response.status===401||code==='SESSION_CHANGED'){abort();void bridge.refresh();}throw new ApiError(response.status,code);}
   const parsed=schema.safeParse(value);if(!parsed.success)throw new ApiError(response.status,'INVALID_RESPONSE');return parsed.data;
  }catch(error){if(!current()&&!(error instanceof ApiError&&['AUTH_REQUIRED','SESSION_CHANGED'].includes(error.code)))throw new ApiError(0,'STALE_RESPONSE');if(error instanceof ApiError)throw error;throw new ApiError(0,'NETWORK_ERROR');}
  finally{controllers.delete(controller);}
 }
 async function downloadAsset(id:string,variant:'original'|'thumbnail',limit:number){
  const path='/studio-api/assets/'+resource(id)+'/content?variant='+variant;
  if(!current())throw new ApiError(0,'STALE_RESPONSE');const controller=new AbortController();controllers.add(controller);
  try{
   const response=await fetcher(path,{method:'GET',headers:{'X-Workspace-Context':initial!.contextId},credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)])});
   if(!current())throw new ApiError(0,'STALE_RESPONSE');
   if(!response.ok){if(response.status===401){abort();void bridge.refresh();}throw new ApiError(response.status,response.status===401?'AUTH_REQUIRED':'MEDIA_UNAVAILABLE');}
   const reader=response.body?.getReader();if(!reader)throw new ApiError(response.status,'INVALID_RESPONSE');
   const chunks:ArrayBuffer[]=[],maximum=Math.min(limit,200*1024*1024);let bytes=0;
   try{for(;;){const part=await reader.read();if(!current())throw new ApiError(0,'STALE_RESPONSE');if(part.done)break;bytes+=part.value.byteLength;if(bytes>maximum)throw new ApiError(413,'BODY_TOO_LARGE');chunks.push(new Uint8Array(part.value).buffer);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   return new Blob(chunks,{type:response.headers.get('Content-Type')??'application/octet-stream'});
  }catch(error){if(!current()&&!(error instanceof ApiError&&error.code==='AUTH_REQUIRED'))throw new ApiError(0,'STALE_RESPONSE');if(error instanceof ApiError)throw error;throw new ApiError(0,'NETWORK_ERROR');}
  finally{controllers.delete(controller);}
 }
 return {
  listProjects:(trashed=false)=>request('/studio-api/projects'+(trashed?'?trashed=true':''),z.array(projectSchema)),
  createProject:(input:{title:string;description?:string;tags?:string[]})=>request('/studio-api/projects',projectSchema,{method:'POST',body:input}),
  readProject:async(id:string)=>request('/studio-api/projects/'+resource(id),projectSchema),
  readGraph:async(id:string)=>request('/studio-api/projects/'+resource(id)+'/graph',graphSchema.refine((graph:Graph)=>graph.projectId===id)),
  readWorkspace:async(id:string)=>request('/studio-api/projects/'+resource(id)+'/workspace',workspaceSchema),
  patchProject:async(id:string,expectedRevision:number,patch:{title?:string;description?:string;starred?:boolean;archived?:boolean;tags?:string[]})=>request('/studio-api/projects/'+resource(id),projectSchema,{method:'PATCH',body:{expectedRevision,...patch}}),
  trashProject:async(id:string,expectedRevision:number)=>request('/studio-api/projects/'+resource(id),projectSchema,{method:'DELETE',body:{expectedRevision}}),
  restoreProject:async(id:string,expectedRevision:number)=>request('/studio-api/projects/'+resource(id)+'/restore',projectSchema,{method:'POST',body:{expectedRevision}}),
  copyProject:async(id:string,expectedRevision:number,idempotencyKey:string,title?:string)=>request('/studio-api/projects/'+resource(id)+'/copy',workspaceSchema,{method:'POST',body:{expectedRevision,idempotencyKey,...(title?{title}:{})}}),
  exportProject:async(id:string)=>request('/studio-api/projects/'+resource(id)+'/export',cloudProjectPackageSchema),
  importProject:(data:CloudProjectPackage,assets:Record<string,string>,idempotencyKey:string)=>request('/studio-api/projects/import',workspaceSchema,{method:'POST',body:{data,assets,idempotencyKey}}),
  command:async(id:string,expectedRevision:number,command:CloudCommand,idempotencyKey:string=crypto.randomUUID())=>request('/studio-api/projects/'+resource(id)+'/commands',receiptSchema,{method:'POST',body:{expectedRevision,command,idempotencyKey}}),
  listAssets:(trashed=false)=>request('/studio-api/assets'+(trashed?'?trashed=true':''),z.array(assetSchema)),
  listPrompts:(trashed=false)=>request('/studio-api/prompts'+(trashed?'?trashed=true':''),z.array(promptLibrarySchema)),
  createPrompt:(input:Omit<PromptLibraryEntry,'id'|'revision'|'trashed'>,idempotencyKey:string)=>request('/studio-api/prompts',promptLibrarySchema,{method:'POST',body:{...input,idempotencyKey}}),
  patchPrompt:async(id:string,expectedRevision:number,patch:Partial<Omit<PromptLibraryEntry,'id'|'revision'|'trashed'>>)=>request('/studio-api/prompts/'+resource(id),promptLibrarySchema,{method:'PATCH',body:{expectedRevision,...patch}}),
  promptRevision:async(id:string,revision:number)=>request('/studio-api/prompts/'+resource(id)+'/revisions/'+revision,promptLibrarySchema),
  trashPrompt:async(id:string,expectedRevision:number)=>request('/studio-api/prompts/'+resource(id),promptLibrarySchema,{method:'DELETE',body:{expectedRevision}}),
  restorePrompt:async(id:string,expectedRevision:number)=>request('/studio-api/prompts/'+resource(id)+'/restore',promptLibrarySchema,{method:'POST',body:{expectedRevision}}),
  listDrafts:(trashed=false)=>request('/studio-api/prompt-drafts'+(trashed?'?trashed=true':''),z.array(promptDraftSchema)),
  modelConfigs:async()=>request('/studio-api/me/model-configs',z.strictObject({configs:z.array(z.strictObject({channel:z.enum(['text','video']),apiBase:z.string(),model:z.string(),revision:z.number().int().positive(),hasKey:z.boolean()}))})),
  optimizationPreview:async(id:string,expectedRevision:number,configRevision:number,referenceAliases:string[])=>request('/studio-api/prompt-drafts/'+resource(id)+'/optimization-preview',promptOptimizationPreviewSchema,{method:'POST',body:{expectedRevision,configRevision,referenceAliases}}),
  optimizeDraft:async(id:string,approvalId:string,acknowledgePriorUnknown=false)=>request('/studio-api/prompt-drafts/'+resource(id)+'/optimize',cloudTaskSchema,{method:'POST',body:{approvalId,decision:{confirmed:true,acknowledgeTextFee:true,...(acknowledgePriorUnknown?{acknowledgePriorUnknown:true}:{})}}}),
  listTasks:async()=>request('/studio-api/runs',z.array(cloudTaskSchema)),
  readTask:async(id:string)=>request('/studio-api/runs/'+resource(id),cloudTaskSchema),
  readDraft:async(id:string)=>request('/studio-api/prompt-drafts/'+resource(id),promptDraftSchema),
  createDraft:(input:Omit<PromptDraft,'id'|'revision'|'resultVersions'>,idempotencyKey:string)=>request('/studio-api/prompt-drafts',promptDraftSchema,{method:'POST',body:{...input,idempotencyKey}}),
  patchDraft:async(id:string,expectedRevision:number,patch:Partial<Omit<PromptDraft,'id'|'revision'|'resultVersions'>>)=>request('/studio-api/prompt-drafts/'+resource(id),promptDraftSchema,{method:'PATCH',body:{expectedRevision,...patch}}),
  draftRevision:async(id:string,revision:number)=>request('/studio-api/prompt-drafts/'+resource(id)+'/revisions/'+revision,promptDraftSchema),
  compileDraft:async(id:string,expectedRevision:number)=>request('/studio-api/prompt-drafts/'+resource(id)+'/compile',promptDraftSchema,{method:'POST',body:{expectedRevision}}),
  appendDraftResult:async(id:string,expectedRevision:number,result:PromptCompileResult)=>request('/studio-api/prompt-drafts/'+resource(id)+'/results',promptDraftSchema,{method:'POST',body:{expectedRevision,result}}),
  restoreDraftResult:async(id:string,expectedRevision:number,versionId:string)=>request('/studio-api/prompt-drafts/'+resource(id)+'/results/'+resource(versionId)+'/restore',promptDraftSchema,{method:'POST',body:{expectedRevision}}),
  trashDraft:async(id:string,expectedRevision:number)=>request('/studio-api/prompt-drafts/'+resource(id),promptDraftSchema,{method:'DELETE',body:{expectedRevision}}),
  restoreDraft:async(id:string,expectedRevision:number)=>request('/studio-api/prompt-drafts/'+resource(id)+'/restore',promptDraftSchema,{method:'POST',body:{expectedRevision}}),
  readAsset:async(id:string)=>request('/studio-api/assets/'+resource(id),assetSchema),
  readAssetFiles:async(id:string)=>request('/studio-api/assets/'+resource(id)+'/files',z.strictObject({asset:assetSchema,thumbnail:privateFileSchema.optional()})),
  reserveAsset:(input:{title:string;description?:string;tags?:string[];mimeType:string;bytes:number;sha256:string;thumbnail?:{bytes:number;sha256:string;mimeType:string};width?:number;height?:number;durationSeconds?:number})=>request('/studio-api/assets',z.union([assetSchema,z.strictObject({id:z.uuid(),state:z.literal('pending')})]),{method:'POST',body:input}),
  uploadFile:async(id:string,blob:Blob,variant:'original'|'thumbnail'='original')=>request('/studio-api/assets/'+resource(id)+'/content?variant='+variant,z.undefined(),{method:'PUT',binary:blob}),
  completeAsset:async(id:string)=>request('/studio-api/assets/'+resource(id)+'/complete',assetSchema,{method:'POST',body:{}}),
  cancelUpload:async(id:string)=>request('/studio-api/assets/'+resource(id)+'/upload',z.undefined(),{method:'DELETE',body:{}}),
  patchAsset:async(id:string,expectedRevision:number,patch:{title?:string;description?:string;tags?:string[]})=>request('/studio-api/assets/'+resource(id),assetSchema,{method:'PATCH',body:{expectedRevision,...patch}}),
  trashAsset:async(id:string,expectedRevision:number)=>request('/studio-api/assets/'+resource(id),assetSchema,{method:'DELETE',body:{expectedRevision}}),
  restoreAsset:async(id:string,expectedRevision:number)=>request('/studio-api/assets/'+resource(id)+'/restore',assetSchema,{method:'POST',body:{expectedRevision}}),
  contentUrl:(id:string,variant:'original'|'thumbnail'='original')=>'/studio-api/assets/'+resource(id)+'/content?variant='+variant,
  downloadAsset,
  dispose(){disposed=true;abort();unsubscribe();}
 };
}
export type WorkspaceClient=ReturnType<typeof createWorkspaceClient>;
