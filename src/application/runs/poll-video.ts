import {runSchema,type Run} from '../../domain/run';
import {submissionClient,type SubmitOptions} from './submit-video';
import {withDatabase,transact,requestResult,storageErrorCode,type StudioDb} from '../../infrastructure/storage/database';
import {readRun,putRunInTransaction} from '../../infrastructure/storage/run-repository';
import {acquireRunTrackingLease,assertRunWriter} from '../../infrastructure/storage/run-lease';
import {assertAssetBinding} from '../../adapters/core/assets';
import type {CoreReply} from '../../adapters/core/http-client';
import type {CoreTaskView} from '../../adapters/core/contracts';
import {hasSessionCredential,sanitizeKnownSecrets} from '../../security/credential-session';
import {applyQueryObservation} from '../../domain/run-status';
import {safeVideoFailureCode} from '../../domain/video-failure';
import {studioTabId} from '../../features/projects/project-service';
import {nextPollDelay} from '../../adapters/core/retry-policy';
import {z} from 'zod';
import {observeGenerationFailure} from '../../features/settings/connection-status';
export type PollOptions=SubmitOptions&{signal?:AbortSignal};
type PollLock={id:string;owner:string;expiresAt:number};
export type PollSummary={id:string;runId:string;ok:boolean;at:number;httpStatus?:number;errorCode?:string;retryAfterMs?:number;contentAvailable?:boolean};
const inFlight=new Map<string,AbortController>();
const identity=(db:StudioDb,runId:string)=>db.connection.name+':'+runId;
async function queryToken(db:StudioDb,runId:string,options:PollOptions){const claim=await acquireRunTrackingLease(runId,options.tabId??options.lease?.tabId??studioTabId,Date.now(),db);if(!claim.ok)throw Error(claim.errorCode);return claim.token;}
export async function pollVideoOnce(runId:string,options:PollOptions={}):Promise<Run>{
 try{return await withDatabase(options.db,async db=>{
  const initial=await readRun(runId,db);if(!initial)throw Error('run_missing');if(initial.queryState==='paused_by_user')return initial;if(!initial.taskId)throw Error('original_task_identity_required');
  const key=identity(db,runId);if(inFlight.has(key))throw Error('run_query_busy');const controller=new AbortController();inFlight.set(key,controller);const abort=()=>controller.abort();if(options.signal?.aborted)abort();options.signal?.addEventListener('abort',abort,{once:true});let owner:string|undefined;
  try{
   const claimed=await queryToken(db,runId,options),lockId=`poll:${runId}`;
   const intent=await transact(db,['runs','leases'],'readwrite',async tx=>{
    await assertRunWriter(tx,runId,claimed);const current=runSchema.parse(await requestResult(tx.objectStore('runs').get(runId)));if(current.queryState==='paused_by_user')return {run:current};
    const prior:PollLock|undefined=await requestResult(tx.objectStore('leases').get(lockId));if(prior&&prior.expiresAt>Date.now())throw Error('run_query_busy');
    owner=crypto.randomUUID();tx.objectStore('leases').put({id:lockId,owner,expiresAt:Date.now()+30000});const run={...current,queryState:'polling' as const,updatedAt:Date.now()};await putRunInTransaction(tx,run,{runToken:claimed});return {run,token:{...claimed,revision:claimed.revision+1}};
   });if(!intent.token)return intent.run;
   let reply:CoreReply<CoreTaskView>,reportFailure:ReturnType<typeof observeGenerationFailure>|undefined;
   try{const {client}=submissionClient(options);assertAssetBinding(intent.run,client);if(!hasSessionCredential(intent.run.authBindingId))throw Error('session_credential_required');reportFailure=observeGenerationFailure(client,'video');reply=await client.queryVideo(intent.run.taskId!,{signal:controller.signal});}
   catch{reply={ok:false,error:{httpStatus:0,category:'authentication',errorCode:'original_authorization_required',submissionOutcome:'not_sent'}};}
   if(!reply.ok&&(reply.error.httpStatus===0||['authentication','forbidden','unavailable'].includes(reply.error.category)))reportFailure?.(reply.error);
   try{return await transact(db,['runs','leases','diagnostics'],'readwrite',async tx=>{
    await assertRunWriter(tx,runId,intent.token);const lock:PollLock|undefined=await requestResult(tx.objectStore('leases').get(lockId));if(!lock||lock.owner!==owner||lock.expiresAt<=Date.now())throw Error('run_query_fence_expired');
    const current=runSchema.parse(await requestResult(tx.objectStore('runs').get(runId)));let next:Run;try{next=applyQueryObservation(current,reply);}catch{next={...current,queryState:'interrupted',updatedAt:Date.now()};reply={ok:false,error:{httpStatus:200,category:'protocol',errorCode:'core_task_identity_mismatch',submissionOutcome:'unknown'}};}
    await putRunInTransaction(tx,next,{runToken:intent.token});
    const summary:PollSummary={id:`poll-summary:${runId}`,runId,ok:reply.ok&&reply.value.status!=='unknown',at:Date.now(),...(reply.ok?{contentAvailable:reply.value.contentAvailable,...(reply.value.status==='failed'?{errorCode:safeVideoFailureCode(reply.value.errorCode)}:{})}:{httpStatus:reply.error.httpStatus,errorCode:/^[a-z][a-z0-9_]{0,95}$/.test(reply.error.errorCode)&&sanitizeKnownSecrets(reply.error.errorCode)===reply.error.errorCode?reply.error.errorCode:'core_query_failed',...(reply.error.retryAfterMs===undefined?{}:{retryAfterMs:reply.error.retryAfterMs})})};
    tx.objectStore('diagnostics').put(summary);return next;
   });}catch(error){const current=await readRun(runId,db);if(current?.queryState==='paused_by_user')return current;throw error;}
  }finally{options.signal?.removeEventListener('abort',abort);if(inFlight.get(key)===controller)inFlight.delete(key);if(owner)await transact(db,['leases'],'readwrite',async tx=>{const row:PollLock|undefined=await requestResult(tx.objectStore('leases').get(`poll:${runId}`));if(row&&row.owner===owner)tx.objectStore('leases').delete(row.id);});}
 });}catch(error){throw Error(storageErrorCode(error));}
}
async function setQueryState(runId:string,state:'paused_by_user'|'polling',options:PollOptions):Promise<Run>{return withDatabase(options.db,async db=>{
 const token=await queryToken(db,runId,options);
 const next=await transact(db,['runs','leases'],'readwrite',async tx=>{await assertRunWriter(tx,runId,token);const run=runSchema.parse(await requestResult(tx.objectStore('runs').get(runId)));if(state==='polling'&&!run.taskId)throw Error('original_task_identity_required');const changed={...run,queryState:state,updatedAt:Date.now()};await putRunInTransaction(tx,changed,{runToken:token});return changed;});
 if(state==='paused_by_user')inFlight.get(identity(db,runId))?.abort();return next;
});}
export async function pausePolling(runId:string,options:PollOptions={}):Promise<void>{await setQueryState(runId,'paused_by_user',options);}
export async function resumePolling(runId:string,options:PollOptions={}):Promise<Run>{return setQueryState(runId,'polling',options);}
const pollSummarySchema=z.strictObject({id:z.string(),runId:z.string(),ok:z.boolean(),at:z.number().int().nonnegative(),httpStatus:z.number().int().min(0).max(599).optional(),errorCode:z.string().regex(/^[a-z][a-z0-9_]{0,95}$/).optional(),retryAfterMs:z.number().nonnegative().max(86400000).optional(),contentAvailable:z.boolean().optional()});
export async function readPollSummary(runId:string,db?:StudioDb){return withDatabase(db,c=>transact(c,['diagnostics'],'readonly',async tx=>{const parsed=pollSummarySchema.safeParse(await requestResult<unknown>(tx.objectStore('diagnostics').get(`poll-summary:${runId}`)));return parsed.success&&parsed.data.runId===runId?parsed.data:undefined;}));}
export type PollScheduler={set:(action:()=>Promise<void>,delay:number)=>unknown;clear:(id:unknown)=>void};
export type PollLoopOptions=PollOptions&{scheduler?:PollScheduler;isForeground?:()=>boolean;onUpdate?:(run:Run)=>void|Promise<void>;random?:()=>number};
const loops=new Map<string,{stop:()=>void}>();
export function startVideoPolling(runId:string,options:PollLoopOptions={}):{stop:()=>void}{
 const key=(options.db?.connection.name??'aiwork-studio:v1')+':'+runId,existing=loops.get(key);if(existing)return existing;
 const clock:PollScheduler=options.scheduler??{set:(action,delay)=>setTimeout(()=>void action().catch(()=>{}),delay),clear:id=>clearTimeout(id as ReturnType<typeof setTimeout>)};
 const foreground=options.isForeground??(()=>typeof document==='undefined'||document.visibilityState==='visible'),controller=new AbortController();let stopped=false,busy=false,timer:unknown,attempt=0;
 const handle={stop(){if(stopped)return;stopped=true;if(timer!==undefined)clock.clear(timer);controller.abort();options.signal?.removeEventListener('abort',abort);if(loops.get(key)===handle)loops.delete(key);}},abort=()=>handle.stop();
 async function tick(){if(stopped||busy)return;busy=true;timer=undefined;let delay=3000;
  try{
   const run=await pollVideoOnce(runId,{...options,signal:controller.signal});
   try{await options.onUpdate?.(run);}catch{/* A display refresh cannot change remote execution. */}
   if(['paused_by_user','auth_required'].includes(run.queryState)||['succeeded','failed_confirmed'].includes(run.executionState)||!run.taskId){handle.stop();return;}
   const summary=await readPollSummary(runId,options.db),ok=summary?.ok??run.queryState==='polling';
   if(ok)attempt=0;delay=nextPollDelay({ok,hidden:!foreground(),retryAfterMs:summary?.retryAfterMs,random:options.random},attempt);if(!ok)attempt++;
  }catch{delay=nextPollDelay({ok:false,hidden:!foreground(),random:options.random},attempt++);}
  finally{busy=false;if(!stopped)timer=clock.set(tick,delay);}
 }
 loops.set(key,handle);options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)handle.stop();else timer=clock.set(tick,nextPollDelay({ok:true,hidden:!foreground()},0));return handle;
}
