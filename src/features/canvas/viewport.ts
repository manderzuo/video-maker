import type {Viewport} from '../../domain/graph';
import type {Rect} from './geometry';
export type ViewAction={type:'pan';dx:number;dy:number}|{type:'zoom';scale:number;width:number;height:number}|{type:'fit'|'locate';bounds:Rect|null;width:number;height:number};
export function updateViewport(view:Viewport,action:ViewAction):Viewport{
 if(action.type==='pan')return Number.isFinite(action.dx)&&Number.isFinite(action.dy)?{...view,x:view.x+action.dx,y:view.y+action.dy}:view;
 if(!Number.isFinite(action.width)||!Number.isFinite(action.height)||action.width<=0||action.height<=0)return view;
 if(action.type==='zoom'){
  if(!Number.isFinite(action.scale)||action.scale<.25||action.scale>2)return view;
  const ratio=action.scale/view.scale;return {scale:action.scale,x:action.width/2-(action.width/2-view.x)*ratio,y:action.height/2-(action.height/2-view.y)*ratio};
 }
 if(!action.bounds)return {x:0,y:0,scale:1};
 const b=action.bounds,w=b.right-b.left,h=b.bottom-b.top;if(![w,h,b.left,b.top].every(Number.isFinite)||w<=0||h<=0)return view;
 const scale=action.type==='locate'?view.scale:Math.min(2,Math.max(.25,Math.min((action.width-96)/w,(action.height-96)/h)));
 return {scale,x:(action.width-w*scale)/2-b.left*scale,y:(action.height-h*scale)/2-b.top*scale};
}
