import type {Run} from '../../domain/run';
import {prepareVideoRequest,buildVideoRequestBody,videoRunSnapshotSchema,type PrepareOptions} from './prepare-request';
import {getActiveCore} from '../../adapters/core/current-connection';
import {assertAssetBinding,coreAssetRefSchema} from '../../adapters/core/assets';
import {withDatabase,transact,requestResult,storageErrorCode,type StudioDb} from '../../infrastructure/storage/database';
import {assertProjectWriter} from '../../infrastructure/storage/project-lease';
import {readRun,saveRun,validateFrozenBody} from '../../infrastructure/storage/run-repository';
import {claimRunDispatch,markRunDispatched,type RunWriteToken} from '../../infrastructure/storage/run-lease';
import {preflightRun,planFingerprint,planPayload,type RunPlan} from './preflight';
import {storedRunDraft} from './approval';
import {parseVideoTask,type CoreTaskView} from '../../adapters/core/contracts';
import type {CoreReply,CoreClient} from '../../adapters/core/http-client';
import {allowedCorePath} from '../../adapters/core/route-policy';
import {applySubmissionOutcome} from '../../domain/video-run-machine';
import {sanitizeKnownSecrets,hasSessionCredential} from '../../security/credential-session';
import {z} from 'zod';
export type SubmitOptions=PrepareOptions&{tabId?:string;dispatchGuard?:(tx:IDBTransaction)=>Promise<void>};
type ApprovalReceipt={id:string;kind:'video';plan:RunPlan;planHash:string;runIds:string[];nodeCount:number};
const preparedReceiptSchema=z.object({runId:z.string(),bodyHash:z.string(),assetMappings:z.array(coreAssetRefSchema)});
function assertPreparedApproval(raw:unknown,run:Run){
 const parsed=preparedReceiptSchema.safeParse(raw),input=videoRunSnapshotSchema.parse(run.inputSnapshot);
 if(!parsed.success||parsed.data.runId!==run.id||parsed.data.bodyHash!==run.finalBodyHash||parsed.data.assetMappings.length!==input.references.length)throw Error('prepared_body_approval_mismatch');
 const mappings=parsed.data.assetMappings;
 for(let i=0;i<mappings.length;i++){const m=mappings[i],ref=input.references[i];if(m.assetId!==ref.assetId||m.connectionId!==run.connectionId||m.authBindingId!==run.authBindingId||m.originSnapshot!==run.originSnapshot||ref.sha256!==undefined&&m.sha256!==ref.sha256)throw Error('prepared_body_approval_mismatch');if(m.expiresAt<=Date.now())throw Error('prepared_reference_expired');}
 if(buildVideoRequestBody(input,mappings)!==run.finalBody)throw Error('prepared_body_approval_mismatch');
}
export async function originalVideoApproval(db:StudioDb,run:Run):Promise<ApprovalReceipt>{
 const rows=await transact(db,['receipts'],'readonly',tx=>requestResult<ApprovalReceipt[]>(tx.objectStore('receipts').getAll()));
 const receipt=rows.find(r=>r.id.startsWith('approval:')&&r.kind==='video'&&Array.isArray(r.runIds)&&r.runIds.includes(run.id));
 if(!receipt||receipt.planHash!==receipt.plan?.planHash||receipt.planHash!==await planFingerprint(receipt.plan)||receipt.nodeCount!==receipt.plan.nodes.length)throw Error('video_approval_required');
 const node=receipt.plan.nodes.find(n=>n.nodeId===run.nodeId);
 if(receipt.plan.projectId!==run.projectId||receipt.plan.revision!==run.graphRevision||receipt.plan.binding.id!==run.authBindingId||receipt.plan.connection.id!==run.connectionId||receipt.plan.binding.originSnapshot!==run.originSnapshot||!node||JSON.stringify(node.inputSnapshot)!==JSON.stringify(run.inputSnapshot))throw Error('video_approval_required');
 return receipt;
}
export function submissionClient(options:SubmitOptions){const active=getActiveCore(),client=options.client??active?.client,capability=options.capability??active?.capability;if(!client||!capability||capability.verification==='unknown'||capability.contractVersion!==client.profile.contractVersion)throw Error('core_capability_unverified');return {client,capability};}
export async function sendFrozenVideo(client:CoreClient,run:Run):Promise<CoreReply<CoreTaskView>>{
 if(!run.finalBody)throw Error('run_not_prepared');
 const reply=await client.requestJson('POST','/v1/videos/generations',run.finalBody,{idempotencyKey:run.idempotencyKey});
 if(!reply.ok){const e=reply.error;return {ok:false,error:{httpStatus:e.httpStatus,category:e.category,errorCode:/^[a-z][a-z0-9_]{0,95}$/.test(e.errorCode)&&sanitizeKnownSecrets(e.errorCode)===e.errorCode?e.errorCode:'core_http_error',submissionOutcome:e.submissionOutcome,...(e.requestId&&/^[-A-Za-z0-9._~]{1,256}$/.test(e.requestId)&&sanitizeKnownSecrets(e.requestId)===e.requestId?{requestId:e.requestId}:{}),...(e.retryAfterMs===undefined?{}:{retryAfterMs:e.retryAfterMs})}};}
 try{const task=parseVideoTask(reply.value);if(!allowedCorePath('/v1/videos/'+task.taskId,'GET')||sanitizeKnownSecrets(task.taskId)!==task.taskId)throw Error('core_task_identity_invalid');if(task.requestId&&(!/^[-A-Za-z0-9._~]{1,256}$/.test(task.requestId)||sanitizeKnownSecrets(task.requestId)!==task.requestId))delete task.requestId;return {ok:true,value:task};}catch{return {ok:false,error:{httpStatus:200,category:'protocol',errorCode:'core_task_protocol_invalid',submissionOutcome:'unknown'}};}
}
export async function persistSubmissionReply(db:StudioDb,run:Run,token:RunWriteToken,reply:CoreReply<CoreTaskView>):Promise<Run>{
 // A small response journal survives a subsequent Run save fault. It contains
 // only parsed identities/status, never raw response, download URL or Key.
 await transact(db,['receipts'],'readwrite',tx=>tx.objectStore('receipts').put({id:`submission-response:${run.id}`,runId:run.id,bodyHash:run.finalBodyHash,idempotencyKey:run.idempotencyKey,binding:{connectionId:run.connectionId,authBindingId:run.authBindingId,originSnapshot:run.originSnapshot},reply,at:Date.now()}));
 const next=applySubmissionOutcome(run,reply);try{await saveRun(next,{db,runToken:token});return next;}catch{throw Error('submission_result_save_failed_check_original');}
}
export async function submitVideo(runId:string,options:SubmitOptions={}):Promise<Run>{
 try{return await withDatabase(options.db,async db=>{
  const run=await readRun(runId,db);if(!run)throw Error('run_missing');
  if(await transact(db,['receipts'],'readonly',tx=>requestResult(tx.objectStore('receipts').get('run-withdrawal:'+runId))))throw Error('run_locally_withdrawn');
  if(run.executionState!=='persisted')throw Error('submission_requires_recovery');
  const {client,capability}=submissionClient(options);assertAssetBinding(run,client);if(!hasSessionCredential(run.authBindingId))throw Error('session_credential_required');
  const approval=await originalVideoApproval(db,run);
  if(approval.plan.expiresAt<=Date.now())throw Error('approval_expired');
  const tabId=options.tabId??options.lease?.tabId;if(!tabId)throw Error('run_writer_identity_required');
  await prepareVideoRequest(runId,{...options,db,client,capability});
  const prepared=(await readRun(runId,db))!;await validateFrozenBody(prepared);
  const preparedReceipt=await transact(db,['receipts'],'readonly',tx=>requestResult<unknown>(tx.objectStore('receipts').get(`prepared:${runId}`)));assertPreparedApproval(preparedReceipt,prepared);
  const claim=await claimRunDispatch(runId,tabId,{db});if(!claim.ok)throw Error(claim.errorCode);
  const marked=await markRunDispatched(claim.token,{db,beforeDispatch:async tx=>{
   if(await requestResult(tx.objectStore('receipts').get('run-withdrawal:'+runId)))throw Error('run_locally_withdrawn');
   await options.dispatchGuard?.(tx);
   await assertProjectWriter(tx,run.projectId,options.lease);
   const project:{revision:number;archived:boolean;trashedAt:number|null}|undefined=await requestResult(tx.objectStore('projects').get(run.projectId));if(!project||project.archived||project.trashedAt!=null||project.revision!==run.graphRevision||approval.plan.expiresAt<=Date.now())throw Error('approval_expired');
   const receipt:ApprovalReceipt|undefined=await requestResult(tx.objectStore('receipts').get(approval.id));if(!receipt||JSON.stringify(receipt)!==JSON.stringify(approval))throw Error('video_approval_required');
   const draft=await storedRunDraft(tx,run.projectId,approval.plan.nodes.map(n=>n.nodeId),{client,capability},true);
   // Members of this already confirmed batch are not new prior-unknown attempts.
   // Unrelated or older unknown Runs remain part of the risk acknowledgement.
   draft.priorRuns=draft.priorRuns?.filter(r=>!approval.runIds.includes(r.id));
   const current=preflightRun(draft);if(current.status!=='ready'||planPayload(current.plan)!==planPayload(approval.plan))throw Error('approval_expired');
   const now:Run|undefined=await requestResult(tx.objectStore('runs').get(runId));if(!now||now.finalBody!==prepared.finalBody||now.finalBodyHash!==prepared.finalBodyHash)throw Error('final_body_frozen');
   assertPreparedApproval(await requestResult(tx.objectStore('receipts').get(`prepared:${runId}`)),now);
  }});if(!marked.ok)throw Error(marked.errorCode);
  const dispatching=(await readRun(runId,db))!;
  return persistSubmissionReply(db,dispatching,marked.token,await sendFrozenVideo(client,dispatching));
 });}catch(error){throw Error(storageErrorCode(error));}
}
