import {edgeSchema,inputBindingSchema,type Edge,type Graph,type InputBinding,type CanvasNode} from './graph.js';
import type {Run} from './run.js';
import type {CapabilityProfile} from './connection.js';
import type {Asset} from './asset.js';
import type {ValidationResult} from './common.js';
export type ReferenceLimits=Partial<Record<'text'|'image'|'video',number>>;
export type ResultSourceRun=Pick<Run,'id'|'projectId'|'nodeId'|'resultAssetId'|'executionState'>;
export type ConnectionResources={assets?:Asset[];runs?:ResultSourceRun[];limits?:ReferenceLimits};
export function tailFrameInput(node:CanvasNode,port:Edge['port']){return (node.type==='asset'||node.type==='result')&&port==='image'?node.data.tailFrame:undefined;}
export function resolvedInputAssetId(node:CanvasNode,port:Edge['port']){return tailFrameInput(node,port)?.assetId??((node.type==='asset'||node.type==='result')?node.data.assetId:undefined);}
export function validateConnection(graph:Graph,edge:Edge,caps:CapabilityProfile,resources:ConnectionResources={}):ValidationResult<Edge>{
 const fail=(code:string,message:string):ValidationResult<Edge>=>({ok:false,issues:[{code,path:'edge',message}]});
 if(!edgeSchema.safeParse(edge).success)return fail('edge_invalid','连线字段无效');
 const source=graph.nodes.find(n=>n.id===edge.sourceId),target=graph.nodes.find(n=>n.id===edge.targetId);
 if(!source||!target)return fail('edge_node_missing','连线节点不存在');if(source.id===target.id)return fail('edge_self','不能连接自身');
 if(edge.relation){
  if(edge.relation==='result'){
   const asset=(target.type==='asset'||target.type==='result')?resources.assets?.find(a=>a.id===target.data.assetId):undefined,run=resources.runs?.find(r=>r.id===asset?.sourceRunId);
   if(edge.port!=='video'||source.type!=='video-generation'||!asset||asset.mediaType!=='video'||asset.trashedAt!=null||!run||run.projectId!==graph.projectId||run.nodeId!==source.id||run.resultAssetId!==asset.id||run.executionState!=='succeeded'||target.type==='result'&&target.data.runId!==run.id)return fail('lineage_result_mismatch','生成结果与原任务不匹配');
   if(graph.edges.some(e=>e.id!==edge.id&&e.targetId===target.id&&e.relation==='result'))return fail('lineage_duplicate','已关联生成来源');
   const seen=new Set<string>();const reaches=(id:string):boolean=>{if(id===source.id)return true;if(seen.has(id))return false;seen.add(id);return graph.edges.filter(e=>e.id!==edge.id&&e.sourceId===id).some(e=>reaches(e.targetId));};if(reaches(target.id))return fail('edge_cycle','连线将形成循环');return {ok:true,value:edge};
  }
  const video=(source.type==='asset'||source.type==='result')?resources.assets?.find(a=>a.id===source.data.assetId):undefined;
  if(!video||video.mediaType!=='video'||video.trashedAt!=null||!video.sourceRunId||edge.port!=='video'||source.type==='result'&&source.data.runId!==video.sourceRunId)return fail('lineage_source_invalid','来源视频绑定无效');
  if(edge.relation==='tail-frame'){
   const frame=target.type==='asset'?target.data.sourceVideo:undefined,image=target.type==='asset'?resources.assets?.find(a=>a.id===target.data.assetId):undefined;
   if(!frame||!image||image.mediaType!=='image'||image.trashedAt!=null||frame.assetId!==image.id||frame.sourceAssetId!==video.id||frame.sourceRunId!==video.sourceRunId)return fail('lineage_frame_mismatch','尾帧来源不匹配');
  }else if(target.type!=='video-generation'||target.data.revisionSource?.assetId!==video.id||target.data.revisionSource.runId!==video.sourceRunId||target.data.revisionSource.projectId!==graph.projectId)return fail('lineage_revision_mismatch','修改来源不匹配');
  const other=graph.edges.filter(e=>e.id!==edge.id);if(other.some(e=>e.relation===edge.relation&&e.targetId===target.id))return fail('lineage_duplicate','已关联来源');
  const seen=new Set<string>();const reaches=(id:string):boolean=>{if(id===source.id)return true;if(seen.has(id))return false;seen.add(id);return other.filter(e=>e.sourceId===id).some(e=>reaches(e.targetId));};
  if(reaches(target.id))return fail('edge_cycle','连线将形成循环');return {ok:true,value:edge};
 }
 if(target.type!=='video-generation')return fail('edge_target_type','仅视频草稿接收显式执行输入');
 if(source.type==='group'||source.type==='video-generation')return fail('edge_source_type','请选择文字、素材或已固定的结果，组不自动发送成员');
 const asset=source.type==='asset'||source.type==='result'?resources.assets?.find(a=>a.id===source.data.assetId):undefined;
 const frame=tailFrameInput(source,edge.port),image=frame?resources.assets?.find(a=>a.id===frame.assetId):undefined;
 if(frame&&(!asset||asset.trashedAt!=null||asset.mediaType!=='video'||frame.sourceAssetId!==asset.id||frame.sourceRunId!==asset.sourceRunId||source.type==='result'&&source.data.runId!==frame.sourceRunId||!image||image.trashedAt!=null||image.mediaType!=='image'))return fail('tail_frame_source_mismatch','尾帧与原视频绑定已变化或文件缺失，请重新从该视频提取尾帧');
 if(source.type==='text'&&edge.port!=='text'||source.type!=='text'&&(!asset||asset.trashedAt!=null||!frame&&asset.mediaType!==edge.port))return fail('edge_port_type','输出与输入类型不匹配或素材尚不可读');
 const other=graph.edges.filter(e=>e.id!==edge.id),incoming=other.filter(e=>e.targetId===target.id&&!e.relation);
 if(incoming.some(e=>e.sourceId===source.id&&e.port===edge.port))return fail('edge_duplicate','该输入已连接');
 if(incoming.some(e=>e.order===edge.order))return fail('edge_order_duplicate','输入序号重复，请明确重新排序');
 const seen=new Set<string>();function reaches(id:string):boolean{if(id===source!.id)return true;if(seen.has(id))return false;seen.add(id);return other.filter(e=>e.sourceId===id).some(e=>reaches(e.targetId));}
 if(reaches(target.id))return fail('edge_cycle','连线将形成循环');
 const limit=resources.limits?.[edge.port];if(caps.verification!=='unknown'&&limit!==undefined){if(!Number.isSafeInteger(limit)||limit<0)return fail('edge_limit_unverified','参考上限无效');if(incoming.filter(e=>e.port===edge.port).length+1>limit)return fail('edge_limit_exceeded','超过当前已核验的参考上限');}
 return {ok:true,value:edge};
}
export function getOrderedInputs(graph:Graph,nodeId:string):InputBinding[]{
 return graph.edges.filter(e=>e.targetId===nodeId&&!e.relation).slice().sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)).map(edge=>{const node=graph.nodes.find(n=>n.id===edge.sourceId),frame=node?tailFrameInput(node,edge.port):undefined;return inputBindingSchema.parse({nodeId:edge.sourceId,order:edge.order,role:edge.port,...(frame?{assetId:frame.assetId,runId:frame.sourceRunId}:node?.type==='asset'?{assetId:node.data.assetId}:node?.type==='result'?{assetId:node.data.assetId,runId:node.data.runId}:{})});});
}
