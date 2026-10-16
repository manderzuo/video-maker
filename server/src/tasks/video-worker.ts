import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {z} from 'zod';
import type {Pool} from 'pg';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import type {ConfigRow} from '../settings/repository.js';
import {frozenTaskKey,userSecrets} from './prompt-repository.js';
import type {VideoTaskDependencies} from './video-repository.js';
import {cloudVideoRunSchema,type CloudVideoRun} from '../../../src/domain/cloud-video-run.js';
import {buildVideoRequestBody} from '../../../src/domain/video-request.js';
import {observeVideoTask} from '../../../src/domain/video-run-machine.js';
import {parseVideoTask,classifyCoreError} from '../../../src/adapters/core/contracts.js';
import {parseRetryAfter} from '../../../src/adapters/core/retry-policy.js';
import {applySubmissionOutcome,isReferencePreflightRejection} from '../../../src/domain/video-run-machine.js';
import {ownedAsset,manifests,reserveVideoResult,completeAsset} from '../assets/repository.js';
import {verifyAssetFile,writeAssetFile} from '../assets/storage.js';
import {detectMediaMime} from '../../../src/features/assets/media-probe.js';
import {ownedProject,readProjectGraph} from '../projects/repository.js';
import {applyProjectCommandInTransaction} from '../projects/commands.js';
import {projectCommandSchema} from '../projects/contracts.js';
import {resultPlacement} from '../../../src/features/workspace/cloud-result-actions.js';
import type {DeploymentContract} from '../../../src/adapters/core/capabilities.js';
export type VideoLane='submit'|'query'|'delivery';
type VideoRow={user_id:string;id:string;document:unknown;frozen_config:ConfigRow&{canvasAutoPlace?:boolean};frozen_contract:DeploymentContract;lease_token:string;query_control_revision:number;query_retry_count:number;delivery_retry_count:number;phase:VideoLane};
const owner=(userId:string)=>({userId,sessionId:'persistent-video',contextId:'persistent-video'});
function safeRedactor(keys:string[]){return (text:string)=>{for(const key of keys)text=text.split(key).join('[已隐藏密钥]');return text.replace(/Bearer\s+[^\s,;"']+/gi,'Bearer [已隐藏密钥]');};}
const retryDelay=(attempt:number)=>Math.min(300000,3000*2**Math.min(7,Math.max(0,attempt-1)));
// Server-owned reviewed source evidence identifies older Core deployments too;
// workContext controls UI features and is not a billing protocol switch.
const reviewedCoreSql="(v.frozen_contract->'routes'->>'workContext'='true' OR (v.frozen_contract->>'verification' IN ('reviewed','live_verified') AND EXISTS(SELECT 1 FROM jsonb_array_elements(v.frozen_contract->'evidence') proof WHERE proof->>'kind'='fixed_source' AND proof->>'reference' ~ '^Core@[0-9a-f]{40}([; ]|$)')))";
const reviewedCore=(contract:DeploymentContract)=>contract.routes.workContext||contract.verification!=='unknown'&&contract.evidence.some(e=>e.kind==='fixed_source'&&/^Core@[0-9a-f]{40}([; ]|$)/.test(e.reference));
class ContentBusy extends Error {constructor(readonly retryAfterMs:number){super('content download busy');}}
class UploadRetry extends Error {constructor(readonly retryAfterMs:number){super('unpaid reference upload retry');}}
// Keep newer user intent, except that attention stops even a racing resume.
// A pause stays explicit; resuming an attention task permits one original-task
// read, never an automatic retry loop when that read still requires attention.
const mergedDocument="jsonb_set(jsonb_set($4::jsonb,'{queryState}',CASE WHEN $4::jsonb->>'attentionCode'='budget_continuation_requires_attention' THEN CASE WHEN document->>'queryState'='paused_by_user' THEN document->'queryState' ELSE to_jsonb('interrupted'::text) END WHEN query_control_revision<>$7 THEN document->'queryState' ELSE $4::jsonb->'queryState' END),'{recordRevision}',to_jsonb(COALESCE((document->>'recordRevision')::integer,0)+1))";
async function save(pool:Pool,row:VideoRow,run:CloudVideoRun,at:Date,retry=false,retryAfterMs=0){
 const count=retry?Math.min(16,(row.phase==='delivery'?row.delivery_retry_count:row.query_retry_count)+1):0,due=new Date(at.getTime()+Math.max(retry?retryDelay(count):3000,retryAfterMs));
 await transaction(pool,async db=>{
 const result=await db.query<{document:unknown}>(`UPDATE workspace_video_runs SET document=${mergedDocument},lease_until=NULL,lease_token=NULL,
 next_query_at=CASE WHEN $8='delivery' THEN next_query_at ELSE $5 END,
 next_delivery_at=CASE WHEN $8='delivery' THEN $5 ELSE next_delivery_at END,
 query_retry_count=CASE WHEN $8='delivery' THEN query_retry_count ELSE $9 END,
 delivery_retry_count=CASE WHEN $8='delivery' THEN $9 ELSE delivery_retry_count END,updated_at=$6
 WHERE user_id=$1 AND id=$2 AND lease_token=$3 RETURNING document`,[row.user_id,row.id,row.lease_token,JSON.stringify(run),due,at,row.query_control_revision,row.phase,count]);
 if(result.rowCount!==1)throw new HttpError(409,'TASK_LEASE_CHANGED');
 const saved=cloudVideoRunSchema.parse(result.rows[0]!.document);
 if(saved.maxAutomaticRetries!==1||saved.retryOfRunId||saved.retryRunId||!saved.taskId||saved.executionState!=='failed_confirmed'||saved.queryState==='paused_by_user'||saved.failure?.reasonCode!=='reference_resource_download_failed')return;
 const project=await db.query('SELECT id FROM workspace_projects WHERE user_id=$1 AND id=$2 AND trashed_at IS NULL AND purged_at IS NULL FOR SHARE',[row.user_id,saved.projectId]);if(!project.rowCount)return;
 const child=cloudVideoRunSchema.parse({...saved,id:randomUUID(),idempotencyKey:'studio-video-retry-'+saved.id,recordRevision:0,
  maxAutomaticRetries:undefined,retryRunId:undefined,retryOfRunId:saved.id,retryOfCoreTaskId:saved.taskId,
  finalBody:undefined,finalBodyHash:undefined,taskId:undefined,coreRequestId:undefined,workContext:undefined,failure:undefined,attentionCode:undefined,issueCode:undefined,resultAssetId:undefined,executionFinishedAt:undefined,
  executionState:'persisted',queryState:'idle',billingState:'not_provided',deliveryState:'not_ready',createdAt:at.getTime(),updatedAt:at.getTime()});
 await db.query('INSERT INTO workspace_video_runs(user_id,id,project_id,config_id,secret_version,frozen_config,frozen_contract,document,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$9)',[row.user_id,child.id,child.projectId,row.frozen_config.id,child.secretVersion,JSON.stringify(row.frozen_config),JSON.stringify(row.frozen_contract),JSON.stringify(child),at]);
 for(const ref of child.inputSnapshot.references)await db.query('INSERT INTO workspace_asset_references(user_id,project_id,asset_id,source_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[row.user_id,child.projectId,ref.assetId,'run:'+child.id]);
 await db.query("UPDATE workspace_video_runs SET document=jsonb_set(document,'{retryRunId}',to_jsonb($3::text)),updated_at=$4 WHERE user_id=$1 AND id=$2",[row.user_id,saved.id,child.id,at]);
 });
}
async function stage(pool:Pool,row:VideoRow,run:CloudVideoRun,at:Date){const result=await pool.query(`UPDATE workspace_video_runs SET document=${mergedDocument},updated_at=$5,lease_until=$6 WHERE user_id=$1 AND id=$2 AND lease_token=$3`,[row.user_id,row.id,row.lease_token,JSON.stringify(run),at,new Date(at.getTime()+150000),row.query_control_revision]);if(result.rowCount!==1)throw new HttpError(409,'TASK_LEASE_CHANGED');}
async function prepareReferences(pool:Pool,row:VideoRow,run:CloudVideoRun,dependencies:VideoTaskDependencies,key:string,redact:(input:string)=>string,clock:()=>Date){
 const refs=run.inputSnapshot.references,files=[];
 for(const ref of refs){const stored=await ownedAsset(pool,owner(row.user_id),ref.assetId),{asset,original}=manifests(stored);if(stored.state!=='complete'||asset.trashedAt!=null||asset.sha256!==ref.sha256||asset.bytes!==ref.bytes||!['image','video'].includes(asset.mediaType))throw new HttpError(409,'REFERENCE_CHANGED');const path=await verifyAssetFile(dependencies.assets,row.user_id,ref.assetId,'original',original);files.push({asset,path});}
 // Only called from a newly claimed persisted run: no generation dispatch has
 // happened. Unpaid uploads retry under a separate bounded counter; expired
 // mappings are refreshed here, including legacy rows without recorded expiry.
 for(let pass=0;pass<3;pass++){
 const mappings:{coreAssetId:string;expiresAt:number}[]=[];
 for(const {asset,path}of files){
  const prior=await pool.query<{state:string;remote_id:string|null;expires_at:Date|null}>('SELECT state,remote_id,expires_at FROM workspace_video_uploads WHERE user_id=$1 AND run_id=$2 AND asset_id=$3',[row.user_id,row.id,asset.id]);const stored=prior.rows[0];
  if(stored?.state==='succeeded'&&stored.remote_id&&stored.expires_at&&stored.expires_at.getTime()>clock().getTime()+5000){mappings.push({coreAssetId:stored.remote_id,expiresAt:stored.expires_at.getTime()});continue;}
  await stage(pool,row,run,clock());await pool.query("INSERT INTO workspace_video_uploads(user_id,run_id,asset_id,state) VALUES($1,$2,$3,'sending') ON CONFLICT(user_id,run_id,asset_id) DO UPDATE SET state='sending',remote_id=NULL,expires_at=NULL",[row.user_id,row.id,asset.id]);
  const bytes=await readFile(path),extension=asset.mimeType.split('/')[1],body=JSON.stringify({filename:asset.sha256+'.'+extension,mime_type:asset.mimeType,data_base64:bytes.toString('base64')});
  let reply;try{reply=await dependencies.outbound.video(row.frozen_config.api_base,key,{kind:'asset',body});}catch(error){if(error instanceof HttpError&&['OUTBOUND_BLOCKED','INVALID_API_KEY','INVALID_API_BASE'].includes(error.code))throw error;throw new UploadRetry(3000);}
  if(reply.status===429||reply.status>=500){throw new UploadRetry(parseRetryAfter(reply.retryAfter,clock().getTime())??3000);}
  if(reply.status<200||reply.status>=300)throw new HttpError(409,'UPLOAD_UNKNOWN');
  const parsed=z.object({object:z.literal('asset'),id:z.string().regex(/^[-A-Za-z0-9._~]{1,256}$/),sha256:z.string(),bytes:z.number(),mime_type:z.string(),created_at:z.number(),expires_at:z.number()}).safeParse(JSON.parse(reply.body.toString('utf8')));
  if(!parsed.success||redact(parsed.data.id)!==parsed.data.id||parsed.data.sha256!==asset.sha256||parsed.data.bytes!==asset.bytes||parsed.data.mime_type!==asset.mimeType||!Number.isSafeInteger(parsed.data.expires_at*1000)||parsed.data.expires_at*1000<=clock().getTime()+5000||parsed.data.created_at>parsed.data.expires_at)throw new HttpError(409,'UPLOAD_UNKNOWN');
  await stage(pool,row,run,clock());
  await pool.query("UPDATE workspace_video_uploads SET state='succeeded',remote_id=$4,expires_at=$5 WHERE user_id=$1 AND run_id=$2 AND asset_id=$3",[row.user_id,row.id,asset.id,parsed.data.id,new Date(parsed.data.expires_at*1000)]);mappings.push({coreAssetId:parsed.data.id,expiresAt:parsed.data.expires_at*1000});
 }
 if(mappings.every(mapping=>mapping.expiresAt>clock().getTime()+5000))return mappings;
 }
 throw new HttpError(409,'REFERENCE_EXPIRED');
}
async function copyResult(pool:Pool,row:VideoRow,run:CloudVideoRun,dependencies:VideoTaskDependencies,key:string,clock:()=>Date){
 const now=clock();
 const prior=await pool.query<{id:string;state:string}>("SELECT id,state FROM workspace_assets WHERE user_id=$1 AND document->>'sourceRunId'=$2",[row.user_id,run.id]);let asset;
 if(prior.rows[0]?.state==='complete'){const stored=await ownedAsset(pool,owner(row.user_id),prior.rows[0].id),files=manifests(stored);await verifyAssetFile(dependencies.assets,row.user_id,stored.id,'original',files.original);asset=files.asset;}
 else{
  if(!run.taskId)throw new HttpError(409,'TASK_ID_REQUIRED');const reply=await dependencies.outbound.video(row.frozen_config.api_base,key,{kind:'content',taskId:run.taskId},Math.min(dependencies.assets.maxAssetBytes,200*1024*1024));if(reply.status===429)throw new ContentBusy(parseRetryAfter(reply.retryAfter,clock().getTime())??3000);if(reply.status<200||reply.status>=300)throw new HttpError(502,'UPSTREAM_FAILED');const mimeType=detectMediaMime(reply.body.subarray(0,128));if(!mimeType||!mimeType.startsWith('video/'))throw new HttpError(400,'UPLOAD_INVALID');const manifest={sha256:createHash('sha256').update(reply.body).digest('hex'),bytes:reply.body.length,mimeType};
  await stage(pool,row,run,clock());const pending=await reserveVideoResult(pool,owner(row.user_id),run.id,manifest,dependencies.assets,now);await writeAssetFile(dependencies.assets,row.user_id,pending.id,'original',manifest,Readable.from(reply.body));asset=await completeAsset(pool,owner(row.user_id),pending.id,dependencies.assets);
 }
 await pool.query('INSERT INTO workspace_asset_references(user_id,project_id,asset_id,source_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[row.user_id,run.projectId,asset.id,'run:'+run.id]);return {...run,resultAssetId:asset.id,deliveryState:'available_for_preview' as const,updatedAt:now.getTime()};
}
async function placeCanvasResult(pool:Pool,row:VideoRow,run:CloudVideoRun,at:Date){
 if(!row.frozen_config.canvasAutoPlace||!run.resultAssetId)return;
 const resultAssetId=run.resultAssetId;
 await transaction(pool,async db=>{
  const context=owner(row.user_id),project=await ownedProject(db,context,run.projectId,true);
  if(project.trashedAt!==null)return;
  const prior=await db.query('SELECT id FROM workspace_command_receipts WHERE user_id=$1 AND id=$2',[row.user_id,run.id]);
  if(prior.rowCount)return; // Includes results that the user subsequently undid.
  const graph=await readProjectGraph(db,context,run.projectId),asset=manifests(await ownedAsset(db,context,resultAssetId)).asset;
  const existing=graph.nodes.find(node=>node.type==='result'&&node.data.runId===run.id&&node.data.assetId===asset.id);
  const batch=existing?.locked?{operations:[],reason:undefined}:resultPlacement(graph,run,asset);
  if(batch.reason)throw new HttpError(409,'RESULT_SAVE_PENDING');
  await applyProjectCommandInTransaction(db,context,run.projectId,projectCommandSchema.parse({expectedRevision:graph.revision,idempotencyKey:run.id,command:batch.operations.length?{type:'operations',operations:batch.operations}:{type:'viewport',viewport:graph.viewport}}),at);
 });
}
const submitEligible="v.document->>'executionState'='persisted' AND (v.next_query_at IS NULL OR v.next_query_at<=$1)";
const queryEligible=`(v.document->>'taskId' IS NOT NULL OR (v.document->>'executionState'='submit_unknown' AND (v.document->>'retryOfCoreTaskId' IS NOT NULL OR v.document->>'finalBody' IS NOT NULL))) AND v.document->>'queryState' NOT IN ('paused_by_user','auth_required','interrupted')
 AND (v.next_query_at IS NULL OR v.next_query_at<=$1)
 AND (v.document->>'executionState' IN ('accepted','running') OR v.document->>'billingState'='pending_reconciliation'
 OR (v.document->>'executionState' IN ('succeeded','failed_confirmed') AND v.document->>'billingState'='not_provided' AND ${reviewedCoreSql}))`;
const deliveryEligible=`v.document->>'executionState'='succeeded' AND (v.next_delivery_at IS NULL OR v.next_delivery_at<=$1)
 AND (v.document->>'deliveryState'<>'available_for_preview' OR (v.document->>'issueCode'='RESULT_SAVE_PENDING' AND v.document->>'resultAssetId' IS NOT NULL) OR (v.frozen_config->>'canvasAutoPlace'='true'
 AND NOT EXISTS(SELECT 1 FROM workspace_command_receipts c WHERE c.user_id=v.user_id AND c.id=v.id)
 AND EXISTS(SELECT 1 FROM workspace_projects p WHERE p.user_id=v.user_id AND p.id=v.project_id AND p.trashed_at IS NULL AND p.purged_at IS NULL)))`;
export async function executeNextVideoTask(pool:Pool,dependencies:VideoTaskDependencies,clock:()=>Date=()=>new Date(),lane:VideoLane|'any'='any'){
 const now=clock(),row=await transaction(pool,async db=>{
  const result=await db.query<VideoRow>(`SELECT v.user_id,v.id,v.document,v.frozen_config,v.frozen_contract,v.lease_token,v.query_control_revision,v.query_retry_count,v.delivery_retry_count,
   CASE WHEN ${submitEligible} THEN 'submit' WHEN $2='delivery' OR ($2='any' AND (${deliveryEligible})) THEN 'delivery' ELSE 'query' END AS phase
   FROM workspace_video_runs v WHERE v.lease_token IS NULL AND (
   ($2 IN ('submit','any') AND (${submitEligible})) OR ($2 IN ('query','any') AND (${queryEligible})) OR ($2 IN ('delivery','any') AND (${deliveryEligible})))
   ORDER BY CASE WHEN ${submitEligible} THEN v.created_at WHEN $2='delivery' OR ($2='any' AND (${deliveryEligible})) THEN COALESCE(v.next_delivery_at,v.created_at) ELSE COALESCE(v.next_query_at,v.created_at) END,v.created_at,v.id
   LIMIT 1 FOR UPDATE OF v SKIP LOCKED`,[now,lane]);
  const stored=result.rows[0];if(!stored)return undefined;
  const current=cloudVideoRunSchema.parse(stored.document),run=current.executionState==='persisted'?{...current,executionState:!current.retryOfCoreTaskId&&current.inputSnapshot.references.length?'uploading' as const:'submitting' as const,updatedAt:now.getTime()}:current,token=randomUUID();
  await db.query("UPDATE workspace_video_runs SET document=jsonb_set($3::jsonb,'{recordRevision}',to_jsonb(COALESCE((document->>'recordRevision')::integer,0)+1)),lease_token=$4,lease_until=$5 WHERE user_id=$1 AND id=$2",[stored.user_id,stored.id,JSON.stringify(run),token,new Date(now.getTime()+150000)]);
  return {...stored,document:run,lease_token:token};
 });if(!row)return false;
 let run=cloudVideoRunSchema.parse(row.document),sending=false;
 try{
  if(row.phase==='delivery'){
   if(run.deliveryState==='available_for_preview'&&run.issueCode==='RESULT_SAVE_PENDING'&&run.resultAssetId){
    const stored=await ownedAsset(pool,owner(row.user_id),run.resultAssetId),{original}=manifests(stored);
    const bound=await pool.query("SELECT 1 FROM workspace_asset_references WHERE user_id=$1 AND project_id=$2 AND asset_id=$3 AND source_id=$4",[row.user_id,run.projectId,run.resultAssetId,'run:'+run.id]);
    if(stored.state!=='complete'||!bound.rowCount)throw new HttpError(409,'RESULT_SAVE_PENDING');
    await verifyAssetFile(dependencies.assets,row.user_id,run.resultAssetId,'original',original);
   }
   if(run.deliveryState!=='available_for_preview'){
    const key=await frozenTaskKey(pool,row.user_id,row.frozen_config,dependencies);
    run={...run,deliveryState:'fetching'};await stage(pool,row,run,clock());
    run=await copyResult(pool,row,run,dependencies,key,clock);
   }
   await stage(pool,row,run,clock());
   let retry=false;try{await placeCanvasResult(pool,row,run,clock());}catch{retry=true;}
   if(!retry&&run.issueCode==='RESULT_SAVE_PENDING')run={...run,issueCode:undefined};
   await save(pool,row,run,clock(),retry);return true;
  }
  const key=await frozenTaskKey(pool,row.user_id,row.frozen_config,dependencies),redact=safeRedactor(await userSecrets(pool,row.user_id,dependencies));
  if(row.phase==='submit'){
   const mappings=run.retryOfCoreTaskId?[]:await prepareReferences(pool,row,run,dependencies,key,redact,clock),finalBody=run.retryOfCoreTaskId?JSON.stringify({max_retries:1}):buildVideoRequestBody(run.inputSnapshot,mappings);
   run={...run,finalBody,finalBodyHash:createHash('sha256').update(finalBody).digest('hex'),executionState:'submitting',updatedAt:clock().getTime()};await stage(pool,row,run,clock());
   // Check after the final durable stage, immediately before the only paid send.
   if(mappings.some(mapping=>mapping.expiresAt<=clock().getTime()+5000))throw new HttpError(409,'REFERENCE_EXPIRED');
   sending=true;const reply=await dependencies.outbound.video(row.frozen_config.api_base,key,run.retryOfCoreTaskId?{kind:'retry',taskId:run.retryOfCoreTaskId}:{kind:'submit',body:finalBody,idempotencyKey:run.idempotencyKey});
   if(reply.status<200||reply.status>=300){const failure=classifyCoreError(reply.status,JSON.parse(reply.body.toString('utf8')),undefined,redact);
    run=isReferencePreflightRejection(failure)?cloudVideoRunSchema.parse({...run,...applySubmissionOutcome(run,{ok:false,error:failure}),inputSnapshot:run.inputSnapshot,executionFinishedAt:clock().getTime(),updatedAt:clock().getTime()}):{...run,executionState:failure.submissionOutcome==='not_sent'?'failed_confirmed':'submit_unknown',queryState:failure.submissionOutcome==='not_sent'?'interrupted':'polling',billingState:failure.submissionOutcome==='not_sent'?'not_provided':'pending_reconciliation',...(failure.submissionOutcome==='not_sent'?{failure:{reasonCode:'video_not_submitted' as const},executionFinishedAt:clock().getTime()}:{}),updatedAt:clock().getTime()};
   }else{const observed=observeVideoTask(run,parseVideoTask(JSON.parse(reply.body.toString('utf8')),redact));run=cloudVideoRunSchema.parse({...run,...observed,inputSnapshot:run.inputSnapshot,...(!run.executionFinishedAt&&observed.executionFinishedAt?{executionFinishedAt:clock().getTime()}:{}),updatedAt:clock().getTime()});}
  }else if(run.retryOfCoreTaskId&&!run.taskId&&run.executionState==='submit_unknown'){
   await stage(pool,row,run,clock());
   const reply=await dependencies.outbound.video(row.frozen_config.api_base,key,{kind:'retryLookup',taskId:run.retryOfCoreTaskId});
   if(reply.status===429)throw new ContentBusy(parseRetryAfter(reply.retryAfter,clock().getTime())??3000);
   if(reply.status<200||reply.status>=300)throw new HttpError(502,'UPSTREAM_FAILED');
   run=cloudVideoRunSchema.parse({...run,...observeVideoTask(run,parseVideoTask(JSON.parse(reply.body.toString('utf8')),redact)),inputSnapshot:run.inputSnapshot,updatedAt:clock().getTime()});
  }else if(!run.taskId&&run.executionState==='submit_unknown'&&run.finalBody){
   if(createHash('sha256').update(run.finalBody).digest('hex')!==run.finalBodyHash)throw new HttpError(409,'REQUEST_SNAPSHOT_INVALID');
   await stage(pool,row,run,clock());
   const reply=await dependencies.outbound.video(row.frozen_config.api_base,key,{kind:'lookup',body:run.finalBody,idempotencyKey:run.idempotencyKey});
   if(reply.status===429)throw new ContentBusy(parseRetryAfter(reply.retryAfter,clock().getTime())??3000);
   if(reply.status<200||reply.status>=300)throw new HttpError(502,'UPSTREAM_FAILED');
   run=cloudVideoRunSchema.parse({...run,...observeVideoTask(run,parseVideoTask(JSON.parse(reply.body.toString('utf8')),redact)),inputSnapshot:run.inputSnapshot,updatedAt:clock().getTime()});
  }else if(run.taskId){
   await stage(pool,row,run,clock());
   const reply=await dependencies.outbound.video(row.frozen_config.api_base,key,{kind:'query',taskId:run.taskId});
   if(reply.status===401||reply.status===403){run={...run,queryState:'auth_required',updatedAt:clock().getTime()};await save(pool,row,run,clock());return true;}
   if(reply.status===429)throw new ContentBusy(parseRetryAfter(reply.retryAfter,clock().getTime())??3000);
   if(reply.status<200||reply.status>=300)throw new HttpError(502,'UPSTREAM_FAILED');
   const observed=observeVideoTask(run,parseVideoTask(JSON.parse(reply.body.toString('utf8')),redact));run=cloudVideoRunSchema.parse({...run,...observed,inputSnapshot:run.inputSnapshot,...(!run.executionFinishedAt&&observed.executionFinishedAt?{executionFinishedAt:clock().getTime()}:{}),updatedAt:clock().getTime()});
  }
  const reconciliation=(run.billingState==='pending_reconciliation'||run.billingState==='not_provided'&&reviewedCore(row.frozen_contract))&&['succeeded','failed_confirmed'].includes(run.executionState);
  await save(pool,row,cloudVideoRunSchema.parse(run),clock(),reconciliation);
 }catch(error){
  if(error instanceof HttpError&&error.code==='TASK_LEASE_CHANGED')return true;
  if(error instanceof UploadRetry&&row.phase==='submit'&&!sending){
   const exhausted=row.query_retry_count>=4,next=cloudVideoRunSchema.parse({...run,executionState:exhausted?'failed_confirmed':'persisted',queryState:'idle',billingState:'not_provided',...(exhausted?{issueCode:'UPLOAD_UNKNOWN',failure:{reasonCode:'video_not_submitted'},executionFinishedAt:clock().getTime()}:{}),updatedAt:clock().getTime()});
   await save(pool,row,next,clock(),true,error.retryAfterMs);return true;
  }
  if(error instanceof ContentBusy&&row.phase==='query'){await save(pool,row,run,clock(),true,error.retryAfterMs);return true;}
  const secretMissing=error instanceof HttpError&&error.code==='SECRET_UNAVAILABLE';
  if(row.phase==='delivery'){
   if(error instanceof ContentBusy){
    const next={...run,deliveryState:'not_ready' as const,updatedAt:clock().getTime()};
    try{await save(pool,row,cloudVideoRunSchema.parse(next),clock(),true,error.retryAfterMs);}catch(lost){if(!(lost instanceof HttpError&&lost.code==='TASK_LEASE_CHANGED'))throw lost;}return true;
   }
   const next={...run,...(run.deliveryState==='available_for_preview'?{}:{deliveryState:'download_failed' as const}),issueCode:'RESULT_SAVE_PENDING' as const,updatedAt:clock().getTime()};
   try{await save(pool,row,cloudVideoRunSchema.parse(next),clock(),true);}catch(lost){if(!(lost instanceof HttpError&&lost.code==='TASK_LEASE_CHANGED'))throw lost;}return true;
  }
  const expired=error instanceof HttpError&&error.code==='REFERENCE_EXPIRED',submission=row.phase==='submit',notSent=submission&&!sending||error instanceof HttpError&&['SECRET_UNAVAILABLE','OUTBOUND_BLOCKED','INVALID_API_KEY','INVALID_API_BASE','REFERENCE_CHANGED','REFERENCE_EXPIRED'].includes(error.code);
  const next={...run,...(submission?{executionState:notSent?'failed_confirmed' as const:'submit_unknown' as const,queryState:'interrupted' as const,billingState:notSent||!sending?'not_provided' as const:'pending_reconciliation' as const,...(notSent?{failure:{reasonCode:expired?'reference_asset_expired' as const:'video_not_submitted' as const},executionFinishedAt:clock().getTime()}:{} )}:secretMissing?{queryState:'auth_required' as const}:{}),issueCode:secretMissing?'SECRET_UNAVAILABLE' as const:error instanceof HttpError&&error.code==='OUTBOUND_BLOCKED'?'OUTBOUND_BLOCKED' as const:run.executionState==='uploading'?'UPLOAD_UNKNOWN' as const:'UPSTREAM_FAILED' as const,updatedAt:clock().getTime()};
  const recoveringRetry=submission&&sending&&!notSent;
  try{await save(pool,row,cloudVideoRunSchema.parse({...next,...(recoveringRetry?{queryState:'polling'}:{})}),clock(),recoveringRetry||!submission&&!secretMissing);}catch(lost){if(!(lost instanceof HttpError&&lost.code==='TASK_LEASE_CHANGED'))throw lost;}
 }
 return true;
}
export async function recoverExpiredVideoTasks(pool:Pool,now:Date){
 await transaction(pool,async db=>{
  const rows=await db.query<VideoRow>('SELECT user_id,id,document,frozen_config,lease_token FROM workspace_video_runs WHERE lease_token IS NOT NULL AND lease_until<$1 FOR UPDATE SKIP LOCKED',[now]);
  for(const row of rows.rows){
   const run=cloudVideoRunSchema.parse(row.document),upload=run.executionState==='uploading',submitting=run.executionState==='submitting';
   const next=cloudVideoRunSchema.parse({...run,...(upload?{executionState:'persisted',queryState:'idle',billingState:'not_provided'}:submitting?{executionState:'submit_unknown',queryState:run.retryOfCoreTaskId||run.finalBody&&run.finalBodyHash?'polling':'interrupted',billingState:'pending_reconciliation',issueCode:'UPSTREAM_FAILED'}:{}),recordRevision:run.recordRevision+1,updatedAt:now.getTime()});
   await db.query('UPDATE workspace_video_runs SET document=$3::jsonb,lease_token=NULL,lease_until=NULL,next_query_at=$4,updated_at=$4 WHERE user_id=$1 AND id=$2',[row.user_id,row.id,JSON.stringify(next),now]);
  }
 });
}
export function startVideoWorker(pool:Pool,dependencies:VideoTaskDependencies,clock:()=>Date=()=>new Date()){
 let stopped=false,recovery:Promise<void>|undefined;
 const inFlight=new Map<VideoLane,Promise<void>>();
 const tick=()=>{
  if(stopped)return;
  if(!recovery)recovery=recoverExpiredVideoTasks(pool,clock()).catch(()=>{}).finally(()=>{recovery=undefined;});
  // One bounded slot per kind; all instances still claim each run under a DB
  // lock and a shared lease. Slow upload/download never occupies the query slot.
  for(const lane of ['submit','query','delivery'] as const){if(inFlight.has(lane))continue;
   const work=executeNextVideoTask(pool,dependencies,clock,lane).then(()=>{}).catch(()=>{}).finally(()=>{inFlight.delete(lane);});inFlight.set(lane,work);
  }
 };
 const timer=setInterval(tick,500);timer.unref();tick();
 return {async stop(){stopped=true;clearInterval(timer);await Promise.all([...inFlight.values(),recovery]);}};
}
