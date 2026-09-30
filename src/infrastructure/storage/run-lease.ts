import {withDatabase,transact,requestResult,storageErrorCode,type StudioDb} from './database';
import {runSchema,type Run} from '../../domain/run';
import {leaseDurationMs} from './project-lease';
export type RunLeaseRecord={id:string;projectId:string;runId:string;tabId:string;epoch:number;revision:number;expiresAt:number;dispatchCommitted:boolean};
export type RunWriteToken={runId:string;tabId:string;epoch:number;revision:number};
export type ClaimResult={ok:true;epoch:number;expiresAt:number;token:RunWriteToken}|{ok:false;errorCode:string};
function result(row:RunLeaseRecord):ClaimResult{return {ok:true,epoch:row.epoch,expiresAt:row.expiresAt,token:{runId:row.runId,tabId:row.tabId,epoch:row.epoch,revision:row.revision}};}
export async function claimRunDispatch(runId:string,tabId:string,options:{db?:StudioDb;now?:number}={}):Promise<ClaimResult>{
 const now=options.now??Date.now();
 if(!runId||!tabId||!Number.isSafeInteger(now)||now<0)return {ok:false,errorCode:'run_claim_input_invalid'};
 return withDatabase(options.db,db=>transact(db,['runs','leases'],'readwrite',async tx=>{
  const raw:unknown=await requestResult(tx.objectStore('runs').get(runId)),parsed=runSchema.safeParse(raw);
  if(!parsed.success||parsed.data.executionState!=='persisted'||!parsed.data.finalBody||!parsed.data.finalBodyHash)return {ok:false,errorCode:'run_not_prepared'};
  const prior:RunLeaseRecord|undefined=await requestResult(tx.objectStore('leases').get(`dispatch:${runId}`));
  if(prior?.dispatchCommitted)return {ok:false,errorCode:'dispatch_already_committed'};
  if(prior&&prior.expiresAt>now)return {ok:false,errorCode:'run_dispatch_busy'};
  const row:RunLeaseRecord={id:`dispatch:${runId}`,projectId:parsed.data.projectId,runId,tabId,epoch:(prior?.epoch??0)+1,revision:prior?.revision??0,expiresAt:now+leaseDurationMs,dispatchCommitted:false};
  tx.objectStore('leases').put(row);return result(row);
 }));
}
export async function assertRunWriter(tx:IDBTransaction,runId:string,token:RunWriteToken|undefined,now=Date.now()):Promise<RunLeaseRecord>{
 if(!Number.isSafeInteger(now)||now<0)throw new Error('run_time_invalid');
 if(!token||token.runId!==runId)throw new Error('run_writer_required');
 const row:RunLeaseRecord|undefined=await requestResult(tx.objectStore('leases').get(`dispatch:${runId}`));
 if(!row||row.epoch!==token.epoch||row.tabId!==token.tabId)throw new Error('run_epoch_invalid');
 if(row.expiresAt<=now)throw new Error('run_lease_expired');
 if(row.revision!==token.revision)throw new Error('run_writer_conflict');
 return row;
}
// Commit intent before any future network call; this function itself sends nothing.
export async function markRunDispatched(token:RunWriteToken,options:{db?:StudioDb;now?:number;beforeDispatch?:(tx:IDBTransaction)=>Promise<void>}={}):Promise<ClaimResult>{
 try{return await withDatabase(options.db,db=>transact(db,['runs','leases','diagnostics','projects','graphs','assets','blobs','receipts'],'readwrite',async tx=>{
  const row=await assertRunWriter(tx,token.runId,token,options.now??Date.now());
  if(row.dispatchCommitted)throw new Error('dispatch_already_committed');
  const run:Run=runSchema.parse(await requestResult(tx.objectStore('runs').get(token.runId)));
  if(run.executionState!=='persisted')throw new Error('run_not_prepared');
  await options.beforeDispatch?.(tx);
  row.dispatchCommitted=true;row.revision++;tx.objectStore('leases').put(row);
  tx.objectStore('runs').put({...run,executionState:'submitting',updatedAt:options.now??Date.now()});
  tx.objectStore('diagnostics').put({id:crypto.randomUUID(),projectId:run.projectId,runId:run.id,kind:'dispatch_intent_committed',at:options.now??Date.now()});
  return result(row);
 }));}catch(error){return {ok:false,errorCode:storageErrorCode(error)};}
}
export async function acquireRunTrackingLease(runId:string,tabId:string,now:number,db?:StudioDb):Promise<ClaimResult>{
 if(!runId||!tabId||!Number.isSafeInteger(now)||now<0)return {ok:false,errorCode:'run_claim_input_invalid'};
 return withDatabase(db,c=>transact(c,['leases'],'readwrite',async tx=>{
  const row:RunLeaseRecord|undefined=await requestResult(tx.objectStore('leases').get(`dispatch:${runId}`));
  if(!row?.dispatchCommitted)return {ok:false,errorCode:'dispatch_not_committed'};
  if(row.tabId!==tabId&&row.expiresAt>now)return {ok:false,errorCode:'run_writer_busy'};
  if(row.expiresAt<=now||row.tabId!==tabId)row.epoch++;
  row.tabId=tabId;row.expiresAt=now+leaseDurationMs;tx.objectStore('leases').put(row);return result(row);
 }));
}
