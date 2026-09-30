import {graphSchema,type Graph} from '../../domain/graph';
import type {Asset} from '../../domain/asset';
import type {CapabilityProfile,ConnectionProfile} from '../../domain/connection';
import type {AuthBinding} from '../../domain/authorization';
import type {VideoRunSnapshot} from './prepare-request';
import type {ValidationIssue} from '../../domain/common';
import {validateConnection} from '../../domain/graph-validation';
import {videoRunSnapshotSchema} from './prepare-request';
import {fingerprintText} from './fingerprint';
import type {Run} from '../../domain/run';
export type RunDraftInput={graph:Graph;nodeIds:string[];assets:Asset[];readableAssetIds:string[];capability:CapabilityProfile;connection?:ConnectionProfile;binding?:AuthBinding;canWrite:boolean;dirty?:boolean;credentialAvailable:boolean;priorRuns?:Run[]};
export type PlannedVideo={nodeId:string;title:string;inputSnapshot:VideoRunSnapshot;assets:{assetId:string;sha256:string;bytes:number;mimeType:string;title:string}[];dependencies:string[]};
export type RunPlan={approvalId:string;projectId:string;revision:number;connection:ConnectionProfile;binding:AuthBinding;capability:CapabilityProfile;nodes:PlannedVideo[];priorUnknownRunIds:string[];planHash:string;expiresAt:number};
export type UnsealedRunPlan=Omit<RunPlan,'approvalId'|'planHash'|'expiresAt'>;
export type PreflightResult={status:'blocked';issues:ValidationIssue[]}|{status:'ready';issues:[];plan:UnsealedRunPlan};
export function preflightRun(input:RunDraftInput):PreflightResult{
 const issues:ValidationIssue[]=[],add=(code:string,message:string,path='graph')=>issues.push({code,message,path});
 if(!graphSchema.safeParse(input.graph).success)add('graph_invalid','画布数据无效');
 if(!input.canWrite)add('project_writer_required','当前画布只读，请先取得写权');
 if(input.dirty)add('unsaved_changes','请先保存当前修改，再重新预检');
 if(!input.credentialAvailable)add('session_credential_required','请在当前标签连接普通用户授权');
 const {capability:cap,connection,binding,graph}=input;
 if(cap.verification==='unknown'||!cap.videoSpecs.length||!connection||cap.contractVersion!==connection.contractVersion)add('capability_unverified','服务能力尚未核验，无法批准执行');
 if(!binding||!connection||binding.connectionId!==connection.id||binding.originSnapshot!==connection.originSnapshot)add('original_authorization_required','服务与授权身份不匹配');
 if(!input.nodeIds.length)add('selection_empty','请选择视频配置节点');
 if(new Set(input.nodeIds).size!==input.nodeIds.length)add('selection_duplicate','执行节点重复');
 const nodes:PlannedVideo[]=[];
 for(const nodeId of input.nodeIds){
  const node=graph.nodes.find(n=>n.id===nodeId);if(node?.type!=='video-generation'){add('node_not_executable','所选节点不是视频配置',nodeId);continue;}
  if(node.locked)add('node_locked','节点已锁定，请先明确解锁',nodeId);
  if(node.data.missingInputNodeIds?.length)add('upstream_output_unseen','缺少原输入；新产生的上游输出必须在可见后重新确认',nodeId);
  const spec=node.data.draft;
  if(!cap.videoModels.includes(spec.modelId)&&!cap.videoAliases.includes(spec.modelId)||!Number.isInteger(spec.durationSeconds)||!spec.ratio||!cap.videoSpecs.some(s=>s.modelId===spec.modelId&&s.durationSeconds===spec.durationSeconds&&s.ratio===spec.ratio&&s.resolution===spec.resolution))add('video_spec_unsupported','模型、时长或比例不在已核验规格中；保留原值，请明确修改',nodeId);
  const edges=graph.edges.filter(e=>e.targetId===node.id).slice().sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)),texts:string[]=[],references:VideoRunSnapshot['references']=[],plannedAssets:PlannedVideo['assets']=[],tokens:{alias:string;assetId?:string;unbound:boolean;available:boolean}[]=[];
  for(const edge of edges){
   const checked=validateConnection(graph,edge,cap,{assets:input.assets,limits:{image:cap.limits?.imageReferences,video:cap.limits?.videoReferences}});if(!checked.ok)for(const issue of checked.issues)add(issue.code,issue.message,nodeId);
   const source=graph.nodes.find(n=>n.id===edge.sourceId);
   if(source?.type==='text'){texts.push(source.data.text);tokens.push(...source.data.referenceTokens);}
   else if(source?.type==='asset'||source?.type==='result'){
    const asset=input.assets.find(a=>a.id===source.data.assetId);
    if(!asset||asset.trashedAt!=null||!input.readableAssetIds.includes(asset.id)){add('reference_blob_missing','参考素材缺失或本地文件不可读',nodeId);continue;}
    if(asset.mediaType!=='image'&&asset.mediaType!=='video'){add('reference_media_unsupported','此素材类型尚未开放执行',nodeId);continue;}
    if(!cap.limits?.assetBytes||asset.bytes<=0||asset.bytes>Math.min(cap.limits.assetBytes,32*1024*1024))add('reference_size_invalid','素材大小超限或上限尚未核验',nodeId);
    if(source.type==='result'&&asset.sourceRunId!==source.data.runId)add('result_binding_mismatch','结果素材与原任务绑定不匹配',nodeId);
    const count=references.filter(r=>r.mediaType===asset.mediaType).length+1;
    references.push({assetId:asset.id,mediaType:asset.mediaType,role:'参考',alias:'@'+(asset.mediaType==='image'?'图片':'视频')+count,nodeId:source.id,...(source.type==='result'?{runId:source.data.runId}:{}),sha256:asset.sha256,bytes:asset.bytes});
    plannedAssets.push({assetId:asset.id,sha256:asset.sha256,bytes:asset.bytes,mimeType:asset.mimeType,title:asset.title});
   }else add('upstream_output_unseen','执行输入必须是已看见的文字、素材或固定结果，不能提前批准未见输出',nodeId);
  }
  for(const token of tokens){if(token.unbound||!token.available||!token.assetId||!references.some(r=>r.assetId===token.assetId))add('reference_unbound','提示词参考未绑定到本次明确连接的素材',nodeId);else {const ref=references.find(r=>r.assetId===token.assetId)!;ref.alias=token.alias;}}
  const prompt=texts.join('\n\n');
  for(const match of prompt.matchAll(/@(?:图片|视频|音频)[0-9]+/g))if(!references.some(r=>r.alias===match[0]))add('reference_alias_unbound','提示词中的 '+match[0]+' 没有明确绑定到本次素材',nodeId);
  if(!prompt.trim())add('prompt_empty','缺少明确连接的提示词正文',nodeId);
  if(!cap.limits?.promptBytes||new TextEncoder().encode(prompt).byteLength>Math.min(cap.limits.promptBytes,65536))add('prompt_limit_unverified_or_exceeded','提示词字节超限或上限尚未核验',nodeId);
  for(const mediaType of ['image','video'] as const){const count=references.filter(r=>r.mediaType===mediaType).length,limit=cap.limits?.[mediaType==='image'?'imageReferences':'videoReferences'];if(count&&(limit===undefined||count>limit))add('reference_limit_unverified_or_exceeded','参考数量超限或上限尚未核验',nodeId);}
  if(new Set(references.map(r=>r.assetId)).size!==references.length||new Set(references.map(r=>r.alias)).size!==references.length)add('reference_identity_duplicate','参考素材或别名重复，请明确整理',nodeId);
  const snapshot=videoRunSnapshotSchema.safeParse({prompt,spec,references});if(!snapshot.success)add('input_snapshot_invalid','执行输入快照无效',nodeId);
  else nodes.push({nodeId,title:node.title,inputSnapshot:snapshot.data,assets:plannedAssets,dependencies:graph.edges.filter(e=>e.sourceId===nodeId).map(e=>e.targetId)});
 }
 if(issues.length||!connection||!binding)return {status:'blocked',issues};
 const priorUnknownRunIds=(input.priorRuns??[]).filter(r=>r.projectId===graph.projectId&&input.nodeIds.includes(r.nodeId)&&['submitting','submit_unknown'].includes(r.executionState)).map(r=>r.id).sort();
 return {status:'ready',issues:[],plan:structuredClone({projectId:graph.projectId,revision:graph.revision,connection,binding,capability:cap,nodes,priorUnknownRunIds})};
}
export function planPayload(plan:UnsealedRunPlan){return JSON.stringify({projectId:plan.projectId,revision:plan.revision,connection:plan.connection,binding:plan.binding,capability:plan.capability,nodes:plan.nodes,priorUnknownRunIds:plan.priorUnknownRunIds});}
export async function planFingerprint(plan:Omit<RunPlan,'planHash'>){return fingerprintText(JSON.stringify({payload:planPayload(plan),approvalId:plan.approvalId,expiresAt:plan.expiresAt}));}
export async function sealRunPlan(plan:UnsealedRunPlan):Promise<RunPlan>{const snapshot={...structuredClone(plan),approvalId:crypto.randomUUID(),expiresAt:Date.now()+120000};return {...snapshot,planHash:await planFingerprint(snapshot)};}
