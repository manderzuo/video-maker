import type {Graph,CanvasNode,Edge} from '../../domain/graph';
import type {VideoSpec} from '../../domain/common';
import type {Run} from '../../domain/run';
import type {GraphOperation} from '../../application/commands/registry';
import {worldPosition} from './geometry';
export type NodeClipboard={nodes:CanvasNode[];edges:Edge[];externalInputs:number;positions:Record<string,{x:number;y:number}>;missingInputs:Record<string,string[]>};
export function copyNodes(graph:Graph,ids:string[]):NodeClipboard{
 const all=new Set(ids);let changed=true;while(changed){changed=false;for(const node of graph.nodes)if(node.type==='group'&&all.has(node.id))for(const id of node.data.childIds)if(!all.has(id)){all.add(id);changed=true;}}
 const external=graph.edges.filter(e=>!all.has(e.sourceId)&&all.has(e.targetId));
 return {nodes:structuredClone(graph.nodes.filter(n=>all.has(n.id))),edges:structuredClone(graph.edges.filter(e=>all.has(e.sourceId)&&all.has(e.targetId))),externalInputs:external.length,positions:Object.fromEntries(graph.nodes.filter(n=>all.has(n.id)).map(n=>[n.id,worldPosition(n,graph)])),missingInputs:Object.fromEntries(graph.nodes.filter(n=>all.has(n.id)).map(n=>[n.id,external.filter(e=>e.targetId===n.id).map(e=>e.sourceId)]))};
}
export function pasteNodes(clipboard:NodeClipboard,sourceGraph:Graph):GraphOperation[]{
 const ids=new Map(clipboard.nodes.map(n=>[n.id,crypto.randomUUID()])),ops:GraphOperation[]=[],groups=clipboard.nodes.filter(n=>n.type==='group');
 for(const old of clipboard.nodes.filter(n=>n.type!=='group')){
  const p=clipboard.positions[old.id]??worldPosition(old,sourceGraph),node=structuredClone(old);node.id=ids.get(old.id)!;node.locked=false;node.x=p.x+24;node.y=p.y+24;
  if(node.type==='video-generation')node.data={...node.data,inputBindings:[],stale:true,missingInputNodeIds:[...new Set([...(node.data.missingInputNodeIds??[]),...(clipboard.missingInputs[old.id]??[])])]};
  if(node.type==='result')delete node.data.selectionRevision;
  ops.push({id:crypto.randomUUID(),type:'add_node',payload:{node}});
 }
 const pending=groups.slice();while(pending.length){const index=pending.findIndex(group=>group.type==='group'&&!group.data.childIds.some(id=>pending.some(other=>other.id===id)));if(index<0)throw new Error('clipboard_group_cycle');const old=pending.splice(index,1)[0];if(old.type!=='group')continue;const p=clipboard.positions[old.id]??worldPosition(old,sourceGraph),childIds=old.data.childIds.flatMap(id=>ids.has(id)?[ids.get(id)!]:[]);const node:CanvasNode={...structuredClone(old),id:ids.get(old.id)!,x:p.x+24,y:p.y+24,locked:false,data:{...old.data,childIds}};ops.push({id:crypto.randomUUID(),type:childIds.length?'group':'add_node',payload:{node}});}
 for(const edge of clipboard.edges)ops.push({id:crypto.randomUUID(),type:'add_edge',payload:{edge:{...edge,id:crypto.randomUUID(),sourceId:ids.get(edge.sourceId)!,targetId:ids.get(edge.targetId)!}}});return ops;
}
export function branchSpec(graph:Graph,sourceId:string,options:{sourceRun?:Run;defaultDraft?:VideoSpec}={}):VideoSpec|undefined{
 const source=graph.nodes.find(n=>n.id===sourceId);if(source?.type==='video-generation')return source.data.draft;
 const linked=graph.edges.filter(e=>e.sourceId===sourceId).map(e=>graph.nodes.find(n=>n.id===e.targetId)).find(n=>n?.type==='video-generation');if(linked?.type==='video-generation')return linked.data.draft;
 if(source?.type==='result'){const run=options.sourceRun;if(!run||run.id!==source.data.runId||run.resultAssetId!==source.data.assetId||run.executionState!=='succeeded')return undefined;return run.requestedSpec??run.executionSpec??options.defaultDraft;}
 return source?.type==='text'?options.defaultDraft:undefined;
}
export function createBranch(graph:Graph,sourceId:string,options:{sourceRun?:Run;defaultDraft?:VideoSpec}={}):GraphOperation[]{
 const source=graph.nodes.find(n=>n.id===sourceId),draft=branchSpec(graph,sourceId,options);if(!source||!draft)throw new Error('branch_video_parameters_missing');
 const p=worldPosition(source,graph),node:CanvasNode={id:crypto.randomUUID(),title:'新分支',type:'video-generation',x:p.x+24,y:p.y+24,locked:false,data:{kind:'video-generation',draft:structuredClone(draft),inputBindings:[],stale:true}},operations:GraphOperation[]=[{id:crypto.randomUUID(),type:'add_node',payload:{node}}];
 if(source.type==='video-generation')for(const edge of graph.edges.filter(e=>e.targetId===source.id))operations.push({id:crypto.randomUUID(),type:'add_edge',payload:{edge:{...edge,id:crypto.randomUUID(),targetId:node.id}}});
 else operations.push({id:crypto.randomUUID(),type:'add_edge',payload:{edge:{id:crypto.randomUUID(),sourceId,targetId:node.id,port:source.type==='text'?'text':'video',order:0}}});return operations;
}

