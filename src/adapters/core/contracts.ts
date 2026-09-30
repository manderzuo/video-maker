import {z} from 'zod';
import {parseRetryAfter} from './retry-policy';
import {runWorkContextSchema,type Run} from '../../domain/run';
import {sanitizeKnownSecrets} from '../../security/credential-session';
export type CoreModel={id:string};
export type CoreTaskView={taskId:string;requestId?:string;status:'queued'|'processing'|'completed'|'failed'|'unknown';errorCode?:string;contentAvailable:boolean;billingState:'not_provided';workContext?:Run['workContext']};
export type CoreFailure={httpStatus:number;category:'quota'|'forbidden'|'conflict'|'rate_limited'|'unavailable'|'invalid_request'|'authentication'|'not_found'|'protocol'|'unknown';errorCode:string;requestId?:string;retryAfterMs?:number;submissionOutcome:'not_sent'|'unknown'};
const nonempty=z.string().trim().min(1).max(256);
const taskShape=z.object({id:nonempty,status:z.string().trim().min(1).max(64),content_url:z.string().nullable().optional(),error:z.object({code:nonempty.optional(),type:nonempty.optional()}).optional()});
const replySchema=z.object({task:taskShape.optional(),video_task:taskShape.optional(),data:z.object({task:taskShape.optional()}).optional(),id:nonempty.optional(),status:z.string().optional(),request_id:nonempty.optional(),content_url:z.string().nullable().optional(),work_context:z.object({work_id:nonempty,base_version_id:nonempty.nullable().optional()}).nullable().optional()});
export function parseVideoTask(input:unknown):CoreTaskView{
 const parsed=replySchema.safeParse(input);if(!parsed.success)throw new Error('core_task_protocol_invalid');const reply=parsed.data;
 const candidates=[reply.video_task,reply.task,reply.data?.task,...(reply.id?[{id:reply.id,status:reply.status??'unknown',content_url:reply.content_url,error:undefined}]:[])].filter(t=>t!==undefined);
 const task=candidates[0];if(!task||new Set(candidates.map(t=>t.id)).size!==1)throw new Error('core_task_identity_invalid');
 const states:Record<string,CoreTaskView['status']>={queued:'queued',pending:'queued',processing:'processing',running:'processing',completed:'completed',failed:'failed',canceled:'failed',cancelled:'failed'},state=task.status.toLowerCase(),status=Object.hasOwn(states,state)?states[state]:'unknown',code=task.error?.code??task.error?.type;
 const workContext=reply.work_context?runWorkContextSchema.parse({workId:reply.work_context.work_id,...(status==='completed'&&reply.work_context.base_version_id?{baseVersionId:reply.work_context.base_version_id}:{})}):undefined;
 if(workContext&&sanitizeKnownSecrets(JSON.stringify(workContext))!==JSON.stringify(workContext))throw Error('core_task_protocol_invalid');
 // Content is an observation, never proof of download success or settled billing.
 return {taskId:task.id,...(reply.request_id?{requestId:reply.request_id}:{}),status,...(code&&/^[a-z][a-z0-9_]{0,95}$/.test(code)?{errorCode:code}:{}),contentAvailable:status==='completed'&&!!task.content_url,billingState:'not_provided',...(workContext?{workContext}:{})};
}
export function parseCoreModels(input:unknown):CoreModel[]{const reply=z.object({data:z.array(z.object({id:nonempty}))}).parse(input);if(new Set(reply.data.map(m=>m.id)).size!==reply.data.length)throw new Error('core_model_duplicate');return reply.data.map(({id})=>({id}));}
export function classifyCoreError(status:number,body:unknown,retryAfter?:string):CoreFailure{
 const parsed=z.object({request_id:nonempty.optional(),error:z.object({code:nonempty.optional(),type:nonempty.optional(),request_id:nonempty.optional()}).optional()}).safeParse(body);
 const error=parsed.success?parsed.data.error:undefined,code=error?.code??error?.type??'core_http_error',requestId=parsed.success?(error?.request_id??parsed.data.request_id):undefined;
 const categories:Record<number,CoreFailure['category']>={400:'invalid_request',401:'authentication',402:'quota',403:'forbidden',404:'not_found',409:'conflict',413:'invalid_request',422:'invalid_request',429:'rate_limited',500:'unavailable',502:'unavailable',503:'unavailable',504:'unavailable'};
 // An HTTP class alone is insufficient to prove a paid send never happened.
 const preAdmission=new Set(['insufficient_scope','quota_insufficient','idempotency_conflict','video_billing_paused','invalid_request_error','budget_policy_unconfigured','budget_preparation_busy']);
 const retryAfterMs=status===429?parseRetryAfter(retryAfter):undefined;
 return {httpStatus:status,category:categories[status]??'unknown',errorCode:code,...(requestId?{requestId}:{}),...(retryAfterMs===undefined?{}:{retryAfterMs}),submissionOutcome:preAdmission.has(code)?'not_sent':'unknown'};
}
