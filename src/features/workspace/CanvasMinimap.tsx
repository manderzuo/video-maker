import {useLayoutEffect,useRef,useState,type PointerEvent,type RefObject} from 'react';
import type {Graph,Viewport} from '../../domain/graph';
import {nodeSize,visibleNodes,worldPosition} from '../canvas/geometry';

export function CanvasMinimap({graph,stageRef,disabled,onViewport,onGesture}:{graph:Graph;stageRef:RefObject<HTMLDivElement|null>;disabled:boolean;onViewport:(view:Viewport)=>void;onGesture:(active:boolean)=>void}){
 const [size,setSize]=useState({width:0,height:0}),[dragging,setDragging]=useState(false);
 const gesture=useRef<{pointerId:number;x:number;y:number;view:Viewport;matrix:DOMMatrix;svg:SVGSVGElement}|null>(null);
 const gestureCallback=useRef(onGesture);gestureCallback.current=onGesture;
 useLayoutEffect(()=>{
  const stage=stageRef.current;if(!stage)return;
  const measure=()=>setSize({width:stage.clientWidth,height:stage.clientHeight});measure();
  const observer=new ResizeObserver(measure);observer.observe(stage);
  return()=>{observer.disconnect();if(gesture.current){gesture.current=null;gestureCallback.current(false);}};
 },[stageRef]);
 const nodes=visibleNodes(graph).map(node=>({id:node.id,...worldPosition(node,graph),...nodeSize(node,graph)}));
 const left=nodes.length?Math.min(...nodes.map(n=>n.x))-80:0,top=nodes.length?Math.min(...nodes.map(n=>n.y))-80:0;
 const right=nodes.length?Math.max(...nodes.map(n=>n.x+n.width))+80:2400,bottom=nodes.length?Math.max(...nodes.map(n=>n.y+n.height))+80:1600;
 const view=graph.viewport,frame={x:-view.x/view.scale,y:-view.y/view.scale,width:size.width/view.scale,height:size.height/view.scale};
 function start(event:PointerEvent<SVGSVGElement>){
  event.stopPropagation();event.preventDefault();if(disabled||event.button!==0)return;
  const svg=event.currentTarget,matrix=svg.getScreenCTM()?.inverse();if(!matrix)return;
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix);
  const inside=point.x>=frame.x&&point.x<=frame.x+frame.width&&point.y>=frame.y&&point.y<=frame.y+frame.height;
  const initial=inside?view:{...view,x:size.width/2-point.x*view.scale,y:size.height/2-point.y*view.scale};
  gesture.current={pointerId:event.pointerId,x:point.x,y:point.y,view:initial,matrix,svg};
  onGesture(true);setDragging(true);svg.setPointerCapture(event.pointerId);if(!inside)onViewport(initial);
 }
 function move(event:PointerEvent<SVGSVGElement>){
  event.stopPropagation();const drag=gesture.current;if(!drag||drag.pointerId!==event.pointerId)return;event.preventDefault();
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(drag.matrix);
  onViewport({...drag.view,x:drag.view.x-(point.x-drag.x)*drag.view.scale,y:drag.view.y-(point.y-drag.y)*drag.view.scale});
 }
 function finish(event:PointerEvent<SVGSVGElement>){
  event.stopPropagation();const drag=gesture.current;if(!drag||drag.pointerId!==event.pointerId)return;
  gesture.current=null;setDragging(false);if(drag.svg.hasPointerCapture(event.pointerId))drag.svg.releasePointerCapture(event.pointerId);onGesture(false);
 }
 return <svg className="canvas-minimap" aria-label="画布小地图" data-dragging={dragging} viewBox={`${left} ${top} ${right-left} ${bottom-top}`} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onWheel={event=>event.stopPropagation()} onContextMenu={event=>{event.preventDefault();event.stopPropagation();}}>
  {nodes.map(node=><rect key={node.id} data-minimap-node={node.id} x={node.x} y={node.y} width={node.width} height={node.height}/>)}
  <rect className="minimap-viewport" data-minimap-viewport="" {...frame}/>
 </svg>;
}
