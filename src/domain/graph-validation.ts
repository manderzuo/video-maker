import {edgeSchema,type Edge,type Graph,type InputBinding} from './graph';
import type {CapabilityProfile} from './connection';
import type {Asset} from './asset';
import type {ValidationResult} from './common';
export type ReferenceLimits=Partial<Record<'text'|'image'|'video',number>>;
export type ConnectionResources={assets?:Asset[];limits?:ReferenceLimits};
export function validateConnection(graph:Graph,edge:Edge,caps:CapabilityProfile,resources:ConnectionResources={}):ValidationResult<Edge>{
 const fail=(code:string,message:string):ValidationResult<Edge>=>({ok:false,issues:[{code,path:'edge',message}]});
 if(!edgeSchema.safeParse(edge).success)return fail('edge_invalid','连线字段无效');
 const source=graph.nodes.find(n=>n.id===edge.sourceId),target=graph.nodes.find(n=>n.id===edge.targetId);
 if(!source||!target)return fail('edge_node_missing','连线节点不存在');if(source.id===target.id)return fail('edge_self','不能连接自身');
 if(target.type!=='video-generation')return fail('edge_target_type','仅视频草稿接收显式执行输入');
 if(source.type==='group'||source.type==='video-generation')return fail('edge_source_type','请选择文字、素材或已固定的结果，组不自动发送成员');
 const asset=source.type==='asset'||source.type==='result'?resources.assets?.find(a=>a.id===source.data.assetId):undefined;
 if(source.type==='text'&&edge.port!=='text'||source.type!=='text'&&(!asset||asset.trashedAt||asset.mediaType!==edge.port))return fail('edge_port_type','输出与输入类型不匹配或素材尚不可读');
 const other=graph.edges.filter(e=>e.id!==edge.id),incoming=other.filter(e=>e.targetId===target.id);
 if(incoming.some(e=>e.sourceId===source.id&&e.port===edge.port))return fail('edge_duplicate','该输入已连接');
 if(incoming.some(e=>e.order===edge.order))return fail('edge_order_duplicate','输入序号重复，请明确重新排序');
 const seen=new Set<string>();function reaches(id:string):boolean{if(id===source!.id)return true;if(seen.has(id))return false;seen.add(id);return other.filter(e=>e.sourceId===id).some(e=>reaches(e.targetId));}
 if(reaches(target.id))return fail('edge_cycle','连线将形成循环');
 const limit=resources.limits?.[edge.port];if(caps.verification!=='unknown'&&limit!==undefined){if(!Number.isSafeInteger(limit)||limit<0)return fail('edge_limit_unverified','参考上限无效');if(incoming.filter(e=>e.port===edge.port).length+1>limit)return fail('edge_limit_exceeded','超过当前已核验的参考上限');}
 return {ok:true,value:edge};
}
export function getOrderedInputs(graph:Graph,nodeId:string):InputBinding[]{
 return graph.edges.filter(e=>e.targetId===nodeId).slice().sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)).map(edge=>{const node=graph.nodes.find(n=>n.id===edge.sourceId);return {nodeId:edge.sourceId,order:edge.order,role:edge.port,...(node?.type==='asset'?{assetId:node.data.assetId}:node?.type==='result'?{assetId:node.data.assetId,runId:node.data.runId}:{})};});
}
