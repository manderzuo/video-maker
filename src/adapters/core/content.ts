import type {CoreClient} from './http-client';
import type {Run} from '../../domain/run';
export async function fetchCoreContent(run:Run,client:CoreClient,maxBytes:number,signal?:AbortSignal):Promise<Blob>{
 if(run.executionState!=='succeeded'||!run.taskId)throw Error('media_not_ready');
 if(run.connectionId!==client.profile.id||run.authBindingId!==client.binding.id||run.originSnapshot!==client.profile.originSnapshot)throw Error('original_authorization_required');
 const reply=await client.requestContent(run.taskId,{maxBytes,signal});if(!reply.ok)throw Error(reply.error.errorCode==='redirect_blocked'?'redirect_blocked':reply.error.errorCode==='media_cache_budget_exceeded'?'media_cache_budget_exceeded':reply.error.category==='authentication'?'original_authorization_required':'media_fetch_failed');return reply.value;
}
