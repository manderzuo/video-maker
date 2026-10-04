import {z} from 'zod';
import {id,revision,videoSpecSchema,type VideoSpec} from '../../domain/common';
import {promptDraftSchema,promptResultVersionSchema,type PromptDraft,type PromptResultVersion} from '../../domain/prompt';
import {referenceTokenSchema,type ReferenceToken,type CanvasNode,graphSchema} from '../../domain/graph';
import {capabilitySchema,type CapabilityProfile} from '../../domain/connection';
import {getActiveCore} from '../../adapters/core/current-connection';
import {validatePromptResult} from '../../domain/prompt-engine/validate-result';
import {assetSchema} from '../../domain/asset';
import {requestResult,transact,withDatabase,storageErrorCode,type StudioDb} from '../../infrastructure/storage/database';
import {getProjectWriter} from '../../features/projects/project-service';
import {releaseProjectLease} from '../../infrastructure/storage/project-lease';
import {compileInput} from '../../features/prompt-generation/workspace-service';
import type {DraftVersionReceipt} from '../../features/prompt-generation/draft-repository';
import {applyUiCommand,type CommandContext} from './apply-command';
import type {CommandReceipt,GraphOperation} from './registry';
import {nodeRect,nodeSize} from '../../features/canvas/geometry';
const positionSchema=z.strictObject({x:z.number().finite(),y:z.number().finite()});
export const applyPromptInputSchema=z.strictObject({draftId:id,resultVersionId:id,targetProjectId:id,targetNodeId:id.optional(),baseRevision:revision,mode:z.enum(['insert','apply']),commandId:id,position:positionSchema.optional(),sourceRevision:revision.optional(),acceptedVideoSpec:videoSpecSchema.optional(),flow:z.strictObject({spec:videoSpecSchema,capabilityVersion:id}).optional()});
export type ApplyPromptInput=z.infer<typeof applyPromptInputSchema>;
export type FlowDraftInput={resultVersionId:string;targetProjectId:string;baseRevision:number;commandId:string;capabilityVersion:string;capability:CapabilityProfile;result:PromptResultVersion;draft:PromptDraft;references:ReferenceToken[];spec:VideoSpec;position?:{x:number;y:number}};
type PromptCanvasRequest={id:string;kind:'prompt-canvas-request';input:ApplyPromptInput;operations:GraphOperation[]};
const requestId=(id:string)=>'prompt-canvas-request:'+id;
const provenance=(draft:PromptDraft,result:PromptResultVersion)=>({draftId:draft.id,resultVersionId:result.id,sourceRevision:result.sourceRevision,origin:result.origin,ruleVersion:draft.ruleVersion});
function textNode(input:ApplyPromptInput,draft:PromptDraft,result:PromptResultVersion):CanvasNode{return {id:input.commandId+':text',type:'text',title:'提示词草稿',x:input.position?.x??64,y:input.position?.y??64,locked:false,data:{kind:'text',text:result.finalPrompt,referenceTokens:draft.references,promptGenerationSource:provenance(draft,result)}};}
export function buildVideoFlow(input:FlowDraftInput):GraphOperation[]{
 const result=promptResultVersionSchema.parse(input.result),draft=promptDraftSchema.parse(input.draft),caps=capabilitySchema.parse(input.capability),spec=videoSpecSchema.parse(input.spec),refs=z.array(referenceTokenSchema).parse(input.references);
 if(input.resultVersionId!==result.id||caps.contractVersion!==input.capabilityVersion||draft.type!=='video')throw new Error('prompt_flow_identity_invalid');
 if(JSON.stringify(refs)!==JSON.stringify(draft.references))throw new Error('prompt_flow_references_changed');
 if(caps.verification==='unknown'||!caps.videoModels.includes(spec.modelId)||!caps.videoSpecs.some(s=>JSON.stringify(s)===JSON.stringify(spec)))throw new Error('prompt_flow_capability_unverified');
 // Creative duration is never silently shortened to a supported task duration.
 if(spec.durationSeconds===undefined||spec.ratio===undefined||spec.durationSeconds!==result.suggestedSpec.durationSeconds||spec.ratio!==result.suggestedSpec.ratio)throw new Error('prompt_flow_spec_mismatch');
 const issues=validatePromptResult(result,compileInput(draft),caps);if(issues.length)throw new Error('prompt_flow_'+issues[0].code);
 if(refs.some(r=>!r.assetId||r.unbound||!r.available||r.mediaType==='audio'||/首帧|尾帧/.test(r.role)))throw new Error('prompt_flow_reference_unverified');
 for(const mediaType of ['image','video'] as const){const count=refs.filter(r=>r.mediaType===mediaType).length,limit=mediaType==='image'?caps.limits?.imageReferences:caps.limits?.videoReferences;if(count&&(limit===undefined||!Number.isSafeInteger(limit)))throw new Error('prompt_flow_reference_limit_unverified');if(limit!==undefined&&count>limit)throw new Error('prompt_flow_reference_limit_exceeded');}
 const base:ApplyPromptInput={draftId:draft.id,resultVersionId:result.id,targetProjectId:input.targetProjectId,baseRevision:input.baseRevision,mode:'insert',commandId:input.commandId,position:input.position};
 const text=textNode(base,draft,result),video:CanvasNode={id:input.commandId+':video',type:'video-generation',title:'视频配置 · 尚未执行',x:text.x+420,y:text.y,locked:false,data:{kind:'video-generation',draft:spec,inputBindings:[],stale:true}};
 const nodes:CanvasNode[]=[text,...refs.map((ref,index):CanvasNode=>({id:input.commandId+':asset:'+index,type:'asset',title:'参考素材 '+(index+1),x:text.x,y:text.y+280*(index+1),locked:false,data:{kind:'asset',assetId:ref.assetId!}})),video];
 const ops:GraphOperation[]=nodes.map(node=>({id:node.id+':add',type:'add_node',payload:{node}}));
 [text,...nodes.filter(n=>n.type==='asset')].forEach((node,index)=>ops.push({id:input.commandId+':connect:'+index,type:'add_edge',payload:{edge:{id:input.commandId+':edge:'+index,sourceId:node.id,targetId:video.id,port:index===0?'text':refs[index-1].mediaType,order:index}}}));
 ops.push({id:input.commandId+':group:add',type:'group',payload:{node:{id:input.commandId+':group',type:'group',title:'视频流程草稿',x:text.x-24,y:text.y-52,locked:false,data:{kind:'group',childIds:nodes.map(n=>n.id),collapsed:false}}}});
 return ops;
}
async function readCanonical(tx:IDBTransaction,input:ApplyPromptInput){
 const current=promptDraftSchema.parse(await requestResult(tx.objectStore('promptDrafts').get(input.draftId))),result=current.resultVersions.find(v=>v.id===input.resultVersionId);if(!result)throw new Error('prompt_result_missing');
 const record=await requestResult<DraftVersionReceipt|undefined>(tx.objectStore('receipts').get(`prompt-draft:${current.id}:${result.sourceRevision}`));if(!record||record.kind!=='prompt-draft-version')throw new Error('prompt_source_input_missing');
 const draft=promptDraftSchema.parse({...record.draft,resultVersions:[result]});return {draft,result};
}
async function currentCapability(tx:IDBTransaction){
 const active=getActiveCore();if(active)return capabilitySchema.parse(active.capability);
 const stored=await requestResult<{capability:unknown}|undefined>(tx.objectStore('diagnostics').get('capability:current'));
 return capabilitySchema.parse(stored?.capability);
}
async function prepare(tx:IDBTransaction,input:ApplyPromptInput){
 const {draft,result}=await readCanonical(tx,input),graph=graphSchema.parse(await requestResult(tx.objectStore('graphs').get(input.targetProjectId)));
 if(!result.finalPrompt.trim())throw new Error('prompt_result_empty');
 if(input.mode==='apply'){
  if(input.flow)throw new Error('prompt_apply_flow_not_allowed');
  const node=graph.nodes.find(n=>n.id===input.targetNodeId);if(!node||!['text','video-generation'].includes(node.type)||node.locked)throw new Error('prompt_target_not_editable');
  if(node.type==='text'){if(input.acceptedVideoSpec)throw new Error('prompt_text_target_spec_forbidden');return [{id:input.commandId+':apply',type:'update_node',payload:{nodeId:node.id,patch:{data:{...node.data,text:result.finalPrompt,referenceTokens:draft.references,promptGenerationSource:provenance(draft,result)}}}}] satisfies GraphOperation[];}
  if(node.type!=='video-generation')throw new Error('prompt_target_not_editable');
  if(input.acceptedVideoSpec){const caps=await currentCapability(tx);if(caps.verification==='unknown'||!caps.videoModels.includes(input.acceptedVideoSpec.modelId)||!caps.videoSpecs.some(s=>JSON.stringify(s)===JSON.stringify(input.acceptedVideoSpec))||input.acceptedVideoSpec.durationSeconds!==result.suggestedSpec.durationSeconds||input.acceptedVideoSpec.ratio!==result.suggestedSpec.ratio)throw new Error('prompt_video_spec_unverified');}
  const prompt=textNode({...input,position:{x:node.x-420,y:node.y}},draft,result),oldTextEdges=graph.edges.filter(e=>e.targetId===node.id&&e.port==='text'&&!e.relation),other=graph.edges.filter(e=>e.targetId===node.id&&e.port!=='text'&&!e.relation);
  const target=nodeRect(node,graph);prompt.x=target.left-420;prompt.y=target.top;
  const size=nodeSize(prompt),occupied=graph.nodes.map(existing=>nodeRect(existing,graph));
  for(let i=0;i<occupied.length;i++){const collision=occupied.find(r=>prompt.x<r.right&&prompt.x+size.width>r.left&&prompt.y<r.bottom&&prompt.y+size.height>r.top);if(!collision)break;prompt.y=collision.bottom+48;}
  const operations:GraphOperation[]=oldTextEdges.map(edge=>({id:input.commandId+':remove:'+edge.id,type:'remove_edge',payload:{edgeId:edge.id}}));
  const videoData={...node.data,draft:input.acceptedVideoSpec??node.data.draft,stale:true};
  operations.push({id:input.commandId+':prompt:add',type:'add_node',payload:{node:prompt}},{id:input.commandId+':video:update',type:'update_node',payload:{nodeId:node.id,patch:{data:videoData}}},{id:input.commandId+':link:add',type:'add_edge',payload:{edge:{id:input.commandId+':edge:apply',sourceId:prompt.id,targetId:node.id,port:'text',order:Math.max(-1,...other.map(e=>e.order))+1}}});return operations;
 }
 if(input.targetNodeId||input.acceptedVideoSpec)throw new Error('prompt_insert_target_node_forbidden');
 if(!input.flow)return [{id:input.commandId+':text:add',type:'add_node',payload:{node:textNode(input,draft,result)}}] satisfies GraphOperation[];
 const capability=await currentCapability(tx);
 return buildVideoFlow({resultVersionId:result.id,targetProjectId:input.targetProjectId,baseRevision:input.baseRevision,commandId:input.commandId,capabilityVersion:input.flow.capabilityVersion,capability,result,draft,references:draft.references,spec:input.flow.spec,position:input.position});
}
export async function previewPromptCanvas(raw:ApplyPromptInput,db?:StudioDb){const input=applyPromptInputSchema.parse(raw);return withDatabase(db,c=>transact(c,['promptDrafts','receipts','graphs','diagnostics'],'readonly',tx=>prepare(tx,input)));}
export async function applyPromptToCanvas(raw:ApplyPromptInput,options:Omit<CommandContext,'origin'|'beforeCreativeCommit'>={}):Promise<CommandReceipt>{
 const parsed=applyPromptInputSchema.safeParse(raw);if(!parsed.success)return {id:raw?.commandId??'invalid',status:'rejected',errorCode:'prompt_canvas_input_invalid'};const input=parsed.data;
 let lease=options.lease,owned=false;
 try{
  const prepared=await withDatabase(options.db,db=>transact(db,['promptDrafts','receipts','graphs','diagnostics'],'readonly',async tx=>{const prior=await requestResult<PromptCanvasRequest|undefined>(tx.objectStore('receipts').get(requestId(input.commandId)));if(prior){if(JSON.stringify(prior.input)!==JSON.stringify(input))throw new Error('command_id_reused_with_different_input');return prior.operations;}return prepare(tx,input);}));
  if(!lease){lease=await getProjectWriter(input.targetProjectId,options.db);owned=true;}
  return await applyUiCommand({id:input.commandId,projectId:input.targetProjectId,baseRevision:input.baseRevision,operations:prepared},{...options,lease,beforeCreativeCommit:async tx=>{
   const actual=await prepare(tx,input);if(JSON.stringify(actual)!==JSON.stringify(prepared))throw new Error('prompt_preview_changed');
   const {draft}=await readCanonical(tx,input);
   if(input.mode==='apply'&&draft.sourceProjectId&&draft.sourceRevision!==undefined){const source=await requestResult<{revision:number;trashedAt:number|null}|undefined>(tx.objectStore('projects').get(draft.sourceProjectId));if(!source||source.trashedAt!==null||source.revision!==(input.sourceRevision??draft.sourceRevision))throw new Error('prompt_source_revision_conflict');}
   // Read blobs in the same write transaction. No media upload or network is involved.
   if(input.flow)for(const ref of draft.references){const asset=assetSchema.parse(await requestResult(tx.objectStore('assets').get(ref.assetId!))),row=await requestResult<{blob?:Blob}|undefined>(tx.objectStore('blobs').get(asset.blobKey));if(asset.trashedAt||asset.mediaType!==ref.mediaType||!(row?.blob instanceof Blob))throw new Error('prompt_flow_asset_missing');}
   tx.objectStore('receipts').put({id:requestId(input.commandId),kind:'prompt-canvas-request',input,operations:prepared} satisfies PromptCanvasRequest);
  }});
 }catch(error){return {id:input.commandId,status:'rejected',errorCode:storageErrorCode(error)};}
 finally{if(owned&&lease)await releaseProjectLease(lease,options.db);}
}
