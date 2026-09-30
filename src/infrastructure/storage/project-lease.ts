import {withDatabase,transact,requestResult,type StudioDb} from './database';
import {validateProject} from '../../domain/validation';
export const leaseDurationMs=30000;
export const foregroundRenewalMs=5000;
export type ProjectLeaseRecord={id:string;projectId:string;tabId:string;epoch:number;expiresAt:number;lastRenewedAt:number};
export type ProjectLeaseToken={projectId:string;tabId:string;epoch:number};
export type LeaseResult={ok:true;epoch:number;expiresAt:number;revision:number;token:ProjectLeaseToken}|{ok:false;errorCode:string};
export async function acquireProjectLease(projectId:string,tabId:string,now:number,options:{db?:StudioDb;force?:boolean}={}):Promise<LeaseResult>{
 if(!projectId||!tabId||!Number.isSafeInteger(now)||now<0)return {ok:false,errorCode:'lease_input_invalid'};
 return withDatabase(options.db,db=>transact(db,['projects','leases'],'readwrite',async tx=>{
  const stored:unknown=await requestResult(tx.objectStore('projects').get(projectId));
  const checked=stored===undefined?undefined:validateProject(stored);
  if(checked&&!checked.ok)return {ok:false,errorCode:'stored_project_not_writable'};
  const revision=checked?.ok?checked.value.revision:0;
  const id=`project:${projectId}`,prior:ProjectLeaseRecord|undefined=await requestResult(tx.objectStore('leases').get(id));
  if(prior&&(!Number.isSafeInteger(prior.epoch)||prior.epoch<1||!Number.isFinite(prior.expiresAt)))return {ok:false,errorCode:'lease_record_invalid'};
  if(prior&&!options.force&&prior.expiresAt>now&&prior.tabId!==tabId)return {ok:false,errorCode:'project_writer_busy'};
  const epoch=prior&&!options.force&&prior.expiresAt>now&&prior.tabId===tabId?prior.epoch:(prior?.epoch??0)+1;
  if(!Number.isSafeInteger(epoch))return {ok:false,errorCode:'lease_epoch_exhausted'};
  const record:ProjectLeaseRecord={id,projectId,tabId,epoch,expiresAt:now+leaseDurationMs,lastRenewedAt:now};
  tx.objectStore('leases').put(record);
  return {ok:true,epoch,expiresAt:record.expiresAt,revision,token:{projectId,tabId,epoch}};
 }));
}
export async function assertProjectWriter(tx:IDBTransaction,projectId:string,token:ProjectLeaseToken|undefined,now=Date.now()):Promise<ProjectLeaseRecord>{
 if(!Number.isSafeInteger(now)||now<0)throw new Error('lease_time_invalid');
 if(!token||token.projectId!==projectId)throw new Error('project_writer_required');
 const record:ProjectLeaseRecord|undefined=await requestResult(tx.objectStore('leases').get(`project:${projectId}`));
 if(!record||!Number.isSafeInteger(record.expiresAt)||!Number.isSafeInteger(record.lastRenewedAt)||record.epoch!==token.epoch||record.tabId!==token.tabId)throw new Error('lease_epoch_invalid');
 if(record.expiresAt<=now||now<record.lastRenewedAt)throw new Error('lease_expired_writer_denied');
 return record;
}
export async function renewProjectLease(token:ProjectLeaseToken,now:number,options:{db?:StudioDb}={}):Promise<LeaseResult>{
 try{return await withDatabase(options.db,db=>transact(db,['leases','projects'],'readwrite',async tx=>{
  const record=await assertProjectWriter(tx,token.projectId,token,now);
  const stored:unknown=await requestResult(tx.objectStore('projects').get(token.projectId));
  const check=stored===undefined?undefined:validateProject(stored);
  if(check&&!check.ok)throw new Error('stored_project_not_writable');
  record.expiresAt=now+leaseDurationMs;record.lastRenewedAt=now;tx.objectStore('leases').put(record);
  return {ok:true,epoch:record.epoch,expiresAt:record.expiresAt,revision:check?.ok?check.value.revision:0,token};
 }));}catch(error){return {ok:false,errorCode:error instanceof Error?error.message:'lease_renew_failed'};}
}
export async function takeoverProjectLease(projectId:string,tabId:string,now:number,options:{db?:StudioDb}={}):Promise<LeaseResult>{return acquireProjectLease(projectId,tabId,now,{...options,force:true});}
export async function releaseProjectLease(token:ProjectLeaseToken,db?:StudioDb){
 await withDatabase(db,c=>transact(c,['leases'],'readwrite',async tx=>{
  const row:ProjectLeaseRecord|undefined=await requestResult(tx.objectStore('leases').get(`project:${token.projectId}`));
  if(row&&row.epoch===token.epoch&&row.tabId===token.tabId){row.expiresAt=0;row.epoch++;tx.objectStore('leases').put(row);}
 }));
}
export function startProjectHeartbeat(token:ProjectLeaseToken,onLost:(code:string)=>void,options:{db?:StudioDb;isForeground?:()=>boolean}={}){
 let stopped=false,busy=false;
 const timer=setInterval(async()=>{
  if(stopped||busy||!(options.isForeground?.()??(typeof document==='undefined'||document.visibilityState==='visible')))return;
  busy=true;
  try{const result=await renewProjectLease(token,Date.now(),options);if(!result.ok){stopped=true;clearInterval(timer);onLost(result.errorCode);}}
  catch{stopped=true;clearInterval(timer);onLost('lease_renew_failed');}
  finally{busy=false;}
 },foregroundRenewalMs);
 return {stop(){stopped=true;clearInterval(timer);}};
}
