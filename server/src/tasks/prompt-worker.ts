import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import type {ApiSettingsDependencies} from '../settings/service.js';
import type {ConfigRow} from '../settings/repository.js';
import {ownedContent,appendSavedPromptResult} from '../prompts/repository.js';
import {promptDraftSchema} from '../prompts/contracts.js';
import {cloudTaskSchema,type CloudTask} from '../../../src/domain/cloud-task.js';
import {promptCompileResultSchema,promptCompileInputSchema,type PromptCompileResult} from '../../../src/domain/prompt.js';
import {validatePromptTextResult} from '../../../src/domain/prompt-engine/validate-result.js';
import {portableCloudContent} from '../../../src/domain/cloud-project-package.js';
import {frozenTaskKey,userSecrets} from './prompt-repository.js';
import {MAX_COMPLETION_TIMEOUT_MS} from '../security/outbound.js';
import {completionContent,promptResultObject,strictJson} from '../../../src/domain/prompt-engine/structured-result.js';
import {sealResponse,openResponse} from './prompt-response.js';
type TaskRow={user_id:string;id:string;document:unknown;frozen_config:ConfigRow;request_body:string;result_snapshot:unknown;finalize_attempts:number};
const context=(userId:string)=>({userId,sessionId:'persistent-task',contextId:'persistent-task'});
function parseResult(body:Buffer,keys:string[]):PromptCompileResult{
 let text=completionContent(strictJson(body.toString('utf8')));
 for(const key of keys){text=text.split(key).join('[已隐藏密钥]').split(JSON.stringify(key).slice(1,-1)).join('[已隐藏密钥]');}
 return promptCompileResultSchema.refine(result=>!!result.finalPrompt.trim()).parse(portableCloudContent(promptResultObject(text)));
}
async function finalizeOne(pool:Pool,now:Date){return transaction(pool,async db=>{
 const result=await db.query<TaskRow>("SELECT user_id,id,document,frozen_config,request_body,result_snapshot,finalize_attempts FROM workspace_tasks WHERE document->>'executionState'='response_received' AND (next_finalize_at IS NULL OR next_finalize_at<=$1) ORDER BY COALESCE(next_finalize_at,created_at),created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",[now]);const row=result.rows[0];if(!row)return false;
 await db.query('SAVEPOINT prompt_finalize');
 try{
 const task=cloudTaskSchema.parse(row.document),owner=context(row.user_id),content=await ownedContent(db,owner,task.draftId,'draft',true),draft=promptDraftSchema.parse(content.document),saved=row.result_snapshot as {kind?:string;candidate?:unknown},candidate=promptCompileResultSchema.parse(saved?.kind==='prompt-call-response-v2'?saved.candidate:row.result_snapshot);
 const source=await db.query<{document:unknown}>('SELECT document FROM workspace_content_versions WHERE user_id=$1 AND id=$2 AND revision=$3',[row.user_id,task.draftId,task.sourceRevision]);if(!source.rows[0])throw new Error('Frozen task input missing');
 const frozen=promptDraftSchema.parse(source.rows[0].document),{userRequest,sceneId,requestedSpec,audioPlan,lockedConstraints,references}=frozen;
 const version={...candidate,id:randomUUID(),sourceRevision:task.sourceRevision,origin:'ai' as const,validationState:'unchecked' as const,promptRunId:task.id,createdAt:now.getTime()};
 const issues=validatePromptTextResult(version,promptCompileInputSchema.parse({userRequest,sceneId,requestedSpec,audioPlan,lockedConstraints,references}));
 const checked={...version,validationState:issues.length?'needs_review' as const:'valid' as const,warnings:[...candidate.warnings,...issues.map(issue=>issue.message)]};
 await appendSavedPromptResult(db,owner,draft,checked,now,content.row.trashed_at!==null);
 const {errorCode:_,...previous}=task;void _;const next=cloudTaskSchema.parse({...previous,executionState:'succeeded',resultVersionId:version.id,updatedAt:now.getTime()});
 await db.query('UPDATE workspace_tasks SET document=$3::jsonb,lease_until=NULL,finalize_attempts=0,next_finalize_at=NULL,finalize_error=NULL,updated_at=$4 WHERE user_id=$1 AND id=$2',[row.user_id,row.id,JSON.stringify(next),now]);return true;
 }catch{
  await db.query('ROLLBACK TO SAVEPOINT prompt_finalize');
  const attempts=Math.min(16,row.finalize_attempts+1),due=new Date(now.getTime()+Math.min(300000,3000*2**Math.min(7,attempts-1)));
  await db.query("UPDATE workspace_tasks SET finalize_attempts=$3,next_finalize_at=$4,finalize_error='RESULT_SAVE_PENDING' WHERE user_id=$1 AND id=$2",[row.user_id,row.id,attempts,due]);
  return false; // This response stays durable; other tasks may proceed now.
 }
 });}
export async function reconcileNextPromptTask(pool:Pool,dependencies:ApiSettingsDependencies,clock:()=>Date=()=>new Date()){
 const now=clock(),row=await transaction(pool,async db=>{
  const rows=await db.query<TaskRow>("SELECT user_id,id,document,frozen_config,request_body,result_snapshot,finalize_attempts FROM workspace_tasks WHERE document->>'executionState' IN ('response_unknown','failed_confirmed','succeeded') AND document->>'billingState' IN ('not_provided','pending_reconciliation') AND (next_finalize_at IS NULL OR next_finalize_at<=$1) ORDER BY COALESCE(next_finalize_at,created_at),created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",[now]);
  const row=rows.rows[0];if(!row)return undefined;
  await db.query('UPDATE workspace_tasks SET next_finalize_at=$3,finalize_attempts=LEAST(16,finalize_attempts+1) WHERE user_id=$1 AND id=$2',[row.user_id,row.id,new Date(now.getTime()+300000)]);return row;
 });if(!row)return false;
 const task=cloudTaskSchema.parse(row.document),keys=await userSecrets(pool,row.user_id,dependencies);
 try{
  let saved:Buffer|undefined;try{saved=openResponse(row.result_snapshot,row.user_id,task.id,task.secretVersion,dependencies);}catch{/* A damaged local cache must not block lookup of the original Core identity. */}
  if(saved&&task.executionState==='response_unknown'){
   try{const candidate=parseResult(saved,keys),snapshot={...(row.result_snapshot as object),candidate};
    const {errorCode:_,...prior}=task;void _;
    await pool.query("UPDATE workspace_tasks SET document=$3::jsonb,result_snapshot=$4::jsonb,next_finalize_at=NULL,lease_until=NULL WHERE user_id=$1 AND id=$2 AND document->>'executionState'='response_unknown'",[row.user_id,row.id,JSON.stringify({...prior,executionState:'response_received',updatedAt:clock().getTime()}),JSON.stringify(snapshot)]);
    await finalizeOne(pool,clock());return true;
   }catch{/* Retain the original and read only the original Core operation. */}
  }
  const key=await frozenTaskKey(pool,row.user_id,row.frozen_config,dependencies);
  const reply=await dependencies.outbound.video(row.frozen_config.api_base,key,{kind:'textLookup',body:row.request_body,idempotencyKey:'studio-text-'+task.id});
  if(reply.status<200||reply.status>=300)return false;
  const recovery=strictJson(reply.body.toString('utf8')) as {request_id?:unknown;status?:unknown;result?:unknown;billing_state?:unknown;actual_microcredits?:unknown};
  let next=task,snapshot=row.result_snapshot,changed=false;
  if(recovery.billing_state==='settled'&&typeof recovery.actual_microcredits==='number'&&Number.isSafeInteger(recovery.actual_microcredits)&&recovery.actual_microcredits>=0){next={...next,billingState:'settled'};changed=true;}
  if(recovery.status==='failed_no_charge'&&task.executionState==='response_unknown'){next={...next,executionState:'failed_confirmed',errorCode:'UPSTREAM_FAILED'};changed=true;}
  if(recovery.status==='ready'&&recovery.result&&task.executionState!=='succeeded'){
   const original=sealResponse(Buffer.from(JSON.stringify(recovery.result)),200,row.user_id,task.id,task.secretVersion,dependencies,keys);
   const envelope=snapshot&&typeof snapshot==='object'&&'sealedResponse'in snapshot?{...snapshot,recoveryResponse:original}:original;
   try{const candidate=parseResult(Buffer.from(JSON.stringify(recovery.result)),keys);const {errorCode:_,...prior}=next;void _;next={...prior,executionState:'response_received'};snapshot={...envelope,candidate};}
   catch{next={...next,executionState:'failed_confirmed',errorCode:'INVALID_UPSTREAM_RESULT'};snapshot={...envelope,cause:'INVALID_UPSTREAM_RESULT'};}
   changed=true;
  }
  if(!changed)return false;
  next={...next,updatedAt:clock().getTime()};
  await pool.query("UPDATE workspace_tasks SET document=$3::jsonb,result_snapshot=$4::jsonb,next_finalize_at=CASE WHEN $5 THEN NULL ELSE next_finalize_at END WHERE user_id=$1 AND id=$2 AND document->>'executionState' IN ('response_unknown','failed_confirmed','succeeded')",[row.user_id,row.id,JSON.stringify(next),JSON.stringify(snapshot),next.executionState==='response_received']);
  if(next.executionState==='response_received')await finalizeOne(pool,clock());return true;
 }catch{return false;}
}
export async function executeNextPromptTask(pool:Pool,dependencies:ApiSettingsDependencies,clock:()=>Date=()=>new Date()){
 const now=clock();
 try{if(await finalizeOne(pool,now))return true;}catch{return false;} // The saved response remains retryable; no second upstream call.
 const row=await transaction(pool,async db=>{
  const result=await db.query<TaskRow>("SELECT user_id,id,document,frozen_config,request_body,result_snapshot FROM workspace_tasks WHERE document->>'executionState'='persisted' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");const stored=result.rows[0];if(!stored)return undefined;
  const task=cloudTaskSchema.parse(stored.document),next={...task,executionState:'sending',updatedAt:now.getTime()};
  // The lease must cover the whole reply budget; recovery must not discard a slow paid response.
  await db.query('UPDATE workspace_tasks SET document=$3::jsonb,lease_until=$4,updated_at=$5 WHERE user_id=$1 AND id=$2',[stored.user_id,stored.id,JSON.stringify(next),new Date(now.getTime()+MAX_COMPLETION_TIMEOUT_MS+30000),now]);return {...stored,document:next};
 });if(!row)return false;
 const task=cloudTaskSchema.parse(row.document);let result:PromptCompileResult|undefined,errorCode:CloudTask['errorCode'],definitelyNotSent=false,cause='UPSTREAM_FAILED',responseStatus:number|undefined,responseSnapshot:ReturnType<typeof sealResponse>|undefined;
 try{
  const key=await frozenTaskKey(pool,row.user_id,row.frozen_config,dependencies),keys=await userSecrets(pool,row.user_id,dependencies);
  const reply=await dependencies.outbound.completion(row.frozen_config.api_base,key,row.request_body,'studio-text-'+task.id,'studio-prompt-'+task.draftId,MAX_COMPLETION_TIMEOUT_MS);responseStatus=reply.status;
  responseSnapshot=sealResponse(reply.body,reply.status,row.user_id,task.id,task.secretVersion,dependencies,keys);
  // Persist the encrypted original before interpretation. A crash at the next
  // instruction can be recovered without buying another completion.
  await pool.query("UPDATE workspace_tasks SET result_snapshot=$3::jsonb WHERE user_id=$1 AND id=$2 AND document->>'executionState'='sending'",[row.user_id,row.id,JSON.stringify(responseSnapshot)]);
  if(reply.status<200||reply.status>=300)throw new HttpError(502,'UPSTREAM_FAILED');
  try{result=parseResult(reply.body,keys);}catch{errorCode='INVALID_UPSTREAM_RESULT';cause='INVALID_UPSTREAM_RESULT';}
 }catch(error){definitelyNotSent=error instanceof HttpError&&['OUTBOUND_BLOCKED','INVALID_API_KEY','INVALID_API_BASE','SECRET_UNAVAILABLE'].includes(error.code);errorCode=error instanceof HttpError&&error.code==='SECRET_UNAVAILABLE'?'SECRET_UNAVAILABLE':error instanceof HttpError&&error.code==='OUTBOUND_BLOCKED'?'OUTBOUND_BLOCKED':'UPSTREAM_FAILED';cause=error instanceof HttpError&&['UPSTREAM_TIMEOUT','UPSTREAM_TOO_LARGE','OUTBOUND_BLOCKED','INVALID_API_KEY','INVALID_API_BASE','SECRET_UNAVAILABLE'].includes(error.code)?error.code:responseStatus!==undefined?'UPSTREAM_HTTP_ERROR':'UPSTREAM_FAILED';}
 const at=clock(),invalidReply=errorCode==='INVALID_UPSTREAM_RESULT'&&responseStatus!==undefined&&responseStatus>=200&&responseStatus<300,next=cloudTaskSchema.parse({...task,executionState:result?'response_received':definitelyNotSent||invalidReply?'failed_confirmed':'response_unknown',billingState:result||definitelyNotSent?'not_provided':'pending_reconciliation',...(errorCode?{errorCode}:{}),updatedAt:at.getTime()});
 // Preserve only bounded diagnostic metadata. Old frontend contracts and uncertain billing stay intact.
 const snapshot=responseSnapshot?{...responseSnapshot,...(result?{candidate:result}:{cause})}:result??{kind:'prompt-call-failure',cause,timeoutMs:MAX_COMPLETION_TIMEOUT_MS,elapsedMs:Math.max(0,at.getTime()-now.getTime()),...(responseStatus!==undefined?{responseStatus}:{})};
 await pool.query("UPDATE workspace_tasks SET document=$3::jsonb,result_snapshot=$4::jsonb,lease_until=NULL,updated_at=$5 WHERE user_id=$1 AND id=$2 AND document->>'executionState'='sending'",[row.user_id,row.id,JSON.stringify(next),JSON.stringify(snapshot),at]);
 if(result)try{await finalizeOne(pool,clock());}catch{/* Keep the durable sanitized response for the next finalization attempt. */}
 return true;
}
export async function recoverExpiredPromptTasks(pool:Pool,now:Date){
 await pool.query("UPDATE workspace_tasks SET document=jsonb_set(jsonb_set(jsonb_set(jsonb_set(document,'{executionState}','\"response_unknown\"'),'{billingState}','\"pending_reconciliation\"'),'{errorCode}','\"UPSTREAM_FAILED\"'),'{updatedAt}',to_jsonb($2::bigint)),lease_until=NULL,updated_at=$1 WHERE document->>'executionState'='sending' AND lease_until<$1",[now,now.getTime()]);
}
export function startPromptWorker(pool:Pool,dependencies:ApiSettingsDependencies,clock:()=>Date=()=>new Date()){
 let stopped=false,inFlight:Promise<void>|undefined,reconciliation:Promise<void>|undefined;
 const tick=()=>{if(stopped||inFlight)return;inFlight=(async()=>{await recoverExpiredPromptTasks(pool,clock());await executeNextPromptTask(pool,dependencies,clock);})().catch(()=>{}).finally(()=>{inFlight=undefined;});};
 const reconcile=()=>{if(stopped||reconciliation)return;reconciliation=reconcileNextPromptTask(pool,dependencies,clock).then(()=>{}).catch(()=>{}).finally(()=>{reconciliation=undefined;});};
 const timer=setInterval(tick,500),recoveryTimer=setInterval(reconcile,5000);timer.unref();recoveryTimer.unref();tick();reconcile();
 return {async stop(){stopped=true;clearInterval(timer);clearInterval(recoveryTimer);await Promise.all([inFlight,reconciliation]);}};
}
