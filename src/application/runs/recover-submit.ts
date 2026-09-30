import {originalVideoApproval,submissionClient,sendFrozenVideo,persistSubmissionReply,type SubmitOptions} from './submit-video';
import type {Run} from '../../domain/run';
import {withDatabase,transact,requestResult,storageErrorCode,type StudioDb} from '../../infrastructure/storage/database';
import {readRun,saveRun,putRunInTransaction,validateFrozenBody} from '../../infrastructure/storage/run-repository';
import {assertAssetBinding} from '../../adapters/core/assets';
import {acquireRunTrackingLease,assertRunWriter,type RunLeaseRecord} from '../../infrastructure/storage/run-lease';
import {applySubmissionOutcome} from '../../domain/video-run-machine';
import {applyQueryObservation} from '../../domain/run-status';
import {z} from 'zod';
import {bindingSchema} from '../../domain/common';
import {hasSessionCredential,sanitizeKnownSecrets} from '../../security/credential-session';
import {allowedCorePath} from '../../adapters/core/route-policy';
export type RecoveryDecision={action:'manual_check'|'query_original'|'replay_original';confirmed?:true};
export type RecoveryResult={status:'manual_check'|'queried'|'replayed';run:Run;reason?:string};
const safeIdentity=z.string().regex(/^[-A-Za-z0-9._~]{1,256}$/).refine(value=>sanitizeKnownSecrets(value)===value);
const replySchema=z.discriminatedUnion('ok',[
 z.strictObject({ok:z.literal(true),value:z.strictObject({taskId:safeIdentity,requestId:safeIdentity.optional(),status:z.enum(['queued','processing','completed','failed','unknown']),errorCode:z.string().regex(/^[a-z][a-z0-9_]{0,95}$/).optional(),contentAvailable:z.boolean(),billingState:z.literal('not_provided')})}),
 z.strictObject({ok:z.literal(false),error:z.strictObject({httpStatus:z.number().int().min(0).max(599),category:z.enum(['quota','forbidden','conflict','rate_limited','unavailable','invalid_request','authentication','not_found','protocol','unknown']),errorCode:z.string().regex(/^[a-z][a-z0-9_]{0,95}$/),requestId:safeIdentity.optional(),retryAfterMs:z.number().nonnegative().optional(),submissionOutcome:z.enum(['not_sent','unknown'])})})
]);
const journalSchema=z.object({runId:z.string(),bodyHash:z.string(),idempotencyKey:z.string(),binding:bindingSchema,reply:replySchema});
function parseSubmissionJournal(raw:unknown,run:Run){const parsed=journalSchema.safeParse(raw);return parsed.success&&parsed.data.runId===run.id&&parsed.data.bodyHash===run.finalBodyHash&&parsed.data.idempotencyKey===run.idempotencyKey&&JSON.stringify(parsed.data.binding)===JSON.stringify({connectionId:run.connectionId,authBindingId:run.authBindingId,originSnapshot:run.originSnapshot})?parsed.data:undefined;}
export async function readSavedSubmissionReply(run:Run,db?:StudioDb){await validateFrozenBody(run);return withDatabase(db,async connection=>{const raw=await transact(connection,['receipts'],'readonly',tx=>requestResult<unknown>(tx.objectStore('receipts').get(`submission-response:${run.id}`)));return parseSubmissionJournal(raw,run)?.reply;});}
export async function recoverSubmission(runId:string,decision:RecoveryDecision,options:SubmitOptions={}):Promise<RecoveryResult>{
 try{return await withDatabase(options.db,async db=>{
  let run=await readRun(runId,db);if(!run)throw Error('run_missing');
  if(decision.action==='manual_check')return {status:'manual_check',run,reason:'original_request_retained'};
  const {client,capability}=submissionClient(options);assertAssetBinding(run,client);if(!hasSessionCredential(run.authBindingId))throw Error('session_credential_required');
  await validateFrozenBody(run);
  const stored=await transact(db,['receipts','leases'],'readonly',async tx=>({journal:await requestResult<unknown>(tx.objectStore('receipts').get(`submission-response:${runId}`)),lease:await requestResult<RunLeaseRecord|undefined>(tx.objectStore('leases').get(`dispatch:${runId}`))}));
  const journal=parseSubmissionJournal(stored.journal,run);
  if(!journal&&run.executionState==='submitting'&&stored.lease&&stored.lease.expiresAt>Date.now())return {status:'manual_check',run,reason:'original_submission_in_progress'};
  if(decision.action==='query_original'&&!run.taskId&&!(journal?.reply.ok))return {status:'manual_check',run,reason:'no_verified_identity_lookup_endpoint'};
  if(decision.action==='replay_original'){
   if(capability.videoIdempotencyReplay!==true)throw Error('idempotency_replay_unverified');
   if(decision.confirmed!==true)throw Error('original_replay_confirmation_required');
   await originalVideoApproval(db,run);if(!run.finalBody||!['submit_unknown','submitting'].includes(run.executionState))throw Error('original_replay_not_eligible');
  }
  const tabId=options.tabId??options.lease?.tabId;if(!tabId)throw Error('run_writer_identity_required');
  let claim=await acquireRunTrackingLease(runId,tabId,Date.now(),db);if(!claim.ok)throw Error(claim.errorCode);
  if(journal&&['submitting','submit_unknown'].includes(run.executionState)){
   const next=applySubmissionOutcome(run,journal.reply);await saveRun(next,{db,runToken:claim.token});run=next;claim=await acquireRunTrackingLease(runId,tabId,Date.now(),db);if(!claim.ok)throw Error(claim.errorCode);
  }
  if(!journal&&run.executionState==='submitting'){
   const next={...run,executionState:'submit_unknown' as const,queryState:'interrupted' as const,updatedAt:Date.now()};await saveRun(next,{db,runToken:claim.token});run=next;claim=await acquireRunTrackingLease(runId,tabId,Date.now(),db);if(!claim.ok)throw Error(claim.errorCode);
  }
  if(decision.action==='query_original'||run.taskId){
   if(!run.taskId)return {status:'manual_check',run,reason:'no_verified_identity_lookup_endpoint'};
   const reply=await client.queryVideo(run.taskId);
   const next=reply.ok&&allowedCorePath('/v1/videos/'+reply.value.taskId,'GET')&&sanitizeKnownSecrets(reply.value.taskId)===reply.value.taskId?applyQueryObservation(run,reply):{...run,queryState:!reply.ok&&reply.error.category==='authentication'?'auth_required' as const:'interrupted' as const,updatedAt:Date.now()};
   await saveRun(next,{db,runToken:claim.token});return {status:'queried',run:next};
  }
  const token=claim.token;
  const dispatching=await transact(db,['runs','leases','diagnostics'],'readwrite',async tx=>{
   await assertRunWriter(tx,runId,token);const current=(await requestResult<Run>(tx.objectStore('runs').get(runId)));
   if(current.executionState!=='submit_unknown'||current.finalBody!==run!.finalBody||current.idempotencyKey!==run!.idempotencyKey)throw Error('original_replay_not_eligible');
   const next={...current,executionState:'submitting' as const,updatedAt:Date.now()};await putRunInTransaction(tx,next,{runToken:token});tx.objectStore('diagnostics').put({id:crypto.randomUUID(),kind:'original_replay_intent',runId,at:Date.now()});return next;
  });
  const next=await persistSubmissionReply(db,dispatching,{...token,revision:token.revision+1},await sendFrozenVideo(client,dispatching));return {status:'replayed',run:next};
 });}catch(error){throw Error(storageErrorCode(error));}
}
