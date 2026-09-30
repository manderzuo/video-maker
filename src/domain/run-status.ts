import type {Run} from './run';
import type {CoreReply} from '../adapters/core/http-client';
import type {CoreTaskView} from '../adapters/core/contracts';
import {sanitizeKnownSecrets} from '../security/credential-session';
import {allowedCorePath} from '../adapters/core/route-policy';
export function applyQueryObservation(run:Run,reply:CoreReply<CoreTaskView>):Run{
 if(!reply.ok)return {...run,queryState:reply.error.category==='authentication'||reply.error.category==='forbidden'?'auth_required':'interrupted',updatedAt:Date.now()};
 const task=reply.value;
 if(task.taskId!==run.taskId||!allowedCorePath('/v1/videos/'+task.taskId,'GET')||sanitizeKnownSecrets(task.taskId)!==task.taskId)throw Error('core_task_identity_mismatch');
 if(task.status==='unknown')return {...run,queryState:'interrupted',updatedAt:Date.now()};
 const terminal=['succeeded','failed_confirmed'].includes(run.executionState),executionState=terminal?run.executionState:task.status==='completed'?'succeeded':task.status==='failed'?'failed_confirmed':task.status==='processing'||run.executionState==='running'?'running':'accepted';
 // Query transport IDs do not replace the original submission request identity.
 return {...run,executionState,queryState:['completed','failed'].includes(task.status)?'idle':'polling',updatedAt:Date.now()};
}
