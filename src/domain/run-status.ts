import type {Run} from './run';
import type {CoreReply} from '../adapters/core/http-client';
import type {CoreTaskView} from '../adapters/core/contracts';
import {sanitizeKnownSecrets} from '../security/credential-session';
import {allowedCorePath} from '../adapters/core/route-policy';
export function applyQueryObservation(run:Run,reply:CoreReply<CoreTaskView>):Run{
 if(!reply.ok)return {...run,queryState:reply.error.category==='authentication'||reply.error.category==='forbidden'?'auth_required':'interrupted',updatedAt:Date.now()};
 const task=reply.value;
 if(task.taskId!==run.taskId||!allowedCorePath('/v1/videos/'+task.taskId,'GET')||sanitizeKnownSecrets(task.taskId)!==task.taskId)throw Error('core_task_identity_mismatch');
 if(run.workContext&&task.workContext&&(run.workContext.workId!==task.workContext.workId||run.workContext.baseVersionId&&task.workContext.baseVersionId&&run.workContext.baseVersionId!==task.workContext.baseVersionId))throw Error('video_work_identity_frozen');
 const billingState=task.billingState==='not_provided'?run.billingState:task.billingState;
 if(task.status==='unknown')return {...run,billingState,queryState:'interrupted',updatedAt:Date.now()};
 const terminal=['succeeded','failed_confirmed'].includes(run.executionState),executionState=terminal?run.executionState:task.status==='completed'?'succeeded':task.status==='failed'?'failed_confirmed':task.status==='processing'||run.executionState==='running'?'running':'accepted';
 // Query transport IDs do not replace the original submission request identity.
 return {...run,...(task.workContext?{workContext:{...run.workContext,...task.workContext}}:{}),executionState,billingState,queryState:['completed','failed'].includes(task.status)?'idle':'polling',updatedAt:Date.now()};
}
