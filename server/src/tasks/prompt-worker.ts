import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import type {ApiSettingsDependencies} from '../settings/service.js';
import type {ConfigRow} from '../settings/repository.js';
import {ownedContent,writeContent} from '../prompts/repository.js';
import {promptDraftSchema} from '../prompts/contracts.js';
import {cloudTaskSchema,type CloudTask} from '../../../src/domain/cloud-task.js';
import {promptCompileResultSchema,promptCompileInputSchema,type PromptCompileResult} from '../../../src/domain/prompt.js';
import {validatePromptTextResult} from '../../../src/domain/prompt-engine/validate-result.js';
import {portableCloudContent} from '../../../src/domain/cloud-project-package.js';
import {frozenTaskKey,userSecrets} from './prompt-repository.js';
type TaskRow={user_id:string;id:string;document:unknown;frozen_config:ConfigRow;request_body:string;result_snapshot:unknown};
const context=(userId:string)=>({userId,sessionId:'persistent-task',contextId:'persistent-task'});
const responseSchema=z.object({choices:z.array(z.object({message:z.object({content:z.string().max(65536)})})).min(1)});
function parseResult(body:Buffer,keys:string[]):PromptCompileResult{
 const response=responseSchema.parse(JSON.parse(body.toString('utf8')));let text=response.choices[0].message.content;
 for(const key of keys){text=text.split(key).join('[已隐藏密钥]').split(JSON.stringify(key).slice(1,-1)).join('[已隐藏密钥]');}
 text=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
 return promptCompileResultSchema.refine(result=>!!result.finalPrompt.trim()).parse(portableCloudContent(JSON.parse(text)));
}
async function finalizeOne(pool:Pool,now:Date){return transaction(pool,async db=>{
 const result=await db.query<TaskRow>("SELECT user_id,id,document,frozen_config,request_body,result_snapshot FROM workspace_tasks WHERE document->>'executionState'='response_received' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");const row=result.rows[0];if(!row)return false;
 const task=cloudTaskSchema.parse(row.document),owner=context(row.user_id),content=await ownedContent(db,owner,task.draftId,'draft',true),draft=promptDraftSchema.parse(content.document),candidate=promptCompileResultSchema.parse(row.result_snapshot);
 const source=await db.query<{document:unknown}>('SELECT document FROM workspace_content_versions WHERE user_id=$1 AND id=$2 AND revision=$3',[row.user_id,task.draftId,task.sourceRevision]);if(!source.rows[0])throw new Error('Frozen task input missing');
 const frozen=promptDraftSchema.parse(source.rows[0].document),{userRequest,sceneId,requestedSpec,audioPlan,lockedConstraints,references}=frozen;
 const version={...candidate,id:randomUUID(),sourceRevision:task.sourceRevision,origin:'ai' as const,validationState:'unchecked' as const,promptRunId:task.id,createdAt:now.getTime()};
 const issues=validatePromptTextResult(version,promptCompileInputSchema.parse({userRequest,sceneId,requestedSpec,audioPlan,lockedConstraints,references}));
 const checked={...version,validationState:issues.length?'needs_review' as const:'valid' as const,warnings:[...candidate.warnings,...issues.map(issue=>issue.message)]};
 await writeContent(db,owner,'draft',promptDraftSchema.parse({...draft,revision:draft.revision+1,resultVersions:[...draft.resultVersions,checked]}),now,content.row.trashed_at!==null);
 const {errorCode:_,...previous}=task;void _;const next=cloudTaskSchema.parse({...previous,executionState:'succeeded',resultVersionId:version.id,updatedAt:now.getTime()});
 await db.query('UPDATE workspace_tasks SET document=$3::jsonb,lease_until=NULL,updated_at=$4 WHERE user_id=$1 AND id=$2',[row.user_id,row.id,JSON.stringify(next),now]);return true;
 });}
export async function executeNextPromptTask(pool:Pool,dependencies:ApiSettingsDependencies,clock:()=>Date=()=>new Date()){
 const now=clock();
 try{if(await finalizeOne(pool,now))return true;}catch{return false;} // The saved response remains retryable; no second upstream call.
 const row=await transaction(pool,async db=>{
  const result=await db.query<TaskRow>("SELECT user_id,id,document,frozen_config,request_body,result_snapshot FROM workspace_tasks WHERE document->>'executionState'='persisted' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");const stored=result.rows[0];if(!stored)return undefined;
  const task=cloudTaskSchema.parse(stored.document),next={...task,executionState:'sending',updatedAt:now.getTime()};
  await db.query('UPDATE workspace_tasks SET document=$3::jsonb,lease_until=$4,updated_at=$5 WHERE user_id=$1 AND id=$2',[stored.user_id,stored.id,JSON.stringify(next),new Date(now.getTime()+150000),now]);return {...stored,document:next};
 });if(!row)return false;
 const task=cloudTaskSchema.parse(row.document);let result:PromptCompileResult|undefined,errorCode:CloudTask['errorCode'],definitelyNotSent=false;
 try{
  const key=await frozenTaskKey(pool,row.user_id,row.frozen_config,dependencies),keys=await userSecrets(pool,row.user_id,dependencies);
  const reply=await dependencies.outbound.completion(row.frozen_config.api_base,key,row.request_body,'studio-text-'+task.id,'studio-prompt-'+task.draftId);
  if(reply.status<200||reply.status>=300)throw new HttpError(502,'UPSTREAM_FAILED');
  try{result=parseResult(reply.body,keys);}catch{errorCode='INVALID_UPSTREAM_RESULT';}
 }catch(error){definitelyNotSent=error instanceof HttpError&&['OUTBOUND_BLOCKED','INVALID_API_KEY','INVALID_API_BASE','SECRET_UNAVAILABLE'].includes(error.code);errorCode=error instanceof HttpError&&error.code==='SECRET_UNAVAILABLE'?'SECRET_UNAVAILABLE':error instanceof HttpError&&error.code==='OUTBOUND_BLOCKED'?'OUTBOUND_BLOCKED':'UPSTREAM_FAILED';}
 const at=clock(),next=cloudTaskSchema.parse({...task,executionState:result?'response_received':definitelyNotSent?'failed_confirmed':'response_unknown',billingState:result||definitelyNotSent?'not_provided':'pending_reconciliation',...(errorCode?{errorCode}:{}),updatedAt:at.getTime()});
 await pool.query("UPDATE workspace_tasks SET document=$3::jsonb,result_snapshot=$4::jsonb,lease_until=NULL,updated_at=$5 WHERE user_id=$1 AND id=$2 AND document->>'executionState'='sending'",[row.user_id,row.id,JSON.stringify(next),result?JSON.stringify(result):null,at]);
 if(result)try{await finalizeOne(pool,clock());}catch{/* Keep the durable sanitized response for the next finalization attempt. */}
 return true;
}
export async function recoverExpiredPromptTasks(pool:Pool,now:Date){
 await pool.query("UPDATE workspace_tasks SET document=jsonb_set(jsonb_set(jsonb_set(jsonb_set(document,'{executionState}','\"response_unknown\"'),'{billingState}','\"pending_reconciliation\"'),'{errorCode}','\"UPSTREAM_FAILED\"'),'{updatedAt}',to_jsonb($2::bigint)),lease_until=NULL,updated_at=$1 WHERE document->>'executionState'='sending' AND lease_until<$1",[now,now.getTime()]);
}
export function startPromptWorker(pool:Pool,dependencies:ApiSettingsDependencies,clock:()=>Date=()=>new Date()){
 let stopped=false,inFlight:Promise<void>|undefined;
 const tick=()=>{if(stopped||inFlight)return;inFlight=(async()=>{await recoverExpiredPromptTasks(pool,clock());await executeNextPromptTask(pool,dependencies,clock);})().catch(()=>{}).finally(()=>{inFlight=undefined;});};
 const timer=setInterval(tick,500);timer.unref();tick();return {async stop(){stopped=true;clearInterval(timer);await inFlight;}};
}
