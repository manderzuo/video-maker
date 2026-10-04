import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {BrowserContext,TestInfo} from '@playwright/test';
type Observation={id:string;kind:string;tag:string;disabled:boolean;path:string;trusted:boolean};
export async function captureUiControlEvidence(context:BrowserContext,testInfo:TestInfo){
 const directory=process.env.STUDIO_UI_CONTROL_EVIDENCE;if(!directory)return()=>undefined;
 const observations:Observation[]=[];let overflow=false;
 await context.exposeBinding('__studioQaControlEvidence',(_source,value:unknown)=>{
  if(!value||typeof value!=='object')return;const row=value as Observation;
  if(typeof row.id!=='string'||row.id.length>200||!['visible','click','change','input'].includes(row.kind)||typeof row.path!=='string'||!row.path.startsWith('/')||row.path.length>300)return;
  if(observations.length>=4000){overflow=true;return;}
  observations.push({id:row.id,kind:row.kind,tag:row.tag,disabled:row.disabled===true,path:row.path,trusted:row.trusted===true});
 });
 await context.addInitScript(()=>{
  const observed=new Set<string>();let scheduled=false;
  const emit=(element:Element,kind:string,trusted:boolean)=>{
   const id=element.getAttribute('data-interaction-id');if(!id)return;
   const disabled=element.matches(':disabled')||element.getAttribute('aria-disabled')==='true';
   const key=location.pathname+'|'+id+'|'+disabled;
   if(kind==='visible'){if(observed.has(key))return;observed.add(key);}
   const api=window as unknown as {__studioQaControlEvidence:(row:unknown)=>Promise<void>};
   void api.__studioQaControlEvidence({id,kind,tag:element.tagName.toLowerCase(),disabled,path:location.pathname,trusted}).catch(()=>undefined);
  };
  const inspect=()=>{scheduled=false;for(const element of document.querySelectorAll('[data-interaction-id]')){
   const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
   if(rect.width>0&&rect.height>0&&rect.bottom>0&&rect.right>0&&rect.top<innerHeight&&rect.left<innerWidth&&style.visibility!=='hidden'&&style.display!=='none'&&!element.closest('dialog:not([open])'))emit(element,'visible',false);
  }};
  const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(inspect);}};
  for(const kind of ['click','change','input'])document.addEventListener(kind,event=>{
   if(!event.isTrusted)return;const element=event.target instanceof Element?event.target.closest('[data-interaction-id]'):null;if(element)emit(element,kind,true);schedule();
  },true);
  document.addEventListener('DOMContentLoaded',()=>{new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','aria-disabled','open','hidden']});schedule();});
 });
 return()=>{
  const name=path.relative(process.cwd(),testInfo.file).replaceAll('\\','/')+'::'+testInfo.title;
  fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,createHash('sha256').update(name).digest('hex').slice(0,24)+'.json'),JSON.stringify({test:name,status:testInfo.status,overflow,method:'Browser DOM observation plus trusted input events. No values, credentials, text, query strings or request bodies collected. Visibility alone is not a click or acceptance.',observations},null,2));
 };
}
