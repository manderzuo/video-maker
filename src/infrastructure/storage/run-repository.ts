import type {Run} from '../../domain/run';
import {runSchema} from '../../domain/run';
import {transact,requestResult,withDatabase,type StudioDb} from './database';
import {assertProjectWriter,type ProjectLeaseToken} from './project-lease';
import {assertRunWriter,type RunWriteToken,type RunLeaseRecord} from './run-lease';
export type RunSaveOptions={db?:StudioDb;lease?:ProjectLeaseToken;expectedProjectRevision?:number;runToken?:RunWriteToken};
export async function validateFrozenBody(run:Run){
 runSchema.parse(run);
 if(run.finalBody!==undefined){
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(run.finalBody)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==run.finalBodyHash)throw new Error('final_body_hash_mismatch');
 }
}
export function assertRunIdentity(previous:Run,run:Run){
 if(previous.workContext&&(previous.workContext.workId!==run.workContext?.workId||previous.workContext.baseVersionId&&previous.workContext.baseVersionId!==run.workContext?.baseVersionId))throw Error('video_work_identity_frozen');
 for(const key of ['projectId','nodeId','graphRevision','connectionId','authBindingId','originSnapshot','idempotencyKey','createdAt','inputSnapshot'] as const)if(JSON.stringify(previous[key])!==JSON.stringify(run[key]))throw new Error('run_identity_frozen');
 if(previous.finalBody!==undefined&&(previous.finalBody!==run.finalBody||previous.finalBodyHash!==run.finalBodyHash))throw new Error('final_body_frozen');
}
export async function putRunInTransaction(tx:IDBTransaction,run:Run,options:RunSaveOptions){
 let row:RunLeaseRecord|undefined;
 if(options.runToken)row=await assertRunWriter(tx,run.id,options.runToken);
 else{
  await assertProjectWriter(tx,run.projectId,options.lease);
  const project:{revision:number}|undefined=await requestResult(tx.objectStore('projects').get(run.projectId));
  if(options.expectedProjectRevision===undefined||project?.revision!==options.expectedProjectRevision)throw new Error('project_revision_conflict');
  const dispatch:RunLeaseRecord|undefined=await requestResult(tx.objectStore('leases').get(`dispatch:${run.id}`));
  if(dispatch)throw new Error('run_writer_required');
 }
 const previous:Run|undefined=await requestResult(tx.objectStore('runs').get(run.id));
 if(previous)assertRunIdentity(previous,run);
 tx.objectStore('runs').put(run);
 if(row){row.revision++;tx.objectStore('leases').put(row);}
}
export async function saveRun(run:Run,options:RunSaveOptions={}):Promise<void>{
 const snapshot=structuredClone(run);
 const writerOptions={...options,lease:options.lease?{...options.lease}:undefined,runToken:options.runToken?{...options.runToken}:undefined};
 await validateFrozenBody(snapshot);
 await withDatabase(options.db,db=>transact(db,['projects','runs','diagnostics','leases'],'readwrite',async tx=>{
  if(!await requestResult(tx.objectStore('projects').get(snapshot.projectId)))throw new Error('project_missing');
  await putRunInTransaction(tx,snapshot,writerOptions);
  tx.objectStore('diagnostics').put({id:crypto.randomUUID(),kind:'run_saved',projectId:snapshot.projectId,runId:snapshot.id,at:Date.now()});
 }));
}
export async function readRun(id:string,db?:StudioDb):Promise<Run|undefined>{return withDatabase(db,c=>transact(c,['runs'],'readonly',async tx=>{const value:unknown=await requestResult(tx.objectStore('runs').get(id));return value===undefined?undefined:runSchema.parse(value);}));}
