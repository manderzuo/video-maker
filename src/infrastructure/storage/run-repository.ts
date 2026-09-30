import type {Run} from '../../domain/run';
import {runSchema} from '../../domain/run';
import {promptRunSchema,type PromptRun} from '../../domain/prompt';
import {transact,requestResult,withDatabase,type StudioDb} from './database';
export async function validateFrozenBody(run:Run){
 runSchema.parse(run);
 if(run.finalBody!==undefined){
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(run.finalBody)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==run.finalBodyHash)throw new Error('final_body_hash_mismatch');
 }
}
export function assertRunIdentity(previous:Run,run:Run){
 for(const key of ['projectId','nodeId','graphRevision','connectionId','authBindingId','originSnapshot','idempotencyKey','createdAt','inputSnapshot'] as const)if(JSON.stringify(previous[key])!==JSON.stringify(run[key]))throw new Error('run_identity_frozen');
 if(previous.finalBody!==undefined&&(previous.finalBody!==run.finalBody||previous.finalBodyHash!==run.finalBodyHash))throw new Error('final_body_frozen');
}
export async function putRunInTransaction(tx:IDBTransaction,run:Run){
 const previous:Run|undefined=await requestResult(tx.objectStore('runs').get(run.id));
 if(previous)assertRunIdentity(previous,run);
 tx.objectStore('runs').put(run);
}
export async function saveRun(run:Run,options:{db?:StudioDb}={}):Promise<void>{
 const snapshot=structuredClone(run);
 await validateFrozenBody(snapshot);
 await withDatabase(options.db,db=>transact(db,['projects','runs','diagnostics'],'readwrite',async tx=>{
  if(!await requestResult(tx.objectStore('projects').get(snapshot.projectId)))throw new Error('project_missing');
  await putRunInTransaction(tx,snapshot);
  tx.objectStore('diagnostics').put({id:crypto.randomUUID(),kind:'run_saved',projectId:snapshot.projectId,runId:snapshot.id,at:Date.now()});
 }));
}
export async function readRun(id:string,db?:StudioDb):Promise<Run|undefined>{return withDatabase(db,c=>transact(c,['runs'],'readonly',async tx=>{const value:unknown=await requestResult(tx.objectStore('runs').get(id));return value===undefined?undefined:runSchema.parse(value);}));}
export async function savePromptRun(run:PromptRun,db?:StudioDb):Promise<void>{
 const value=promptRunSchema.parse(run);
 await withDatabase(db,c=>transact(c,['promptRuns','diagnostics'],'readwrite',async tx=>{
  const prior:PromptRun|undefined=await requestResult(tx.objectStore('promptRuns').get(value.id));
  if(prior)for(const key of ['draftId','draftRevision','connectionId','authBindingId','originSnapshot','idempotencyKey','requestSnapshot','textModelId','startedAt'] as const)if(JSON.stringify(prior[key])!==JSON.stringify(value[key]))throw new Error('prompt_run_identity_frozen');
  tx.objectStore('promptRuns').put(value);tx.objectStore('diagnostics').put({id:crypto.randomUUID(),kind:'prompt_run_saved',runId:value.id,at:Date.now()});
 }));
}
