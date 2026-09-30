import {z} from 'zod';
export const schemaVersion=1;
export const id=z.string().min(1);
export const timestamp=z.number().int().nonnegative();
export const revision=z.number().int().nonnegative();
export const byteLength=(text:string)=>new TextEncoder().encode(text).byteLength;
export const boundedText=(min:number,max:number)=>z.string().refine(text=>[...text].length>=min&&[...text].length<=max,`须为${min}–${max}字符`);
export const localText=z.string().refine(text=>byteLength(text)<=65536,'本地文本超过64KiB');
export const tags=z.array(boundedText(1,24)).max(10);
export const videoSpecSchema=z.strictObject({modelId:id,durationSeconds:z.number().positive().optional(),ratio:id.optional(),resolution:id.optional()});
export type VideoSpec=z.infer<typeof videoSpecSchema>;
const secretFields=new Set(['key','apikey','api_key','authorization','cookie','token','secret','credentials','credential','password','accesstoken','access_token']);
export function isSafeSnapshot(input:unknown):boolean{
 const seen=new Set<object>();
 function visit(value:unknown,depth:number):boolean{
  if(depth>32)return false;
  if(value===null||typeof value==='boolean'||typeof value==='string')return true;
  if(typeof value==='number')return Number.isFinite(value);
  if(!value||typeof value!=='object'||seen.has(value))return false;
  seen.add(value);
  if(Array.isArray(value))return value.every(v=>visit(v,depth+1));
  if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return false;
  return Object.entries(value).every(([key,v])=>!secretFields.has(key.toLowerCase())&&!['__proto__','constructor','prototype'].includes(key)&&visit(v,depth+1));
 }
 return visit(input,0);
}
export const snapshotSchema=z.unknown().refine(isSafeSnapshot,'快照不是无秘密的有限JSON数据');
export const jsonSnapshotText=z.string().refine(text=>{try{return isSafeSnapshot(JSON.parse(text));}catch{return false;}},'请求快照必须是无秘密的有效JSON');
export const bindingSchema=z.strictObject({connectionId:id,authBindingId:id,originSnapshot:z.url()});
export type RunBinding=z.infer<typeof bindingSchema>;
export type ValidationIssue={code:string;path:string;message:string};
export type ValidationResult<T>={ok:true;value:T}|{ok:false;issues:ValidationIssue[]};
export type SaveResult={status:'saved';revision:number}|{status:'conflict';currentRevision:number}|{status:'failed';code:string};
