import {getActiveCore} from '../../adapters/core/current-connection';
import {promptDraftSchema,promptCompileInputSchema,type PromptDraft} from '../../domain/prompt';
import {VIDEO_RULE_VERSION} from '../../domain/prompt-engine/compile-video';
import {withDatabase,transact,requestResult} from '../../infrastructure/storage/database';
import {readGraph} from '../../infrastructure/storage/project-repository';
import {resolvedInputAssetId} from '../../domain/graph-validation';
import {listDrafts,saveDraft,readDraft} from './draft-repository';
export type PromptSource={projectId?:string;nodeId?:string;revision?:number;currentText?:string};
export async function rememberPromptDraft(draft:PromptDraft){await withDatabase(undefined,db=>transact(db,['diagnostics'],'readwrite',tx=>{tx.objectStore('diagnostics').put({id:'prompt-active:'+draft.type,kind:'prompt-active',draftId:draft.id});}));}
export function compileInput(draft:PromptDraft){const {userRequest,sceneId,requestedSpec,audioPlan,lockedConstraints,references}=draft;return promptCompileInputSchema.parse({userRequest,sceneId,requestedSpec,audioPlan,lockedConstraints,references});}
export function exportWritingDraft(draft:PromptDraft,currentBody:string){
 // The memory draft may exceed save limits. Export its explicit writing fields,
 // clearly unvalidated, without session credentials, execution or billing records.
 const document={version:1,kind:'aiwork.prompt-writing-draft',validationState:'unvalidated',draft:{id:draft.id,revision:draft.revision,type:draft.type,ruleVersion:draft.ruleVersion,sourceProjectId:draft.sourceProjectId,sourceNodeId:draft.sourceNodeId,sourceRevision:draft.sourceRevision,userRequest:draft.userRequest,sceneId:draft.sceneId,requestedSpec:{durationSeconds:draft.requestedSpec.durationSeconds,ratio:draft.requestedSpec.ratio},audioPlan:draft.audioPlan,lockedConstraints:draft.lockedConstraints.map(c=>({id:c.id,field:c.field,originalValue:c.originalValue,acceptedValue:c.acceptedValue,locked:c.locked})),references:draft.references.map(r=>({assetId:r.assetId,alias:r.alias,originalAlias:r.originalAlias,mediaType:r.mediaType,role:r.role,description:r.description,available:r.available,unbound:r.unbound})),currentBody,resultVersions:draft.resultVersions}};
 const text=JSON.stringify(document,null,2);if(new TextEncoder().encode(text).byteLength>16*1024*1024)throw new Error('prompt_export_too_large');return text;
}
export async function ensurePromptDraft(type:'video'|'image',id?:string,source:PromptSource={},options:{fresh?:boolean}={}):Promise<PromptDraft>{
 if(id){const draft=await readDraft(id);if(!draft)throw new Error('prompt_draft_missing');if(draft.type!==type)throw new Error('prompt_draft_type_mismatch');return draft;}
 if(!source.projectId&&!source.nodeId){const active=await withDatabase(undefined,db=>transact(db,['diagnostics'],'readonly',tx=>requestResult<{draftId?:string}|undefined>(tx.objectStore('diagnostics').get('prompt-active:'+type))));if(active?.draftId){const previous=await readDraft(active.draftId);if(previous?.type===type)return previous;}}
 const drafts=await listDrafts();
 const existing=drafts.find(d=>d.type===type&&d.sourceProjectId===source.projectId&&d.sourceNodeId===source.nodeId&&d.sourceRevision===source.revision);
 if(!options.fresh){
  if(existing&&(!source.nodeId||existing.revision>1||existing.userRequest.trim()||existing.resultVersions.length))return existing;
  if(source.projectId&&source.nodeId){
   const previous=drafts.filter(d=>d.type===type&&d.sourceProjectId===source.projectId&&d.sourceNodeId===source.nodeId&&d.id!==existing?.id&&(d.revision>1||!!d.userRequest.trim()||d.resultVersions.length>0)).sort((a,b)=>(b.sourceRevision??-1)-(a.sourceRevision??-1)||b.revision-a.revision)[0];
   if(previous)return previous;
  }
  if(existing)return existing;
 }
 let userRequest='';let requestedSpec:PromptDraft['requestedSpec']={};const lockedConstraints:PromptDraft['lockedConstraints']=[];let sceneId='text';
 if(source.projectId){const graph=await readGraph(source.projectId);if(!graph||source.revision!==undefined&&graph.revision!==source.revision)throw new Error('prompt_source_revision_conflict');const node=graph.nodes.find(n=>n.id===source.nodeId);if(source.nodeId&&!node)throw new Error('prompt_source_node_missing');if(node?.type==='text')userRequest=source.currentText??node.data.text;if(node?.type==='video-generation'){
  userRequest=graph.edges.filter(e=>e.targetId===node.id&&e.port==='text').sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)).map(e=>graph.nodes.find(n=>n.id===e.sourceId)).map(n=>n?.type==='text'?n.data.text:'').filter(Boolean).join('\n\n');
  requestedSpec={durationSeconds:node.data.draft.durationSeconds,ratio:node.data.draft.ratio};
  for(const field of ['durationSeconds','ratio'] as const){const value=requestedSpec[field];if(value!==undefined)lockedConstraints.push({id:'video-selection:'+field,field,originalValue:String(value),acceptedValue:String(value),locked:true});}
  if(/续写|延长/.test(node.title))sceneId='extension';
 }}
 const draft=promptDraftSchema.parse({id:crypto.randomUUID(),revision:0,type,ruleVersion:VIDEO_RULE_VERSION,userRequest,sceneId,requestedSpec,audioPlan:'',lockedConstraints,references:[],resultVersions:[],...(source.projectId?{sourceProjectId:source.projectId}:{}),...(source.nodeId?{sourceNodeId:source.nodeId}:{}),...(source.revision!==undefined?{sourceRevision:source.revision}:{})});
 const saved=await saveDraft(draft,0);if(saved.status!=='saved')throw new Error('prompt_draft_save_failed');return {...draft,revision:saved.revision};
}
export async function readPromptResources(source:PromptSource={},includeLibrary=false){
 const ids=new Set<string>();const texts:{id:string;title:string;text:string}[]=[];
 if(source.projectId){const graph=await readGraph(source.projectId);const node=graph?.nodes.find(n=>n.id===source.nodeId);if(node?.type==='text')for(const r of node.data.referenceTokens)if(r.assetId)ids.add(r.assetId);
  for(const edge of graph?.edges.filter(e=>e.targetId===source.nodeId)??[]){const upstream=graph?.nodes.find(n=>n.id===edge.sourceId);if(upstream?.type==='asset'||upstream?.type==='result'){const assetId=resolvedInputAssetId(upstream,edge.port);if(assetId)ids.add(assetId);}if(upstream?.type==='text')texts.push({id:upstream.id,title:upstream.title,text:upstream.data.text});}
 }
 return withDatabase(undefined,db=>transact(db,['assets','blobs','diagnostics'],'readonly',async tx=>({assets:includeLibrary?await requestResult<unknown[]>(tx.objectStore('assets').getAll()):(await Promise.all([...ids].map(id=>requestResult<unknown>(tx.objectStore('assets').get(id))))).filter(a=>a!==undefined),blobKeys:await requestResult(tx.objectStore('blobs').getAllKeys()),texts,capability:getActiveCore()?{capability:getActiveCore()!.capability}:await requestResult<{capability?:unknown}|undefined>(tx.objectStore('diagnostics').get('capability:current'))})));
}
