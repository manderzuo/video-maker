import {z} from 'zod';
import type {ModelChannel,RestrictedOutbound} from '../security/outbound.js';
export type ModelProbeView={requestId:string;connection:'verified'|'unknown'|'failed';catalogStatus:'ready'|'empty'|'unavailable'|'failed';models:string[];message:string};
const modelName=z.string().min(1).max(256).refine(value=>value.trim()===value&&!/[\u0000-\u001f\u007f-\u009f]/.test(value));
const catalog=z.object({data:z.array(z.object({id:modelName})).max(20000)});
export async function probeModels(outbound:RestrictedOutbound,channel:ModelChannel,base:string,key:string,requestId:string):Promise<ModelProbeView>{
 const result=(connection:ModelProbeView['connection'],catalogStatus:ModelProbeView['catalogStatus'],models:string[],message:string)=>({requestId,connection,catalogStatus,models,message});
 try{
  const response=await outbound.models(channel,base,key);
  if([404,405,501].includes(response.status))return result('unknown','unavailable',[],'Model catalog unavailable; enter a model manually');
  if(response.status<200||response.status>=300)return result('failed','failed',[],'Connection check failed');
  try{
   const parsed=catalog.parse(JSON.parse(response.body.toString('utf8')));
   // Never reflect a temporary credential supplied by a hostile catalog response.
   if(parsed.data.some(item=>item.id.includes(key)))return result('unknown','failed',[],'Invalid model catalog response');
   const models=[...new Set(parsed.data.map(item=>item.id))];return result('verified',models.length?'ready':'empty',models,models.length?'Model catalog received':'Model catalog is empty');
  }catch{return result('unknown','failed',[],'Invalid model catalog response');}
 }catch{return result('failed','failed',[],'Connection check failed');}
}
