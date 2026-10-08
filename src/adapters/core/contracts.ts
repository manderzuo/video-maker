import {z} from 'zod';
import {normalizeVideoFailure,type VideoFailureInfo} from '../../domain/video-failure';
import {parseRetryAfter} from './retry-policy';
import {runWorkContextSchema,type Run,type BillingState} from '../../domain/run';
import {sanitizeKnownSecrets} from '../../security/credential-session';
export type CoreModel={id:string};
export type CoreTaskView={taskId:string;requestId?:string;status:'queued'|'processing'|'completed'|'failed'|'unknown';errorCode?:string;failure?:VideoFailureInfo;contentAvailable:boolean;billingState:BillingState;workContext?:Run['workContext']};
export type CoreFailure={httpStatus:number;category:'quota'|'forbidden'|'conflict'|'rate_limited'|'unavailable'|'invalid_request'|'authentication'|'not_found'|'protocol'|'unknown';errorCode:string;requestId?:string;retryAfterMs?:number;submissionOutcome:'not_sent'|'unknown'};
const nonempty=z.string().trim().min(1).max(256);
const taskShape=z.object({id:nonempty,status:z.string().trim().min(1).max(64),content_url:z.string().nullable().optional(),error:z.object({code:nonempty.optional(),type:nonempty.optional(),billing_state:z.string().max(64).optional(),message:z.unknown().optional(),upstream:z.unknown().optional()}).optional()});
const replySchema=z.object({task:taskShape.optional(),video_task:taskShape.optional(),data:z.object({task:taskShape.optional()}).optional(),id:nonempty.optional(),status:z.string().optional(),request_id:nonempty.optional(),content_url:z.string().nullable().optional(),work_context:z.object({work_id:nonempty,base_version_id:nonempty.nullable().optional()}).nullable().optional()});
export function parseVideoTask(input:unknown):CoreTaskView{
 const parsed=replySchema.safeParse(input);if(!parsed.success)throw new Error('core_task_protocol_invalid');const reply=parsed.data;
 const candidates=[reply.video_task,reply.task,reply.data?.task,...(reply.id?[{id:reply.id,status:reply.status??'unknown',content_url:reply.content_url,error:undefined}]:[])].filter(t=>t!==undefined);
 const task=candidates[0];if(!task||new Set(candidates.map(t=>t.id)).size!==1)throw new Error('core_task_identity_invalid');
 const states:Record<string,CoreTaskView['status']>={queued:'queued',pending:'queued',processing:'processing',running:'processing',completed:'completed',failed:'failed',canceled:'failed',cancelled:'failed'},state=task.status.toLowerCase(),code=task.error?.code??task.error?.type;
 // This observed gateway error means result verification is unavailable, not a
 // confirmed upstream execution failure. Retain the original task for recovery.
 const status=code==='bridge_recovery_required'?'unknown':Object.hasOwn(states,state)?states[state]:'unknown';
 const workContext=reply.work_context?runWorkContextSchema.parse({workId:reply.work_context.work_id,...(status==='completed'&&reply.work_context.base_version_id?{baseVersionId:reply.work_context.base_version_id}:{})}):undefined;
 if(workContext&&sanitizeKnownSecrets(JSON.stringify(workContext))!==JSON.stringify(workContext))throw Error('core_task_protocol_invalid');
 // Content is an observation, never proof of download success or settled billing.
 const billing:Readonly<Record<string,BillingState>>={pending:'pending_reconciliation',settled:'settled',released:'released'},wireBilling=task.error?.billing_state;
 const billingState=wireBilling&&Object.hasOwn(billing,wireBilling)?billing[wireBilling]:'not_provided';
 const rawUpstream=task.error?.upstream,upstream=rawUpstream&&typeof rawUpstream==='object'&&!Array.isArray(rawUpstream)?rawUpstream as Record<string,unknown>:undefined;
 const failure=status==='failed'?normalizeVideoFailure({gatewayCode:code,message:task.error?.message,upstreamCode:upstream?.code,upstreamMessage:upstream?.message}):undefined;
 return {taskId:task.id,...(reply.request_id?{requestId:reply.request_id}:{}),status,...(code&&/^[a-z][a-z0-9_]{0,95}$/.test(code)?{errorCode:code}:{}),...(failure?{failure}:{}),contentAvailable:status==='completed'&&!!task.content_url,billingState,...(workContext?{workContext}:{})};
}
export function parseCoreModels(input:unknown):CoreModel[]{const reply=z.object({data:z.array(z.object({id:nonempty}))}).parse(input);if(new Set(reply.data.map(m=>m.id)).size!==reply.data.length)throw new Error('core_model_duplicate');return reply.data.map(({id})=>({id}));}
export function classifyCoreError(status:number,body:unknown,retryAfter?:string):CoreFailure{
 const parsed=z.object({request_id:nonempty.optional(),type:nonempty.optional(),code:nonempty.optional(),error:z.object({code:nonempty.optional(),type:nonempty.optional(),request_id:nonempty.optional()}).optional()}).safeParse(body);
 const error=parsed.success?parsed.data.error:undefined,rawCode=error?.code??error?.type??(parsed.success?parsed.data.type??parsed.data.code:undefined),requestId=parsed.success?(error?.request_id??parsed.data.request_id):undefined;
 const textCodes:Record<string,string>={MissingSessionID:'text_session_required',AuthError:'text_authentication_failed',RegionError:'text_region_restricted',ModelError:'text_model_unavailable',RateLimitError:'text_usage_limit',GoUsageLimitError:'text_usage_limit',CreditsError:'text_usage_limit',DataPolicyError:'text_data_policy_restricted'};
 const code=rawCode&&Object.hasOwn(textCodes,rawCode)?textCodes[rawCode]:error&&rawCode&&/^[a-z][a-z0-9_]{0,95}$/.test(rawCode)&&sanitizeKnownSecrets(rawCode)===rawCode?rawCode:'core_http_error';
 const categories:Record<number,CoreFailure['category']>={400:'invalid_request',401:'authentication',402:'quota',403:'forbidden',404:'not_found',409:'conflict',413:'invalid_request',422:'invalid_request',429:'rate_limited',500:'unavailable',502:'unavailable',503:'unavailable',504:'unavailable'};
 // An HTTP class alone is insufficient to prove a paid send never happened.
 const preAdmission=new Set(['insufficient_scope','quota_insufficient','idempotency_conflict','video_billing_paused','invalid_request_error','budget_policy_unconfigured','budget_preparation_busy']);
 const retryAfterMs=status===429?parseRetryAfter(retryAfter):undefined;
 return {httpStatus:status,category:categories[status]??'unknown',errorCode:code,...(requestId?{requestId}:{}),...(retryAfterMs===undefined?{}:{retryAfterMs}),submissionOutcome:preAdmission.has(code)?'not_sent':'unknown'};
}
