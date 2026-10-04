import {graphSchema,type Graph} from '../../domain/graph';
import type {ValidationResult} from '../../domain/common';
// Per-node graph planning is distinct from T26's sealed batch confirmation.
export type GraphNodePlan={nodeId:string;inputNodeIds:string[];dependencyNodeIds:string[];dependencyRunIds:string[];requiresVisibleOutputs:string[]};
export function planGraphRuns(graph:Graph,selected:string[]):ValidationResult<GraphNodePlan[]>{
 const invalid=(code:string,message:string):ValidationResult<GraphNodePlan[]>=>({ok:false,issues:[{code,path:'graph',message}]});
 if(!graphSchema.safeParse(graph).success)return invalid('queue_graph_invalid','画布数据无效');
 if(!selected.length||new Set(selected).size!==selected.length||selected.some(id=>graph.nodes.find(n=>n.id===id)?.type!=='video-generation'))return invalid('queue_selection_invalid','请明确选择视频节点，分组不会自动展开');
 const visiting=new Set<string>(),visited=new Set<string>();
 function visit(id:string):boolean{if(visiting.has(id))return false;if(visited.has(id))return true;visiting.add(id);for(const e of graph.edges.filter(e=>e.targetId===id))if(!visit(e.sourceId))return false;visiting.delete(id);visited.add(id);return true;}
 if(graph.nodes.some(n=>!visit(n.id)))return invalid('queue_graph_cycle','画布依赖存在循环');
 const plans=selected.map(nodeId=>{const inputs=graph.edges.filter(e=>e.targetId===nodeId&&!e.relation).sort((a,b)=>a.order-b.order).map(e=>graph.nodes.find(n=>n.id===e.sourceId)!);return {nodeId,inputNodeIds:inputs.map(n=>n.id),dependencyNodeIds:inputs.filter(n=>n.type==='video-generation').map(n=>n.id),dependencyRunIds:[...new Set(inputs.flatMap(n=>n.type==='result'?[n.data.runId]:[]))],requiresVisibleOutputs:inputs.filter(n=>n.type==='video-generation').map(n=>n.id)};});
 const ordered:GraphNodePlan[]=[],done=new Set<string>();
 function append(plan:GraphNodePlan){if(done.has(plan.nodeId))return;for(const id of plan.dependencyNodeIds){const parent=plans.find(p=>p.nodeId===id);if(parent)append(parent);}done.add(plan.nodeId);ordered.push(plan);}
 plans.forEach(append);return {ok:true,value:ordered};
}
