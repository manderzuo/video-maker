import {withDatabase,transact,requestResult,storageErrorCode,type StudioDb} from '../../infrastructure/storage/database';
import {assertProjectWriter,type ProjectLeaseToken} from '../../infrastructure/storage/project-lease';
import type {CoreClient} from '../../adapters/core/http-client';
import {preflightRun,planPayload,planFingerprint,type RunPlan,type RunDraftInput} from './preflight';
import {graphSchema} from '../../domain/graph';
import {assetSchema} from '../../domain/asset';
import {runSchema} from '../../domain/run';
import {capabilitySchema,type CapabilityProfile} from '../../domain/connection';
import {hasSessionCredential} from '../../security/credential-session';
import {assertAssetBinding} from '../../adapters/core/assets';
import {putRunInTransaction} from '../../infrastructure/storage/run-repository';
export type ConfirmDecision={confirmed:true;kind:'video';planHash:string;nodeCount:number;acknowledgeUnknownFee:true};
export type ApprovedRun={approvalId:string;planHash:string;projectId:string;revision:number;runIds:string[]};
export type ApprovalOptions={db?:StudioDb;lease?:ProjectLeaseToken;client:CoreClient;capability:CapabilityProfile;isCurrent?:()=>boolean};
export async function storedRunDraft(tx:IDBTransaction,projectId:string,nodeIds:string[],options:Pick<ApprovalOptions,'client'|'capability'>,canWrite:boolean,dirty=false):Promise<RunDraftInput>{
 const value:unknown=await requestResult(tx.objectStore('graphs').get(projectId));if(!value)throw Error('graph_missing');const graph=graphSchema.parse(value);
 const assets=(await requestResult<unknown[]>(tx.objectStore('assets').getAll())).map(a=>assetSchema.parse(a)),readableAssetIds:string[]=[];
 for(const asset of assets){const row:{blob:Blob}|undefined=await requestResult(tx.objectStore('blobs').get(asset.blobKey));if(row?.blob instanceof Blob&&row.blob.size===asset.bytes)readableAssetIds.push(asset.id);}
 const stored:{capability?:unknown}|undefined=await requestResult(tx.objectStore('diagnostics').get('capability:current')),checked=capabilitySchema.safeParse(stored?.capability);
 if(!checked.success||JSON.stringify(checked.data)!==JSON.stringify(capabilitySchema.parse(options.capability)))throw Error('capability_changed');
 return {graph,nodeIds,assets,readableAssetIds,capability:options.capability,connection:options.client.profile,binding:options.client.binding,canWrite,dirty,credentialAvailable:hasSessionCredential(options.client.binding.id)};
}
export async function approveRun(raw:RunPlan,userDecision:ConfirmDecision,options:ApprovalOptions):Promise<ApprovedRun>{
 const plan=structuredClone(raw),decision=structuredClone(userDecision),snapshotOptions={...options,lease:options.lease?{...options.lease}:undefined,capability:structuredClone(options.capability)};
 if(decision.confirmed!==true||decision.kind!=='video'||decision.acknowledgeUnknownFee!==true||decision.planHash!==plan.planHash||decision.nodeCount!==plan.nodes.length||!plan.nodes.length)throw Error('confirmation_mismatch');
 if(await planFingerprint(plan)!==plan.planHash)throw Error('plan_hash_mismatch');
 assertAssetBinding({connectionId:plan.connection.id,authBindingId:plan.binding.id,originSnapshot:plan.binding.originSnapshot},options.client);
 if(!hasSessionCredential(plan.binding.id))throw Error('session_credential_required');
 const at=Date.now(),runs=plan.nodes.map(node=>runSchema.parse({id:crypto.randomUUID(),projectId:plan.projectId,nodeId:node.nodeId,graphRevision:plan.revision,connectionId:plan.connection.id,authBindingId:plan.binding.id,originSnapshot:plan.binding.originSnapshot,idempotencyKey:'studio-video-'+crypto.randomUUID(),inputSnapshot:node.inputSnapshot,requestedSpec:node.inputSnapshot.spec,executionSpec:node.inputSnapshot.spec,executionState:'persisted',queryState:'idle',deliveryState:'not_ready',billingState:'not_provided',createdAt:at,updatedAt:at}));
 try{return await withDatabase(options.db,db=>transact(db,['projects','graphs','assets','blobs','diagnostics','leases','receipts','runs'],'readwrite',async tx=>{
  if(plan.expiresAt<=Date.now()||options.isCurrent?.()===false)throw Error('approval_expired');
  await assertProjectWriter(tx,plan.projectId,snapshotOptions.lease);
  const project:{revision:number;archived:boolean;trashedAt:number|null}|undefined=await requestResult(tx.objectStore('projects').get(plan.projectId));if(!project||project.archived||project.trashedAt!=null)throw Error('project_not_runnable');
  if(project.revision!==plan.revision)throw Error('approval_expired');
  const current=preflightRun(await storedRunDraft(tx,plan.projectId,plan.nodes.map(n=>n.nodeId),snapshotOptions,true));
  if(current.status!=='ready'||planPayload(current.plan)!==planPayload(plan))throw Error('approval_expired');
  const id=`approval:${plan.approvalId}`;if(await requestResult(tx.objectStore('receipts').get(id)))throw Error('approval_already_consumed');
  const approved={approvalId:plan.approvalId,planHash:plan.planHash,projectId:plan.projectId,revision:plan.revision,runIds:runs.map(r=>r.id)};
  for(const run of runs)await putRunInTransaction(tx,run,{lease:snapshotOptions.lease,expectedProjectRevision:plan.revision});
  tx.objectStore('receipts').put({id,...approved,nodeCount:runs.length,kind:'video',decision,plan,createdAt:Date.now()});return approved;
 }));}catch(error){throw Error(storageErrorCode(error));}
}
