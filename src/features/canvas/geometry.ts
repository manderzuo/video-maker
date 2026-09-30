// Adapted from basketikun/infinite-canvas dab19adc0847e32e39b7fc8ff90cb392561fb826,
// web/src/lib/canvas/canvas-node-geometry.ts. Copyright (c) 2026 basketikun.
// MIT license: third-party/licenses/infinite-canvas.LICENSE. Domain/UI adaptation by AI WORK Studio.
import type {CanvasNode,Graph} from '../../domain/graph';
export type Rect={left:number;top:number;right:number;bottom:number};
export function nodeSize(node:CanvasNode,graph?:Graph,seen=new Set<string>()):{width:number;height:number}{
 if(node.type==='group'&&graph&&!node.data.collapsed&&!seen.has(node.id)&&node.data.childIds.length){const nextSeen=new Set([...seen,node.id]),members=graph.nodes.filter(n=>node.data.childIds.includes(n.id));return {width:Math.max(320,...members.map(n=>n.x+nodeSize(n,graph,nextSeen).width+24)),height:Math.max(100,...members.map(n=>n.y+nodeSize(n,graph,nextSeen).height+24))};}
 return {width:node.type==='video-generation'?360:node.type==='group'?400:320,height:node.type==='group'?(node.data.collapsed?64:260):node.type==='text'?380:node.type==='video-generation'?600:200};
}
export function worldPosition(node:CanvasNode,graph:Graph){let x=node.x,y=node.y;const seen=new Set([node.id]);let current=node;while(true){const parent=graph.nodes.find(n=>n.type==='group'&&n.data.childIds.includes(current.id));if(!parent||seen.has(parent.id))break;seen.add(parent.id);x+=parent.x;y+=parent.y;current=parent;}return {x,y};}
export function nodeRect(node:CanvasNode,graph:Graph):Rect{const {x,y}=worldPosition(node,graph),size=nodeSize(node,graph);return {left:x,top:y,right:x+size.width,bottom:y+size.height};}
export function nodeBounds(nodes:CanvasNode[],graph:Graph):Rect{
 return nodes.reduce((acc,node)=>{const bounds=nodeRect(node,graph);return {left:Math.min(acc.left,bounds.left),top:Math.min(acc.top,bounds.top),right:Math.max(acc.right,bounds.right),bottom:Math.max(acc.bottom,bounds.bottom)};},{left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity});
}
export function visibleNodes(graph:Graph){return graph.nodes.filter(node=>{let current=node;const seen=new Set([node.id]);while(true){const group=graph.nodes.find(n=>n.type==='group'&&n.data.childIds.includes(current.id));if(!group||seen.has(group.id))return true;if(group.type==='group'&&group.data.collapsed)return false;seen.add(group.id);current=group;}});}
export function projectedNode(node:CanvasNode,graph:Graph){let current=node,projected=node;const seen=new Set([node.id]);while(true){const parent=graph.nodes.find(n=>n.type==='group'&&n.data.childIds.includes(current.id));if(!parent||seen.has(parent.id))return projected;if(parent.type==='group'&&parent.data.collapsed)projected=parent;seen.add(parent.id);current=parent;}}
