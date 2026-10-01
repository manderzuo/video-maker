import type {ApprovedRun} from './approval';
import {submitVideo,originalVideoApproval,type SubmitOptions} from './submit-video';
import {planGraphRuns,type GraphNodePlan} from './graph-plan';
import {graphSchema} from '../../domain/graph';
import {runSchema,type Run} from '../../domain/run';
import {withDatabase,transact,requestResult,type StudioDb} from '../../infrastructure/storage/database';
import {assertProjectWriter} from '../../infrastructure/storage/project-lease';
import {z} from 'zod';
export type QueueItem=GraphNodePlan&{runId?:string;status:'waiting_confirmation'|'ready'|'preparing'|'accepted'|'blocked'|'submit_unknown'|'withdrawn';errorCode?:string};
export type RunQueue={id:string;queueId:string;projectId:string;revision:number;epoch:number;state:'draft'|'ready'|'active'|'paused'|'waiting_confirmation'|'blocked'|'completed';preparationConcurrency:number;items:QueueItem[];approvalId?:string;planHashes:string[];supersededRunIds:string[];owner?:{id:string;tabId:string;expiresAt:number};createdAt:number;updatedAt:number};
export type QueueInput={projectId:string;revision:number;nodeIds:string[];approved?:ApprovedRun;preparationConcurrency?:number};
export type QueueApproval={queueId:string;planHashes:string[];revision:number;explicitDecision:true;approvedRun:ApprovedRun};
export type QueueOptions=SubmitOptions&{onUpdate?:(queue:RunQueue)=>void|Promise<void>};
const queueItemSchema=z.strictObject({nodeId:z.string().min(1),inputNodeIds:z.array(z.string()),dependencyNodeIds:z.array(z.string()),dependencyRunIds:z.array(z.string()),requiresVisibleOutputs:z.array(z.string()),runId:z.string().optional(),status:z.enum(['waiting_confirmation','ready','preparing','accepted','blocked','submit_unknown','withdrawn']),errorCode:z.string().optional()});
const queueSchema=z.strictObject({id:z.string(),queueId:z.string().uuid(),projectId:z.string(),revision:z.number().int().nonnegative(),epoch:z.number().int().nonnegative(),state:z.enum(['draft','ready','active','paused','waiting_confirmation','blocked','completed']),preparationConcurrency:z.number().int().min(1).max(3),items:z.array(queueItemSchema).min(1),approvalId:z.string().optional(),planHashes:z.array(z.string().regex(/^[a-f0-9]{64}$/)),supersededRunIds:z.array(z.string()),owner:z.strictObject({id:z.string().uuid(),tabId:z.string().min(1),expiresAt:z.number().int()}).optional(),createdAt:z.number().int(),updatedAt:z.number().int()}).refine(q=>q.id===`queue:${q.queueId}`&&new Set(q.items.map(i=>i.nodeId)).size===q.items.length,'queue_record_invalid');
const tables=['receipts','projects','graphs','runs','leases'] as const;
async function get(tx:IDBTransaction,queueId:string):Promise<RunQueue>{const raw:unknown=await requestResult(tx.objectStore('receipts').get(`queue:${queueId}`));if(!raw)throw Error('queue_missing');return queueSchema.parse(raw);}
function put(tx:IDBTransaction,q:RunQueue){q.updatedAt=Date.now();tx.objectStore('receipts').put(queueSchema.parse(q));}
async function project(tx:IDBTransaction,q:Pick<RunQueue,'projectId'|'revision'>,options:QueueOptions,checkRevision=true){await assertProjectWriter(tx,q.projectId,options.lease);const p:{revision:number;archived:boolean;trashedAt:number|null}|undefined=await requestResult(tx.objectStore('projects').get(q.projectId));if(!p||p.archived||p.trashedAt!=null)throw Error('project_not_runnable');if(checkRevision&&p.revision!==q.revision)throw Error('queue_revision_changed');}
async function approvalRuns(db:StudioDb,input:QueueInput):Promise<Run[]>{
 if(!input.approved)return [];const a=input.approved;if(a.projectId!==input.projectId||a.revision!==input.revision||a.runIds.length!==input.nodeIds.length||new Set(a.runIds).size!==a.runIds.length)throw Error('queue_approval_mismatch');
 const runs=await transact(db,['runs'],'readonly',async tx=>Promise.all(a.runIds.map(async id=>runSchema.parse(await requestResult(tx.objectStore('runs').get(id))))));
 if(runs.some(r=>r.executionState!=='persisted')||new Set(runs.map(r=>r.nodeId)).size!==input.nodeIds.length||input.nodeIds.some(id=>!runs.some(r=>r.nodeId===id)))throw Error('queue_approval_mismatch');
 for(const run of runs){const receipt=await originalVideoApproval(db,run);if(receipt.id!==`approval:${a.approvalId}`||receipt.planHash!==a.planHash||receipt.plan.expiresAt<=Date.now())throw Error('queue_confirmation_required');}return runs;
}
async function reconcile(tx:IDBTransaction,q:RunQueue){for(const item of q.items){
 if(item.status==='withdrawn')continue;
 if(item.runId){const raw:unknown=await requestResult(tx.objectStore('runs').get(item.runId));if(raw){const run=runSchema.parse(raw);if(['submitting','submit_unknown'].includes(run.executionState))item.status='submit_unknown';else if(run.taskId)item.status='accepted';else if(run.executionState==='failed_confirmed'){item.status='blocked';item.errorCode='submission_failed';}else if(item.status==='preparing')item.status='ready';}}
 if(['accepted','submit_unknown'].includes(item.status))continue;
 for(const id of item.dependencyRunIds){const raw:unknown=await requestResult(tx.objectStore('runs').get(id)),run=raw?runSchema.parse(raw):undefined;if(run?.executionState==='failed_confirmed'){item.status='blocked';item.errorCode='upstream_failed';break;}if(!run||run.executionState!=='succeeded'){item.status='waiting_confirmation';item.errorCode='upstream_output_not_visible';}}
 if(item.requiresVisibleOutputs.length){item.status='waiting_confirmation';item.errorCode='upstream_output_confirmation_required';}
}}
export async function createRunQueue(input:QueueInput,options:QueueOptions={}):Promise<RunQueue>{
 const concurrency=input.preparationConcurrency??1;if(!Number.isInteger(concurrency)||concurrency<1||concurrency>3)throw Error('queue_concurrency_invalid');
 return withDatabase(options.db,async db=>{const runs=await approvalRuns(db,input);return transact(db,[...tables],'readwrite',async tx=>{
  await project(tx,input,options);const graph=graphSchema.parse(await requestResult(tx.objectStore('graphs').get(input.projectId)));if(graph.revision!==input.revision)throw Error('queue_revision_changed');const planned=planGraphRuns(graph,input.nodeIds);if(!planned.ok)throw Error(planned.issues[0].code);
  if(input.approved){const prior:{queueId:string}|undefined=await requestResult(tx.objectStore('receipts').get(`queue-for-approval:${input.approved.approvalId}`));if(prior)return get(tx,prior.queueId);for(const run of runs){const current=await requestResult(tx.objectStore('runs').get(run.id));if(JSON.stringify(current)!==JSON.stringify(run))throw Error('queue_approval_mismatch');}}
  const at=Date.now(),queueId=crypto.randomUUID(),queue:RunQueue={id:`queue:${queueId}`,queueId,projectId:input.projectId,revision:input.revision,epoch:0,state:input.approved?'ready':'draft',preparationConcurrency:concurrency,items:planned.value.map(p=>({...p,...(runs.find(r=>r.nodeId===p.nodeId)?{runId:runs.find(r=>r.nodeId===p.nodeId)!.id}:{}),status:input.approved?'ready':'waiting_confirmation'})),...(input.approved?{approvalId:input.approved.approvalId}:{}),planHashes:input.approved?[input.approved.planHash]:[],supersededRunIds:[],createdAt:at,updatedAt:at};
  await reconcile(tx,queue);put(tx,queue);if(input.approved)tx.objectStore('receipts').put({id:`queue-for-approval:${input.approved.approvalId}`,queueId});return queue;
 });});
}
export async function readQueue(queueId:string,options:QueueOptions={}):Promise<RunQueue>{return withDatabase(options.db,db=>transact(db,['receipts'],'readonly',tx=>get(tx,queueId)));}
export async function withdrawQueueItem(queueId:string,nodeId:string,decision:{confirmed:true;epoch:number},options:QueueOptions={}):Promise<RunQueue>{
 const intent=z.strictObject({confirmed:z.literal(true),epoch:z.number().int().nonnegative()}).parse(decision);
 return withDatabase(options.db,db=>transact(db,[...tables],'readwrite',async tx=>{
  const q=await get(tx,queueId);await project(tx,q,options,false);if(q.epoch!==intent.epoch)throw Error('queue_changed');
  if(!['draft','ready','paused','blocked','waiting_confirmation'].includes(q.state))throw Error('queue_pause_required');
  const item=q.items.find(i=>i.nodeId===nodeId);if(!item||!['waiting_confirmation','ready','blocked'].includes(item.status))throw Error('queue_item_already_started');
  if(q.items.some(i=>i.nodeId!==nodeId&&!['accepted','withdrawn'].includes(i.status)&&i.dependencyNodeIds.includes(nodeId)))throw Error('queue_dependency_pending');
  if(item.runId){
   const raw:unknown=await requestResult(tx.objectStore('runs').get(item.runId)),run=runSchema.parse(raw);
   if(run.executionState!=='persisted'||run.taskId||run.projectId!==q.projectId||run.nodeId!==nodeId)throw Error('queue_item_already_started');
   const preparing=await requestResult(tx.objectStore('leases').get('prepare:'+run.id)),dispatch=await requestResult(tx.objectStore('leases').get('dispatch:'+run.id));
   if(preparing||dispatch)throw Error('queue_item_already_started');
   tx.objectStore('receipts').put({id:'run-withdrawal:'+run.id,kind:'local-unsent-withdrawal',runId:run.id,queueId:q.queueId,projectId:q.projectId,nodeId,authBindingId:run.authBindingId,connectionId:run.connectionId,originSnapshot:run.originSnapshot,createdAt:Date.now()});
  }
  item.status='withdrawn';item.errorCode='locally_withdrawn';q.epoch++;delete q.owner;q.state='paused';put(tx,q);return q;
 }));
}
export async function listProjectQueues(projectId:string,options:QueueOptions={}):Promise<RunQueue[]>{return withDatabase(options.db,db=>transact(db,['receipts'],'readonly',async tx=>(await requestResult<{id:string}[]>(tx.objectStore('receipts').getAll())).filter(r=>r.id.startsWith('queue:')).map(r=>queueSchema.parse(r)).filter(q=>q.projectId===projectId).sort((a,b)=>b.createdAt-a.createdAt)));}
export async function pauseQueue(queueId:string,options:QueueOptions={}):Promise<RunQueue>{return withDatabase(options.db,db=>transact(db,[...tables],'readwrite',async tx=>{const q=await get(tx,queueId);await project(tx,q,options,false);await reconcile(tx,q);q.epoch++;delete q.owner;if(q.state!=='completed')q.state='paused';put(tx,q);return q;}));}
export async function restoreQueue(queueId:string,options:QueueOptions={}):Promise<RunQueue>{return pauseQueue(queueId,options);}
export async function setQueuePreparationConcurrency(queueId:string,value:number,options:QueueOptions={}):Promise<RunQueue>{if(!Number.isInteger(value)||value<1||value>3)throw Error('queue_concurrency_invalid');return withDatabase(options.db,db=>transact(db,[...tables],'readwrite',async tx=>{const q=await get(tx,queueId);await project(tx,q,options,false);if(!['paused','ready','draft'].includes(q.state))throw Error('queue_active');q.preparationConcurrency=value;put(tx,q);return q;}));}
export async function resumeQueue(queueId:string,approval:QueueApproval,options:QueueOptions={}):Promise<void>{
 if(approval.explicitDecision!==true||approval.queueId!==queueId||approval.planHashes.length!==1||approval.planHashes[0]!==approval.approvedRun.planHash||approval.revision!==approval.approvedRun.revision)throw Error('queue_confirmation_required');
 await withDatabase(options.db,async db=>{const before=await readQueue(queueId,{db}),pending=before.items.filter(i=>!['accepted','submit_unknown','withdrawn'].includes(i.status));if(before.state!=='paused'||before.approvalId===approval.approvedRun.approvalId||!pending.length||before.items.some(i=>i.status==='submit_unknown'))throw Error('queue_confirmation_required');
  const input={projectId:before.projectId,revision:approval.revision,nodeIds:pending.map(i=>i.nodeId),approved:approval.approvedRun},runs=await approvalRuns(db,input);
  await transact(db,[...tables],'readwrite',async tx=>{const q=await get(tx,queueId);if(q.epoch!==before.epoch||q.state!=='paused')throw Error('queue_changed');await project(tx,input,options);if(await requestResult(tx.objectStore('receipts').get(`queue-for-approval:${approval.approvedRun.approvalId}`)))throw Error('queue_approval_already_used');
   const graph=graphSchema.parse(await requestResult(tx.objectStore('graphs').get(q.projectId))),planned=planGraphRuns(graph,input.nodeIds);if(!planned.ok)throw Error(planned.issues[0].code);
   for(const run of runs)if(JSON.stringify(await requestResult(tx.objectStore('runs').get(run.id)))!==JSON.stringify(run))throw Error('queue_approval_mismatch');
   q.supersededRunIds.push(...pending.flatMap(i=>i.runId?[i.runId]:[]));q.items=q.items.filter(i=>['accepted','withdrawn'].includes(i.status)).concat(planned.value.map(p=>({...p,runId:runs.find(r=>r.nodeId===p.nodeId)!.id,status:'ready' as const})));q.revision=approval.revision;q.epoch++;q.approvalId=approval.approvedRun.approvalId;q.planHashes=[approval.approvedRun.planHash];q.state='ready';await reconcile(tx,q);put(tx,q);tx.objectStore('receipts').put({id:`queue-for-approval:${q.approvalId}`,queueId});
  });
 });
}
export async function executeQueue(queueId:string,options:QueueOptions={}):Promise<RunQueue>{return withDatabase(options.db,async db=>{
 const owner={id:crypto.randomUUID(),tabId:options.tabId??options.lease?.tabId??'',expiresAt:Date.now()+30000};if(!owner.tabId)throw Error('run_writer_identity_required');
 const active=await transact(db,[...tables],'readwrite',async tx=>{const q=await get(tx,queueId);await project(tx,q,options);if(q.state!=='ready'||!q.approvalId||q.items.some(i=>!['accepted','withdrawn','ready'].includes(i.status)))throw Error('queue_confirmation_required');q.epoch++;q.owner=owner;q.state='active';put(tx,q);return q;}),epoch=active.epoch;
 const guard=async(tx:IDBTransaction)=>{const q=await get(tx,queueId);if(q.state!=='active'||q.epoch!==epoch||q.owner?.id!==owner.id||q.owner.expiresAt<=Date.now())throw Error('queue_paused_or_owner_expired');await project(tx,q,options);};
 const notify=async(q:RunQueue)=>{try{await options.onUpdate?.(q);}catch{/* Display failure does not authorize another submission. */}};
 const heartbeat=setInterval(()=>void transact(db,[...tables],'readwrite',async tx=>{await guard(tx);const q=await get(tx,queueId);q.owner!.expiresAt=Date.now()+30000;put(tx,q);}).catch(()=>{}),5000);
 async function worker(){while(true){const item=await transact(db,[...tables],'readwrite',async tx=>{const q=await get(tx,queueId);if(q.state!=='active'||q.epoch!==epoch||q.owner?.id!==owner.id)return;await guard(tx);const next=q.items.find(i=>i.status==='ready');if(!next)return;next.status='preparing';put(tx,q);return structuredClone(next);});if(!item)return;
  let result:Run|undefined,errorCode:string|undefined;try{result=await submitVideo(item.runId!,{...options,db,dispatchGuard:async tx=>{await options.dispatchGuard?.(tx);await guard(tx);}});}catch(e){errorCode=e instanceof Error?e.message:'queue_submit_failed';result=await transact(db,['runs'],'readonly',async tx=>{const r:unknown=await requestResult(tx.objectStore('runs').get(item.runId!));return r?runSchema.parse(r):undefined;});}
  const updated=await transact(db,[...tables],'readwrite',async tx=>{const q=await get(tx,queueId);if(q.epoch!==epoch||q.owner?.id!==owner.id)return q;const current=q.items.find(i=>i.runId===item.runId)!;if(result?.taskId)current.status='accepted';else if(result&&['submitting','submit_unknown'].includes(result.executionState)){current.status='submit_unknown';q.state='paused';}else{current.status='blocked';current.errorCode=errorCode??'submission_failed';q.state='paused';}put(tx,q);return q;});await notify(updated);
 }}
 let failure:unknown;
 try{await notify(active);const results=await Promise.allSettled(Array.from({length:active.preparationConcurrency},async()=>{try{await worker();}catch(error){await transact(db,['receipts'],'readwrite',async tx=>{const q=await get(tx,queueId);if(q.epoch===epoch&&q.owner?.id===owner.id){q.state='paused';put(tx,q);}});throw error;}}));failure=results.find(r=>r.status==='rejected');}finally{clearInterval(heartbeat);}
 const final=await transact(db,[...tables],'readwrite',async tx=>{const q=await get(tx,queueId);if(q.epoch===epoch&&q.owner?.id===owner.id){delete q.owner;if(q.items.every(i=>['accepted','withdrawn'].includes(i.status)))q.state='completed';else if(q.state==='active')q.state='paused';put(tx,q);}else if(q.state==='paused'&&!q.owner){
  // Pause invalidates further dispatch, not the response of an already sent Run.
  // Reconcile the durable observation without taking over a newer active owner.
  await assertProjectWriter(tx,q.projectId,options.lease);await reconcile(tx,q);put(tx,q);
 }return q;});await notify(final);if(failure&&typeof failure==='object'&&'reason' in failure)throw failure.reason;return final;
});}
