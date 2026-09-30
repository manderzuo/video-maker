import {transact,requestResult,type StudioDb} from '../../infrastructure/storage/database';
import {assertProjectWriter,type ProjectLeaseToken} from '../../infrastructure/storage/project-lease';
import type {Run} from '../../domain/run';
import {assertRunIdentity} from '../../infrastructure/storage/run-repository';
export type PreparationToken={id:string;owner:string;projectId:string;runId:string};
type PreparationRecord=PreparationToken&{expiresAt:number};
export async function claimPreparation(db:StudioDb,run:Run,lease?:ProjectLeaseToken):Promise<PreparationToken>{
 return transact(db,['projects','runs','leases'],'readwrite',async tx=>{
  await assertProjectWriter(tx,run.projectId,lease);
  const project:{revision:number;trashedAt:number|null;archived:boolean}|undefined=await requestResult(tx.objectStore('projects').get(run.projectId));
  if(project?.revision!==run.graphRevision)throw Error('project_revision_conflict');
  if(project.trashedAt!=null||project.archived)throw Error('project_not_runnable');
  const current:Run|undefined=await requestResult(tx.objectStore('runs').get(run.id));if(!current)throw Error('run_missing');assertRunIdentity(current,run);if(current.finalBody!==undefined||!['persisted','uploading'].includes(current.executionState))throw Error('run_request_frozen');
  const id=`prepare:${run.id}`,prior:PreparationRecord|undefined=await requestResult(tx.objectStore('leases').get(id));
  if(prior&&prior.expiresAt>Date.now())throw Error('run_preparation_busy');
  const token={id,owner:crypto.randomUUID(),projectId:run.projectId,runId:run.id};
  tx.objectStore('leases').put({...token,expiresAt:Date.now()+30000});return token;
 });
}
export async function assertPreparation(tx:IDBTransaction,token:PreparationToken|undefined){
 if(!token)throw Error('run_preparation_required');
 const row:PreparationRecord|undefined=await requestResult(tx.objectStore('leases').get(token.id));
 if(!row||row.owner!==token.owner||row.expiresAt<=Date.now())throw Error('run_preparation_expired');
 // Only the current owner extends its preparation fence, never an expired owner.
 tx.objectStore('leases').put({...row,expiresAt:Date.now()+30000});
}
export async function releasePreparation(db:StudioDb,token:PreparationToken){
 await transact(db,['leases'],'readwrite',async tx=>{const row:PreparationRecord|undefined=await requestResult(tx.objectStore('leases').get(token.id));if(row?.owner===token.owner)tx.objectStore('leases').delete(token.id);});
}
