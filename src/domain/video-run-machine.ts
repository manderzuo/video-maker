import type {Run} from './run';
import type {CoreReply} from '../adapters/core/http-client';
import type {CoreTaskView} from '../adapters/core/contracts';
export function applySubmissionOutcome(run:Run,reply:CoreReply<CoreTaskView>):Run{
 if(run.executionState!=='submitting'&&run.executionState!=='submit_unknown')throw Error('submission_state_invalid');
 if(!reply.ok)return {...run,executionState:reply.error.submissionOutcome==='not_sent'?'failed_confirmed':'submit_unknown',queryState:'interrupted',updatedAt:Date.now()};
 return observeVideoTask(run,reply.value);
}
export function observeVideoTask(run:Run,task:CoreTaskView):Run{
 if(run.taskId&&run.taskId!==task.taskId)throw Error('core_task_identity_mismatch');
 if(run.workContext&&task.workContext&&(run.workContext.workId!==task.workContext.workId||run.workContext.baseVersionId&&run.workContext.baseVersionId!==task.workContext.baseVersionId))throw Error('video_work_identity_frozen');
 const billingState=task.billingState==='not_provided'?run.billingState:task.billingState;
 if(['succeeded','failed_confirmed'].includes(run.executionState))return {...run,billingState,queryState:task.status==='unknown'?'interrupted':'idle',updatedAt:Date.now()};
 return {...run,taskId:task.taskId,...(task.workContext?{workContext:task.workContext}:{}),...(task.requestId?{coreRequestId:task.requestId}:{}),executionState:task.status==='completed'?'succeeded':task.status==='failed'?'failed_confirmed':task.status==='processing'?'running':'accepted',billingState,queryState:task.status==='unknown'?'interrupted':['completed','failed'].includes(task.status)?'idle':'polling',updatedAt:Date.now()};
}
