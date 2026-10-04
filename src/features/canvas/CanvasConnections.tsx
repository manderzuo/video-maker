import {useEffect,useRef,useState,type PointerEvent,type RefObject} from 'react';
import type {ResultSourceRun} from '../../domain/graph-validation';
import type {Asset} from '../../domain/asset';
import type {CapabilityProfile} from '../../domain/connection';
import type {CanvasNode,Edge,Graph,Viewport} from '../../domain/graph';
import {validateConnection,tailFrameInput} from '../../domain/graph-validation';
import type {GraphOperation} from '../../application/commands/registry';
import {nodeRect,projectedNode} from './geometry';

type Port=Edge['port'];
type Start={nodeId:string;port:Port};
type Point={x:number;y:number};
const names:Record<Port,string>={text:'文本',image:'图片',video:'视频'};
const offsets:Record<Port,number>={text:80,image:120,video:160};
function anchor(node:CanvasNode,graph:Graph,port:Port,input:boolean):Point{
 const shown=projectedNode(node,graph),r=nodeRect(shown,graph);
 return {x:input?r.left:r.right,y:r.top+(shown.type==='group'?32:input?offsets[port]:node.type==='video-generation'?40:tailFrameInput(node,port)?120:80)};
}
function curve(a:Point,b:Point){const bend=Math.max(60,Math.min(180,Math.abs(b.x-a.x)/2));return `M ${a.x} ${a.y} C ${a.x+bend} ${a.y}, ${b.x-bend} ${b.y}, ${b.x} ${b.y}`;}
type Options={graph?:Graph;selectedNodes:string[];view:Viewport;assets:Asset[];runs:ResultSourceRun[];capability:CapabilityProfile;canWrite:boolean;stage:RefObject<HTMLDivElement|null>;onCommand:(ops:GraphOperation[])=>Promise<boolean>;onError:(message:string)=>void;onSelectNodes:(ids:string[])=>void};

export function useCanvasConnections(options:Options){
 const latest=useRef(options);latest.current=options;
 const pending=useRef<Start|undefined>(undefined),drag=useRef<{x:number;y:number;pointerId:number;moved:boolean}|undefined>(undefined);
 const [start,setStart]=useState<Start>(),[cursor,setCursor]=useState<Point>(),[selectedEdgeId,setSelectedEdgeId]=useState<string>(),[menu,setMenu]=useState<{edgeId:string;x:number;y:number}>();
 function cancel(){pending.current=undefined;drag.current=undefined;setStart(undefined);setCursor(undefined);}
 function clearSelection(){setSelectedEdgeId(undefined);setMenu(undefined);}
 function writable(edge:Edge){const current=latest.current;return current.canWrite&&!!current.graph?.nodes.some(n=>n.id===edge.targetId&&!n.locked);}
 function candidate(targetId:string,port:Port,relation?:Edge['relation']){const current=latest.current,source=pending.current,g=current.graph;if(!g||!source)return undefined;return {id:'connection-preview',sourceId:source.nodeId,targetId,port,...(relation?{relation}:{}),order:Math.max(-1,...g.edges.filter(e=>e.targetId===targetId).map(e=>e.order))+1};}
 function connectable(targetId:string,port:Port,relation?:Edge['relation']){const current=latest.current,edge=candidate(targetId,port,relation);return !!edge&&pending.current?.port===port&&writable(edge)&&validateConnection(current.graph!,edge,current.capability,{assets:current.assets,runs:current.runs}).ok;}
 function finish(targetId:string,port:Port,relation?:Edge['relation']){
  const current=latest.current,edge=candidate(targetId,port,relation);if(!edge)return;
  const sourcePort=pending.current?.port;cancel();
  if(!writable(edge)){current.onError('当前只读或视频节点已锁定，不能修改连接。');return;}
  if(sourcePort!==port){current.onError('输出与输入类型不匹配。');return;}
  const valid=validateConnection(current.graph!,edge,current.capability,{assets:current.assets,runs:current.runs});if(!valid.ok){current.onError(valid.issues[0].message);return;}
  clearSelection();current.onError('');void current.onCommand([{id:crypto.randomUUID(),type:'add_edge',payload:{edge:{...edge,id:crypto.randomUUID()}}}]);
 }
 function begin(nodeId:string,port:Port,event?:PointerEvent<HTMLButtonElement>){
  const current=latest.current,node=current.graph?.nodes.find(n=>n.id===nodeId);if(!current.canWrite||!node||node.locked)return;
  if(event&&event.button!==0)return;event?.preventDefault();event?.stopPropagation();
  cancel();clearSelection();current.onSelectNodes([]);pending.current={nodeId,port};setStart(pending.current);
  const from=anchor(node,current.graph!,port,false);setCursor({x:from.x+60,y:from.y});
  if(event)drag.current={x:event.clientX,y:event.clientY,pointerId:event.pointerId,moved:false};
  current.stage.current?.focus({preventScroll:true});
 }
 async function disconnect(edgeId=selectedEdgeId){
  const current=latest.current,edge=current.graph?.edges.find(e=>e.id===edgeId);if(!edge)return;
  if(!writable(edge)){current.onError('当前只读或视频节点已锁定，不能断开连接。');return;}
  cancel();if(await current.onCommand([{id:crypto.randomUUID(),type:'remove_edge',payload:{edgeId:edge.id}}]))clearSelection();
 }
 function selectEdge(edgeId:string){cancel();setSelectedEdgeId(edgeId);setMenu(undefined);latest.current.onSelectNodes([]);}
 function openMenu(edgeId:string,clientX:number,clientY:number){selectEdge(edgeId);const stage=latest.current.stage.current;if(!stage)return;const rect=stage.getBoundingClientRect();setMenu({edgeId,x:Math.max(0,Math.min(rect.width-220,clientX-rect.left)),y:Math.max(0,Math.min(rect.height-120,clientY-rect.top))});}
 const handlers=useRef({cancel,finish});handlers.current={cancel,finish};
 useEffect(()=>{
  function move(event:globalThis.PointerEvent){const current=latest.current;if(!pending.current||!current.stage.current)return;const rect=current.stage.current.getBoundingClientRect();setCursor({x:(event.clientX-rect.left-current.view.x)/current.view.scale,y:(event.clientY-rect.top-current.view.y)/current.view.scale});if(drag.current&&drag.current.pointerId===event.pointerId&&Math.hypot(event.clientX-drag.current.x,event.clientY-drag.current.y)>4)drag.current.moved=true;}
  function up(event:globalThis.PointerEvent){const active=drag.current;if(!active||active.pointerId!==event.pointerId)return;drag.current=undefined;if(!active.moved)return;
   const input=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLButtonElement>('[data-input-node]');
   if(input&&!input.disabled)handlers.current.finish(input.dataset.inputNode!,input.dataset.port as Port,input.dataset.relation as Edge['relation']);else handlers.current.cancel();
  }
  function cancel(){handlers.current.cancel();}
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);
  return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);};
 },[]);
 useEffect(()=>{if(!options.canWrite){handlers.current.cancel();setMenu(undefined);}},[options.canWrite]);
 useEffect(()=>{if(selectedEdgeId&&(options.selectedNodes.length||!options.graph?.edges.some(edge=>edge.id===selectedEdgeId))){setSelectedEdgeId(undefined);setMenu(undefined);}},[options.selectedNodes,options.graph,selectedEdgeId]);
 function canDisconnect(edgeId:string){const edge=latest.current.graph?.edges.find(e=>e.id===edgeId);return !!edge&&writable(edge);}
 return {start,cursor,selectedEdgeId,menu,begin,finish,connectable,cancel,clearSelection,disconnect,selectEdge,openMenu,canDisconnect,hasPending:()=>!!pending.current};
}
export type CanvasConnections=ReturnType<typeof useCanvasConnections>;

export function NodePorts({graph,node,assets,runs,canWrite,connections}:{runs:ResultSourceRun[];graph:Graph;node:CanvasNode;assets:Asset[];canWrite:boolean;connections:CanvasConnections}){
 const media=(node.type==='asset'||node.type==='result')?assets.find(a=>a.id===node.data.assetId)?.mediaType:undefined;
 const inputs:Port[]=node.type==='video-generation'?['text','image','video']:[],output:Port|undefined=node.type==='text'?'text':media==='image'||media==='video'?media:undefined;
 const origin=graph.edges.find(e=>e.targetId===node.id&&e.relation),relation=origin?.relation??(node.type==='asset'&&node.data.sourceVideo?'tail-frame':node.type==='video-generation'&&node.data.revisionSource?'revision':(node.type==='asset'||node.type==='result')&&node.data.generationLinked?'result':undefined);
 const relationName=relation==='tail-frame'?'尾帧来源':relation==='result'?'生成来源':'修改来源';
 return <div className="node-ports">{node.type==='video-generation'&&runs.some(r=>r.nodeId===node.id&&r.executionState==='succeeded'&&r.resultAssetId)?<button type="button" data-interaction-id="canvas:result-output" className="canvas-port port-output lineage-port" style={{top:40}} disabled={!canWrite||node.locked} aria-label="输出生成结果" onPointerDown={e=>connections.begin(node.id,'video',e)} onClick={e=>{e.stopPropagation();if(e.detail===0)connections.begin(node.id,'video');}}><span className="port-dot" aria-hidden="true"/><span className="port-label">生成结果</span></button>:null}{relation?<button type="button" data-interaction-id="canvas:source-input" data-input-node={node.id} data-port="video" data-relation={relation} data-connectable={connections.start?String(connections.connectable(node.id,'video',relation)):undefined} className="canvas-port port-input lineage-port" style={{top:40}} disabled={!canWrite||node.locked} aria-label={'关联'+relationName} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();connections.finish(node.id,'video',relation);}}><span className="port-dot" aria-hidden="true"/><span className="port-label">{relationName}{origin?'':' · 未关联'}</span></button>:null}{inputs.map(port=><button key={port} type="button" data-interaction-id="N-13" data-input-node={node.id} data-port={port} data-connectable={connections.start?String(connections.connectable(node.id,port)):undefined} className={'canvas-port port-input port-'+port} style={{top:offsets[port]}} disabled={!canWrite||node.locked} aria-label={'接收'+names[port]} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();connections.finish(node.id,port);}}><span className="port-dot" aria-hidden="true"/><span className="port-label">{names[port]}输入</span></button>)}{output?<button type="button" data-interaction-id="N-13" className={'canvas-port port-output port-'+output} style={{top:80}} disabled={!canWrite||node.locked} aria-label={'输出'+names[output]} aria-pressed={connections.start?.nodeId===node.id&&connections.start.port===output} onPointerDown={e=>connections.begin(node.id,output,e)} onClick={e=>{e.stopPropagation();if(e.detail===0)connections.begin(node.id,output);}}><span className="port-dot" aria-hidden="true"/><span className="port-label">{names[output]}输出</span></button>:null}{media==='video'&&tailFrameInput(node,'image')&&!graph.edges.some(e=>e.sourceId===node.id&&e.relation==='tail-frame')?<button type="button" data-interaction-id="canvas:tail-output" className="canvas-port port-output port-image" style={{top:120}} disabled={!canWrite||node.locked} aria-label="输出尾帧" aria-pressed={connections.start?.nodeId===node.id&&connections.start.port==='image'} onPointerDown={e=>connections.begin(node.id,'image',e)} onClick={e=>{e.stopPropagation();if(e.detail===0)connections.begin(node.id,'image');}}><span className="port-dot" aria-hidden="true"/><span className="port-label">尾帧输出</span></button>:null}</div>;
}

export function CanvasEdges({graph,connections}:{graph:Graph;connections:CanvasConnections}){
 return <svg className="canvas-edges" aria-label="节点连线">{graph.edges.map(edge=>{
  const source=graph.nodes.find(n=>n.id===edge.sourceId),target=graph.nodes.find(n=>n.id===edge.targetId);if(!source||!target||projectedNode(source,graph).id===projectedNode(target,graph).id)return null;
  const from=edge.relation==='result'?{x:nodeRect(projectedNode(source,graph),graph).right,y:nodeRect(projectedNode(source,graph),graph).top+40}:anchor(source,graph,edge.port,false),to=edge.relation?{x:nodeRect(projectedNode(target,graph),graph).left,y:nodeRect(projectedNode(target,graph),graph).top+40}:anchor(target,graph,edge.port,true),d=curve(from,to),selected=connections.selectedEdgeId===edge.id;
  // A horizontal path has a zero-height SVG geometry box. Keep its accessible
  // focus target measurable while pointer hit testing follows only the wire.
  return <g key={edge.id} role="button" tabIndex={0} data-interaction-id="canvas:select-wire" data-edge-id={edge.id} aria-label={`连线 ${source.title} → ${target.title} · ${edge.relation==='tail-frame'?'尾帧来源':edge.relation==='revision'?'修改来源':edge.relation==='result'?'生成结果':tailFrameInput(source,edge.port)?'尾帧':names[edge.port]}`} aria-pressed={selected} className={'canvas-wire port-'+edge.port+(edge.relation?' lineage-wire':'')+(selected?' selected':'')} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();connections.selectEdge(edge.id);}} onFocus={()=>connections.selectEdge(edge.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();connections.selectEdge(edge.id);}}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();connections.openMenu(edge.id,e.clientX,e.clientY);}}><rect x={Math.min(from.x,to.x)} y={Math.min(from.y,to.y)-9} width={Math.max(1,Math.abs(to.x-from.x))} height={Math.abs(to.y-from.y)+18} fill="none" stroke="none" pointerEvents="none"/><path className="wire-hit" d={d}/><path className="wire-visible" d={d}/>{edge.relation?<text x={(from.x+to.x)/2} y={(from.y+to.y)/2-12} className="lineage-label">{edge.relation==='tail-frame'?'尾帧来源':edge.relation==='result'?'生成结果':'修改来源'}</text>:null}</g>;
 })}</svg>;
}

export function ConnectionPreview({graph,connections}:{graph:Graph;connections:CanvasConnections}){
 const source=graph.nodes.find(n=>n.id===connections.start?.nodeId);if(!source||!connections.start||!connections.cursor)return null;
 const from=anchor(source,graph,connections.start.port,false),to=connections.cursor;
 return <svg className={'canvas-edges connection-preview port-'+connections.start.port} aria-hidden="true"><g data-testid="connection-preview"><rect x={Math.min(from.x,to.x)} y={Math.min(from.y,to.y)-9} width={Math.max(1,Math.abs(to.x-from.x))} height={Math.abs(to.y-from.y)+18} fill="none" stroke="none" pointerEvents="none"/><path d={curve(from,to)}/></g></svg>;
}

export function ConnectionMenu({connections}:{connections:CanvasConnections}){
 const menu=connections.menu;if(!menu)return null;
 return <div role="menu" aria-label="连线操作" className="connection-menu" style={{left:menu.x,top:menu.y}} onPointerDown={e=>e.stopPropagation()}><button type="button" role="menuitem" data-interaction-id="N-15" disabled={!connections.canDisconnect(menu.edgeId)} onClick={()=>void connections.disconnect(menu.edgeId)}>断开连接</button><button type="button" role="menuitem" data-interaction-id="canvas:close-wire-menu" onClick={connections.clearSelection}>关闭菜单</button></div>;
}
