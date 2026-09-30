import {z} from 'zod';
import {graphSchema,nodeSchema,edgeSchema,type Graph} from '../../domain/graph';
import {id,revision,snapshotSchema} from '../../domain/common';
export type GraphOperation={id:string;type:'add_node'|'update_node'|'remove_node'|'add_edge'|'remove_edge'|'move_node'|'group'|'ungroup'|'select_result';payload:Record<string,unknown>};
const operationSchema=z.discriminatedUnion('type',[
 z.strictObject({id,type:z.literal('add_node'),payload:z.strictObject({node:nodeSchema})}),
 z.strictObject({id,type:z.literal('update_node'),payload:z.strictObject({nodeId:id,patch:z.strictObject({title:z.string().optional(),locked:z.boolean().optional(),data:nodeSchema.options[0].shape.data.or(nodeSchema.options[1].shape.data).or(nodeSchema.options[2].shape.data).or(nodeSchema.options[3].shape.data).or(nodeSchema.options[4].shape.data).optional()})})}),
 z.strictObject({id,type:z.literal('remove_node'),payload:z.strictObject({nodeId:id})}),
 z.strictObject({id,type:z.literal('add_edge'),payload:z.strictObject({edge:edgeSchema})}),
 z.strictObject({id,type:z.literal('remove_edge'),payload:z.strictObject({edgeId:id})}),
 z.strictObject({id,type:z.literal('move_node'),payload:z.strictObject({nodeId:id,x:z.number().finite(),y:z.number().finite()})}),
 z.strictObject({id,type:z.literal('group'),payload:z.strictObject({node:nodeSchema.refine(n=>n.type==='group')})}),
 z.strictObject({id,type:z.literal('ungroup'),payload:z.strictObject({nodeId:id})}),
 z.strictObject({id,type:z.literal('select_result'),payload:z.strictObject({nodeId:id,assetId:id,runId:id})})
]);
export const commandEnvelopeSchema=z.strictObject({id,projectId:id,baseRevision:revision,leaseEpoch:z.number().int().positive(),origin:z.enum(['ui','mcp']),operations:z.array(operationSchema).min(1)}).superRefine((command,ctx)=>{
 if(new Set(command.operations.map(o=>o.id)).size!==command.operations.length)ctx.addIssue({code:'custom',message:'命令操作ID重复'});
 if(!snapshotSchema.safeParse(command).success)ctx.addIssue({code:'custom',message:'命令含不安全数据'});
});
export type CommandEnvelope={id:string;projectId:string;baseRevision:number;leaseEpoch:number;origin:'ui'|'mcp';operations:GraphOperation[]};
export type CommandReceipt={id:string;status:'applied'|'replayed'|'conflict'|'rejected';revision?:number;errorCode?:string};
export function executeGraphOperations(graph:Graph,operations:GraphOperation[]):Graph{
 const next=structuredClone(graph);
 const requireNode=(nodeId:string)=>{const node=next.nodes.find(n=>n.id===nodeId);if(!node)throw new Error('command_node_missing');return node;};
 const ungroup=(nodeId:string)=>{const group=requireNode(nodeId);if(group.type!=='group')throw new Error('command_not_group');for(const id of group.data.childIds){const child=requireNode(id);child.x+=group.x;child.y+=group.y;}next.nodes=next.nodes.filter(n=>n.id!==nodeId);};
 for(const input of operations){
  const operation=operationSchema.parse(input);
  if(operation.type==='add_node'){
   if(next.nodes.some(n=>n.id===operation.payload.node.id))throw new Error('command_node_id_exists');
   if(operation.payload.node.type==='group'&&operation.payload.node.data.childIds.length)throw new Error('use_explicit_group_command');
   next.nodes.push(operation.payload.node);
  }else if(operation.type==='group'){
   const group=operation.payload.node;if(group.type!=='group'||!group.data.childIds.length||next.nodes.some(n=>n.id===group.id))throw new Error('command_group_invalid');
   if(new Set(group.data.childIds).size!==group.data.childIds.length)throw new Error('command_group_invalid');
   for(const id of group.data.childIds){const child=requireNode(id);if(child.locked||next.nodes.some(n=>n.type==='group'&&n.data.childIds.includes(id)))throw new Error('command_group_child_unavailable');child.x-=group.x;child.y-=group.y;}
   next.nodes.push(group);
  }else if(operation.type==='add_edge'){
   if(next.edges.some(e=>e.id===operation.payload.edge.id))throw new Error('command_edge_id_exists');next.edges.push(operation.payload.edge);
  }else if(operation.type==='remove_edge'){
   if(!next.edges.some(e=>e.id===operation.payload.edgeId))throw new Error('command_edge_missing');next.edges=next.edges.filter(e=>e.id!==operation.payload.edgeId);
  }else{
   const node=requireNode(operation.payload.nodeId);
   if(node.locked&&!(operation.type==='update_node'&&operation.payload.patch.locked===false))throw new Error('command_node_locked');
   if(operation.type==='remove_node'){
    if(node.type==='group')ungroup(node.id);else next.nodes=next.nodes.filter(n=>n.id!==node.id);
    next.edges=next.edges.filter(e=>e.sourceId!==node.id&&e.targetId!==node.id);
    for(const group of next.nodes)if(group.type==='group')group.data.childIds=group.data.childIds.filter(id=>id!==node.id);
   }else if(operation.type==='move_node'){node.x=operation.payload.x;node.y=operation.payload.y;}
   else if(operation.type==='update_node'){next.nodes[next.nodes.indexOf(node)]=nodeSchema.parse({...node,...operation.payload.patch});}
   else if(operation.type==='ungroup'){ungroup(node.id);}
   else if(operation.type==='select_result'){if(node.type!=='result')throw new Error('command_result_node_required');node.data={kind:'result',assetId:operation.payload.assetId,runId:operation.payload.runId};}
  }
 }
 const validated=graphSchema.parse(next);
 const visiting=new Set<string>(),finished=new Set<string>();
 const walk=(id:string)=>{if(visiting.has(id))throw new Error('command_graph_cycle');if(finished.has(id))return;visiting.add(id);for(const edge of validated.edges)if(edge.sourceId===id)walk(edge.targetId);visiting.delete(id);finished.add(id);};
 for(const node of validated.nodes)walk(node.id);
 return validated;
}
