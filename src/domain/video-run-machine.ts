import {mergeVideoFailure,normalizeVideoFailure} from './video-failure.js';
import type {Run} from './run.js';
import type {CoreTaskView,CoreFailure} from '../adapters/core/contracts.js';
export function isReferencePreflightRejection(error:CoreFailure):boolean{
 return error.httpStatus===400&&error.errorCode==='reference_resource_unavailable'&&error.submissionOutcome==='not_sent';
}
export function applySubmissionOutcome(run:Run,reply:{ok:true;value:CoreTaskView}|{ok:false;error:CoreFailure}):Run{
 if(run.executionState!=='submitting'&&run.executionState!=='submit_unknown')throw Error('submission_state_invalid');
 if(!reply.ok){
  const now=Date.now(),referenceRejected=isReferencePreflightRejection(reply.error),id=referenceRejected?reply.error.requestId:undefined;
  // A preflight rejection may have a request ID but no video task. Keep the
  // diagnostic identity without treating it as a queryable video task ID.
  return {...run,executionState:reply.error.submissionOutcome==='not_sent'?'failed_confirmed':'submit_unknown',
   ...(reply.error.submissionOutcome==='not_sent'?{executionFinishedAt:now}:{}),
   ...(referenceRejected?{failure:normalizeVideoFailure({gatewayCode:reply.error.errorCode})}:{}),
   ...(id?{coreRequestId:id}:{}),queryState:'interrupted',updatedAt:now};
 }
 return observeVideoTask(run,reply.value);
}
export function observeVideoTask(run:Run,task:CoreTaskView):Run{
 if(run.taskId&&run.taskId!==task.taskId)throw Error('core_task_identity_mismatch');
 if(run.workContext&&task.workContext&&(run.workContext.workId!==task.workContext.workId||run.workContext.baseVersionId&&run.workContext.baseVersionId!==task.workContext.baseVersionId))throw Error('video_work_identity_frozen');
 const failure=mergeVideoFailure(run.failure,run.executionState!=='succeeded'&&task.status==='failed'?task.failure:undefined);
 const billingState=task.billingState==='not_provided'?run.billingState:task.billingState;
 if(['succeeded','failed_confirmed'].includes(run.executionState))return {...run,...(failure?{failure}:{}),attentionCode:undefined,billingState,queryState:task.status==='unknown'?'interrupted':'idle',updatedAt:Date.now()};
 const now=Date.now(),terminal=['completed','failed'].includes(task.status);
 return {...run,...(failure?{failure}:{}),taskId:task.taskId,...(task.workContext?{workContext:task.workContext}:{}),...(task.requestId&&!run.coreRequestId?{coreRequestId:task.requestId}:{}),executionState:task.status==='completed'?'succeeded':task.status==='failed'?'failed_confirmed':task.status==='processing'?'running':'accepted',...(terminal?{executionFinishedAt:now}:{}),attentionCode:task.attentionCode,billingState,queryState:task.attentionCode||task.status==='unknown'?'interrupted':terminal?'idle':'polling',updatedAt:now};
}
