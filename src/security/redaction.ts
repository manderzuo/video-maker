import {sanitizeKnownSecrets} from './credential-session';
// Diagnostic exports intentionally exclude body, prompt, inputSnapshot, raw responses and credentials.
const allowed=new Set(['id','kind','projectId','nodeId','runId','draftId','taskId','requestId','coreRequestId','connectionId','authBindingId','originSnapshot','errorCode','message','httpStatus','at','createdAt','updatedAt','revision','epoch','executionState','queryState','deliveryState','billingState','status','count','succeeded','failed','skipped','durationMs','contractVersion','schemaVersion','source','url','warnings','issues','code','path']);
function cleanString(value:string){
 const clean=sanitizeKnownSecrets(value);
 return clean.replace(/https?:\/\/[^\s<>"']+/gi,value=>{try{const url=new URL(value);url.username='';url.password='';url.search='';url.hash='';return url.href;}catch{return '[已脱敏链接]';}});
}
export function redact(input:unknown):unknown{
 const seen=new WeakSet<object>();
 function visit(value:unknown,depth:number):unknown{
  if(depth>16)return '[已省略]';
  if(typeof value==='string')return cleanString(value);
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(!value||typeof value!=='object')return null;
  if(seen.has(value))return '[循环已省略]';seen.add(value);
  if(Array.isArray(value))return value.map(item=>visit(item,depth+1));
  const result:Record<string,unknown>={};
  for(const key of allowed){
   const descriptor=Object.getOwnPropertyDescriptor(value,key);
   // Do not run getters from untrusted error objects.
   if(descriptor&&'value'in descriptor)result[key]=visit(descriptor.value,depth+1);
  }
  return result;
 }
 return visit(input,0);
}
