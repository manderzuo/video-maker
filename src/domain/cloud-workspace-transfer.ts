import {z} from 'zod';
import {graphSchema,nodeSchema,edgeSchema,viewportSchema,type Graph} from './graph.js';
import {projectSchema} from './project.js';
const history=z.strictObject({undoDepth:z.number().int().nonnegative(),redoDepth:z.number().int().nonnegative()});
const receipt={id:z.uuid(),status:z.enum(['applied','replayed']),revision:z.number().int().nonnegative(),commandRevision:z.number().int().nonnegative().optional(),project:projectSchema,history:history.optional()};
export const graphDeltaSchema=z.strictObject({projectId:z.string().min(1),baseRevision:z.number().int().nonnegative(),revision:z.number().int().nonnegative(),nodes:z.array(nodeSchema),removedNodeIds:z.array(z.string().min(1)),nodeOrder:z.array(z.string().min(1)).optional(),edges:z.array(edgeSchema),removedEdgeIds:z.array(z.string().min(1)),edgeOrder:z.array(z.string().min(1)).optional(),viewport:viewportSchema});
export const fullCommandReceiptSchema=z.strictObject({...receipt,graph:graphSchema}).refine(v=>v.project.id===v.graph.projectId&&v.revision===v.project.revision&&v.revision===v.graph.revision);
export const deltaCommandReceiptSchema=z.strictObject({...receipt,delta:graphDeltaSchema}).refine(v=>v.project.id===v.delta.projectId&&v.revision===v.project.revision&&v.revision===v.delta.revision);
export const commandTransferSchema=z.union([fullCommandReceiptSchema,deltaCommandReceiptSchema]);
type Identified={id:string};
function changes<T extends Identified>(before:T[],after:T[]){
 const prior=new Map(before.map(n=>[n.id,n])),ids=new Set(after.map(n=>n.id)),removed=before.filter(n=>!ids.has(n.id)).map(n=>n.id),updated=after.filter(n=>JSON.stringify(prior.get(n.id))!==JSON.stringify(n));
 const merged=[...before.filter(n=>ids.has(n.id)).map(n=>n.id),...after.filter(n=>!prior.has(n.id)).map(n=>n.id)],order=after.map(n=>n.id);
 return {updated,removed,...(JSON.stringify(merged)!==JSON.stringify(order)?{order}:{})};
}
export function buildGraphDelta(before:Graph,after:Graph){
 if(before.projectId!==after.projectId||before.revision>after.revision)throw new Error('invalid_graph_delta_base');
 const nodes=changes(before.nodes,after.nodes),edges=changes(before.edges,after.edges);
 return graphDeltaSchema.parse({projectId:after.projectId,baseRevision:before.revision,revision:after.revision,nodes:nodes.updated,removedNodeIds:nodes.removed,...(nodes.order?{nodeOrder:nodes.order}:{}),edges:edges.updated,removedEdgeIds:edges.removed,...(edges.order?{edgeOrder:edges.order}:{}),viewport:after.viewport});
}
function merge<T extends Identified>(before:T[],updated:T[],removed:string[],order?:string[]):T[]{
 const deleted=new Set(removed),prior=new Set(before.map(n=>n.id)),changed=new Map(updated.map(n=>[n.id,n]));
 if(changed.size!==updated.length||deleted.size!==removed.length||removed.some(id=>!prior.has(id))||updated.some(n=>deleted.has(n.id)))throw new Error('invalid_graph_delta');
 const values=[...before.filter(n=>!deleted.has(n.id)).map(n=>changed.get(n.id)??n),...updated.filter(n=>!prior.has(n.id))];
 if(!order)return values;
 const byId=new Map(values.map(n=>[n.id,n]));if(new Set(order).size!==order.length||order.length!==values.length||order.some(id=>!byId.has(id)))throw new Error('invalid_graph_delta_order');
 return order.map(id=>byId.get(id)!);
}
export function applyGraphDelta(before:Graph,input:z.infer<typeof graphDeltaSchema>):Graph{
 const delta=graphDeltaSchema.parse(input);if(before.projectId!==delta.projectId||before.revision!==delta.baseRevision||delta.revision<delta.baseRevision)throw new Error('invalid_graph_delta_base');
 return graphSchema.parse({projectId:delta.projectId,revision:delta.revision,nodes:merge(before.nodes,delta.nodes,delta.removedNodeIds,delta.nodeOrder),edges:merge(before.edges,delta.edges,delta.removedEdgeIds,delta.edgeOrder),viewport:delta.viewport});
}
