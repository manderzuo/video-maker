// Group wrapping adapts basketikun/infinite-canvas dab19adc0847e32e39b7fc8ff90cb392561fb826.
// Copyright (c) 2026 basketikun; MIT, third-party/licenses/infinite-canvas.LICENSE.
import type {Graph,CanvasNode} from '../../domain/graph';
import type {GraphOperation} from '../../application/commands/registry';
import {nodeBounds,nodeRect,nodeSize,worldPosition} from './geometry';
export const GROUP_WRAP_PADDING=24,GROUP_WRAP_TOP_PADDING=52;
export type PositionPatch={nodeId:string;x:number;y:number};
export function collectGroupMemberNodes(graph:Graph,ids:string[]){const selected=new Set(ids),seen=new Set<string>();function collect(id:string){if(seen.has(id))return;seen.add(id);const node=graph.nodes.find(n=>n.id===id);if(node?.type==='group')node.data.childIds.forEach(collect);else if(node)selected.add(id);}ids.forEach(collect);return graph.nodes.filter(n=>n.type!=='group'&&selected.has(n.id));}
export function groupSelection(graph:Graph,ids:string[],title:string):GraphOperation[]{
 const members=collectGroupMemberNodes(graph,ids);if(members.length<2||members.some(n=>n.locked))throw new Error('group_selection_unavailable');
 const bounds=nodeBounds(members,graph),childIds=new Set(members.map(n=>n.id)),oldGroups=graph.nodes.filter(n=>n.type==='group'&&(ids.includes(n.id)||n.data.childIds.some(id=>childIds.has(id))));
 const node:CanvasNode={id:crypto.randomUUID(),type:'group',title,x:bounds.left-GROUP_WRAP_PADDING,y:bounds.top-GROUP_WRAP_TOP_PADDING,locked:false,data:{kind:'group',childIds:[...childIds],collapsed:false}};
 return [...oldGroups.map(group=>({id:crypto.randomUUID(),type:'ungroup' as const,payload:{nodeId:group.id}})),{id:crypto.randomUUID(),type:'group',payload:{node}}];
}
function movable(graph:Graph,ids:string[]){return graph.nodes.filter(n=>ids.includes(n.id)&&!n.locked&&!graph.nodes.some(group=>group.type==='group'&&ids.includes(group.id)&&group.data.childIds.includes(n.id)));}
function localPatch(graph:Graph,node:CanvasNode,x:number,y:number):PositionPatch{const world=worldPosition(node,graph);return {nodeId:node.id,x:x-(world.x-node.x),y:y-(world.y-node.y)};}
export function arrangeNodes(graph:Graph,ids:string[]):PositionPatch[]{
 const nodes=movable(graph,ids),bounds=nodeBounds(nodes,graph);if(!nodes.length)return [];
 const columns=Math.min(4,Math.ceil(Math.sqrt(nodes.length))),width=Math.max(...nodes.map(n=>nodeSize(n,graph).width))+48,height=Math.max(...nodes.map(n=>nodeSize(n,graph).height))+48;
 return nodes.map((node,index)=>localPatch(graph,node,bounds.left+(index%columns)*width,bounds.top+Math.floor(index/columns)*height));
}
export function alignNodes(graph:Graph,ids:string[],mode:'left'|'top'|'horizontal-spacing'):PositionPatch[]{
 const nodes=movable(graph,ids);if(nodes.length<(mode==='horizontal-spacing'?3:2))return [];
 if(mode==='horizontal-spacing'){
  const ordered=nodes.slice().sort((a,b)=>nodeRect(a,graph).left-nodeRect(b,graph).left||a.id.localeCompare(b.id)),first=nodeRect(ordered[0],graph),last=nodeRect(ordered.at(-1)!,graph),occupied=ordered.reduce((sum,n)=>sum+nodeSize(n,graph).width,0),gap=(last.right-first.left-occupied)/(ordered.length-1);let x=first.left;
  return ordered.map(node=>{const patch=localPatch(graph,node,x,worldPosition(node,graph).y);x+=nodeSize(node,graph).width+gap;return patch;});
 }
 const bounds=nodeBounds(nodes,graph);return nodes.map(node=>{const p=worldPosition(node,graph);return localPatch(graph,node,mode==='left'?bounds.left:p.x,mode==='top'?bounds.top:p.y);});
}
export const moveOperations=(patches:PositionPatch[]):GraphOperation[]=>patches.map(patch=>({id:crypto.randomUUID(),type:'move_node',payload:patch}));
