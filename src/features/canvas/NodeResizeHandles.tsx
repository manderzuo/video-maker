import {useEffect,useRef,type PointerEvent,type KeyboardEvent} from 'react';
import type {CanvasNodeSize} from '../../domain/graph';
type Direction='width'|'height'|'both';
type Drag={pointerId:number;startX:number;startY:number;scale:number;initial:CanvasNodeSize;next:CanvasNodeSize;direction:Direction};
const clamp=(value:number)=>Math.max(160,Math.min(2400,Math.round(value)));
export function NodeResizeHandles({title,size,disabled,onStart,onPreview,onFinish,onCancel}:{title:string;size:CanvasNodeSize;disabled:boolean;onStart:()=>number|undefined;onPreview:(size:CanvasNodeSize)=>void;onFinish:(size:CanvasNodeSize)=>void;onCancel:()=>void}){
 const drag=useRef<Drag|undefined>(undefined),cancelRef=useRef(onCancel);cancelRef.current=onCancel;
 useEffect(()=>()=>{if(drag.current){drag.current=undefined;cancelRef.current();}},[]);
 function cancel(event?:PointerEvent<HTMLButtonElement>|KeyboardEvent<HTMLButtonElement>){const current=drag.current;if(!current)return;drag.current=undefined;event?.stopPropagation();if(event?.currentTarget.hasPointerCapture(current.pointerId))event.currentTarget.releasePointerCapture(current.pointerId);onCancel();}
 function down(event:PointerEvent<HTMLButtonElement>,direction:Direction){
  event.stopPropagation();if(disabled||event.button!==0)return;event.preventDefault();const scale=onStart();if(scale===undefined)return;
  drag.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,scale,initial:size,next:size,direction};event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.focus({preventScroll:true});
 }
 function move(event:PointerEvent<HTMLButtonElement>){
  const current=drag.current;if(!current||current.pointerId!==event.pointerId)return;event.stopPropagation();
  current.next={width:current.direction==='height'?current.initial.width:clamp(current.initial.width+(event.clientX-current.startX)/current.scale),height:current.direction==='width'?current.initial.height:clamp(current.initial.height+(event.clientY-current.startY)/current.scale)};onPreview(current.next);
 }
 function up(event:PointerEvent<HTMLButtonElement>){
  const current=drag.current;if(!current||current.pointerId!==event.pointerId)return;event.stopPropagation();drag.current=undefined;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);onFinish(current.next);
 }
 function keyboard(event:KeyboardEvent<HTMLButtonElement>,direction:Direction){
  if(event.key==='Escape'&&drag.current){event.preventDefault();cancel(event);return;}
  if(disabled||drag.current||event.ctrlKey||event.metaKey||event.altKey)return;
  const dx=direction!=='height'?(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0):0,dy=direction!=='width'?(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0):0;
  if(!dx&&!dy)return;event.preventDefault();event.stopPropagation();const step=event.shiftKey?50:10,next={width:clamp(size.width+dx*step),height:clamp(size.height+dy*step)};if(onStart()!==undefined)onFinish(next);
 }
 return <>{(['width','height','both'] as const).map(direction=><button key={direction} type="button" disabled={disabled} data-interaction-id="canvas:resize" className={'canvas-resize-handle resize-'+direction} aria-label={(direction==='width'?'调整节点宽度 ':direction==='height'?'调整节点高度 ':'调整节点大小 ')+title} title={disabled?'请先保存当前编辑，再调整节点尺寸':'拖动调整尺寸；方向键微调，Shift 加快，Esc 取消'} onPointerDown={event=>down(event,direction)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={event=>keyboard(event,direction)}><span aria-hidden="true"/></button>)}</>;
}
