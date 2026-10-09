import {z} from 'zod';
import type {ModelChannel,RestrictedOutbound} from '../security/outbound.js';
import {modelsUrl} from '../security/outbound.js';
export type ModelProbeView={requestId:string;connection:'verified'|'unknown'|'failed';catalogStatus:'ready'|'empty'|'unavailable'|'failed';models:string[];message:string;complete:boolean;failure?:'denied'|'unavailable'};
const modelName=z.string().min(1).max(256).refine(value=>value.trim()===value&&!/[\u0000-\u001f\u007f-\u009f]/.test(value));
const pageSchema=z.object({data:z.array(z.object({id:modelName})).max(20000),next:z.string().max(2048).optional(),has_more:z.boolean().optional()});
const MAX_MODELS=20000,MAX_PAGES=10;
export async function probeModels(outbound:RestrictedOutbound,channel:ModelChannel,base:string,key:string,requestId:string):Promise<ModelProbeView>{
 const result=(connection:ModelProbeView['connection'],catalogStatus:ModelProbeView['catalogStatus'],models:string[],message:string,complete=true,failure:ModelProbeView['failure']=undefined)=>({requestId,connection,catalogStatus,models,message,complete,...(failure?{failure}:{})});
 const tainted=(models:string[])=>models.some(item=>item.includes(key));
 try{
  const firstUrl=modelsUrl(base);
  const first=await outbound.models(channel,base,key);
  if([404,405,501].includes(first.status))return result('unknown','unavailable',[],'Model catalog unavailable; enter a model manually');
  if(first.status===401||first.status===403)return result('failed','failed',[],'Upstream denied the credentials (permission denied)',true,'denied');
  if(first.status<200||first.status>=300)return result('failed','failed',[],'Connection check failed',true,'unavailable');
  let page:{data:{id:string}[];next?:string;has_more?:boolean};
  try{page=pageSchema.parse(JSON.parse(first.body.toString('utf8')));}catch{return result('unknown','failed',[],'Invalid model catalog response');}
  const models=[...new Set(page.data.map(item=>item.id))];
  // Never reflect a temporary credential supplied by a hostile catalog response.
  if(tainted(models))return result('unknown','failed',[],'Invalid model catalog response');
  let complete=true;
  const seen=new Set<string>();
  let currentUrl=firstUrl,next=page.next,hasMore=page.has_more,pages=1;
  while(next&&pages<MAX_PAGES){
   if(seen.has(next)){complete=false;break;}
   seen.add(next);pages++;
   let fetched:{response:{status:number;body:Buffer};url:string}|null;
   try{fetched=await outbound.modelsNext(currentUrl,next,key);}catch{complete=false;break;}
   // 跨域下一页不跟随、不发送密钥，直接记为未完整获取。
   if(!fetched){complete=false;break;}
   currentUrl=fetched.url;
   if(fetched.response.status<200||fetched.response.status>=300){complete=false;break;}
   let parsed:{data:{id:string}[];next?:string;has_more?:boolean};
   try{parsed=pageSchema.parse(JSON.parse(fetched.response.body.toString('utf8')));}catch{complete=false;break;}
   for(const item of parsed.data){if(!models.includes(item.id))models.push(item.id);}
   if(tainted(models))return result('unknown','failed',[],'Invalid model catalog response');
   if(models.length>=MAX_MODELS){models.length=MAX_MODELS;complete=false;break;}
   next=parsed.next;hasMore=parsed.has_more;
  }
  if(next||hasMore)complete=false;
  if(!models.length)return result('verified','empty',models,'Model catalog is empty',complete);
  return result('verified','ready',models,complete?'Model catalog received':'Model catalog partly received',complete);
 }catch{return result('failed','failed',[],'Connection check failed',true,'unavailable');}
}
