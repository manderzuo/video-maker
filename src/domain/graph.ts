import {z} from 'zod';
import {id,revision,localText,videoSpecSchema,boundedText} from './common';
export const referenceTokenSchema=z.strictObject({assetId:id.optional(),alias:id,mediaType:z.enum(['image','video','audio']),role:z.string(),description:localText,available:z.boolean(),unbound:z.boolean()});
export type ReferenceToken=z.infer<typeof referenceTokenSchema>;
export const inputBindingSchema=z.strictObject({nodeId:id,assetId:id.optional(),runId:id.optional(),order:z.number().int().nonnegative(),role:z.string()});
export type InputBinding=z.infer<typeof inputBindingSchema>;
const textData=z.strictObject({kind:z.literal('text'),text:localText,referenceTokens:z.array(referenceTokenSchema),promptLibrarySource:z.strictObject({entryId:id,revision,source:z.string(),license:z.string()}).optional()});
const assetData=z.strictObject({kind:z.literal('asset'),assetId:id});
const generationData=z.strictObject({kind:z.literal('video-generation'),draft:videoSpecSchema,inputBindings:z.array(inputBindingSchema),stale:z.boolean(),missingInputNodeIds:z.array(id).optional()});
const resultData=z.strictObject({kind:z.literal('result'),assetId:id,runId:id,selectionRevision:revision.optional()});
const groupData=z.strictObject({kind:z.literal('group'),childIds:z.array(id),collapsed:z.boolean(),shotOrder:z.number().int().positive().optional()});
const nodeBase={id,title:boundedText(1,60).refine(title=>!!title.trim(),'标题不能为空'),x:z.number(),y:z.number(),locked:z.boolean()};
export const nodeSchema=z.discriminatedUnion('type',[
 z.strictObject({...nodeBase,type:z.literal('text'),data:textData}),z.strictObject({...nodeBase,type:z.literal('asset'),data:assetData}),z.strictObject({...nodeBase,type:z.literal('video-generation'),data:generationData}),z.strictObject({...nodeBase,type:z.literal('result'),data:resultData}),z.strictObject({...nodeBase,type:z.literal('group'),data:groupData}),
]);
export type CanvasNode=z.infer<typeof nodeSchema>;
export type NodeData=CanvasNode['data'];
export const edgeSchema=z.strictObject({id,sourceId:id,targetId:id,port:z.enum(['text','image','video']),order:z.number().int().nonnegative()});
export type Edge=z.infer<typeof edgeSchema>;
export const viewportSchema=z.strictObject({x:z.number(),y:z.number(),scale:z.number().min(.25).max(2)});
export type Viewport=z.infer<typeof viewportSchema>;
export const graphSchema=z.strictObject({projectId:id,revision,nodes:z.array(nodeSchema),edges:z.array(edgeSchema),viewport:viewportSchema}).superRefine((graph,ctx)=>{
 const nodes=new Set(graph.nodes.map(n=>n.id));
 if(nodes.size!==graph.nodes.length)ctx.addIssue({code:'custom',message:'节点ID重复'});
 if(new Set(graph.edges.map(e=>e.id)).size!==graph.edges.length)ctx.addIssue({code:'custom',message:'连线ID重复'});
 for(const e of graph.edges)if(e.sourceId===e.targetId||!nodes.has(e.sourceId)||!nodes.has(e.targetId))ctx.addIssue({code:'custom',message:'连线引用无效'});
 const parents=new Map<string,string>();for(const group of graph.nodes)if(group.type==='group')for(const child of group.data.childIds){if(child===group.id||!nodes.has(child)||parents.has(child))ctx.addIssue({code:'custom',message:'分组成员引用、重复或父关系无效'});parents.set(child,group.id);}
 for(const node of graph.nodes){const seen=new Set<string>();let current:string|undefined=node.id;while(current){if(seen.has(current)){ctx.addIssue({code:'custom',message:'分组不能嵌套成环'});break;}seen.add(current);current=parents.get(current);}}
});
export type Graph=z.infer<typeof graphSchema>;
