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
 if(['succeeded','failed_confirmed'].includes(run.executionState))return {...run,queryState:'idle',updatedAt:Date.now()};
 return {...run,taskId:task.taskId,...(task.requestId?{coreRequestId:task.requestId}:{}),executionState:task.status==='completed'?'succeeded':task.status==='failed'?'failed_confirmed':task.status==='processing'?'running':'accepted',queryState:['completed','failed'].includes(task.status)?'idle':'polling',updatedAt:Date.now()};
}
