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
import {ownedAsset,manifests,reserveVideoResult,completeAsset} from '../assets/repository.js';
import {verifyAssetFile,writeAssetFile} from '../assets/storage.js';
import {detectMediaMime} from '../../../src/features/assets/media-probe.js';
import {ownedProject,readProjectGraph} from '../projects/repository.js';
import {applyProjectCommandInTransaction} from '../projects/commands.js';
import {projectCommandSchema} from '../projects/contracts.js';
import {resultPlacement} from '../../../src/features/workspace/cloud-result-actions.js';
type VideoRow={user_id:string;id:string;document:unknown;frozen_config:ConfigRow&{canvasAutoPlace?:boolean};lease_token:string};
const owner=(userId:string)=>({userId,sessionId:'persistent-video',contextId:'persistent-video'});
function safeRedactor(keys:string[]){return (text:string)=>{for(const key of keys)text=text.split(key).join('[已隐藏密钥]');return text.replace(/Bearer\s+[^\s,;"']+/gi,'Bearer [已隐藏密钥]');};}
async function save(pool:Pool,row:VideoRow,run:CloudVideoRun,at:Date){return pool.query("UPDATE workspace_video_runs SET document=jsonb_set($4::jsonb,'{recordRevision}',to_jsonb(COALESCE((document->>'recordRevision')::integer,0)+1)),lease_until=NULL,lease_token=NULL,next_query_at=$5,updated_at=$6 WHERE user_id=$1 AND id=$2 AND lease_token=$3",[row.user_id,row.id,row.lease_token,JSON.stringify(run),new Date(at.getTime()+3000),at]);}
async function stage(pool:Pool,row:VideoRow,run:CloudVideoRun,at:Date){const result=await pool.query("UPDATE workspace_video_runs SET document=jsonb_set($4::jsonb,'{recordRevision}',to_jsonb(COALESCE((document->>'recordRevision')::integer,0)+1)),updated_at=$5,lease_until=$6 WHERE user_id=$1 AND id=$2 AND lease_token=$3",[row.user_id,row.id,row.lease_token,JSON.stringify(run),at,new Date(at.getTime()+150000)]);if(result.rowCount!==1)throw new HttpError(409,'TASK_LEASE_CHANGED');}
async function prepareReferences(pool:Pool,row:VideoRow,run:CloudVideoRun,dependencies:VideoTaskDependencies,key:string,redact:(input:string)=>string,clock:()=>Date){
 const refs=run.inputSnapshot.references,files=[];
 for(const ref of refs){const stored=await ownedAsset(pool,owner(row.user_id),ref.assetId),{asset,original}=manifests(stored);if(stored.state!=='complete'||asset.trashedAt!=null||asset.sha256!==ref.sha256||asset.bytes!==ref.bytes||!['image','video'].includes(asset.mediaType))throw new HttpError(409,'REFERENCE_CHANGED');const path=await verifyAssetFile(dependencies.assets,row.user_id,ref.assetId,'original',original);files.push({asset,path});}
 const mappings:{coreAssetId:string}[]=[];
 for(const {asset,path}of files){
  const prior=await pool.query<{state:string;remote_id:string|null}>('SELECT state,remote_id FROM workspace_video_uploads WHERE user_id=$1 AND run_id=$2 AND asset_id=$3',[row.user_id,row.id,asset.id]);if(prior.rows[0]){if(prior.rows[0].state!=='succeeded'||!prior.rows[0].remote_id)throw new HttpError(409,'UPLOAD_UNKNOWN');mappings.push({coreAssetId:prior.rows[0].remote_id});continue;}
  await stage(pool,row,run,clock());await pool.query("INSERT INTO workspace_video_uploads(user_id,run_id,asset_id,state) VALUES($1,$2,$3,'sending')",[row.user_id,row.id,asset.id]);
  const bytes=await readFile(path),extension=asset.mimeType.split('/')[1],body=JSON.stringify({filename:asset.sha256+'.'+extension,mime_type:asset.mimeType,data_base64:bytes.toString('base64')});
  const reply=await dependencies.outbound.video(row.frozen_config.api_base,key,{kind:'asset',body});if(reply.status<200||reply.status>=300)throw new HttpError(409,'UPLOAD_UNKNOWN');
  const parsed=z.object({object:z.literal('asset'),id:z.string().regex(/^[-A-Za-z0-9._~]{1,256}$/),sha256:z.string(),bytes:z.number(),mime_type:z.string(),created_at:z.number(),expires_at:z.number()}).safeParse(JSON.parse(reply.body.toString('utf8')));
  if(!parsed.success||redact(parsed.data.id)!==parsed.data.id||parsed.data.sha256!==asset.sha256||parsed.data.bytes!==asset.bytes||parsed.data.mime_type!==asset.mimeType||!Number.isSafeInteger(parsed.data.expires_at*1000)||parsed.data.expires_at*1000<=clock().getTime()+5000||parsed.data.created_at>parsed.data.expires_at)throw new HttpError(409,'UPLOAD_UNKNOWN');
  await pool.query("UPDATE workspace_video_uploads SET state='succeeded',remote_id=$4 WHERE user_id=$1 AND run_id=$2 AND asset_id=$3",[row.user_id,row.id,asset.id,parsed.data.id]);mappings.push({coreAssetId:parsed.data.id});
 }
 return mappings;
}
async function copyResult(pool:Pool,row:VideoRow,run:CloudVideoRun,dependencies:VideoTaskDependencies,key:string,now:Date){
 const prior=await pool.query<{id:string;state:string}>("SELECT id,state FROM workspace_assets WHERE user_id=$1 AND document->>'sourceRunId'=$2",[row.user_id,run.id]);let asset;
 if(prior.rows[0]?.state==='complete'){const stored=await ownedAsset(pool,owner(row.user_id),prior.rows[0].id),files=manifests(stored);await verifyAssetFile(dependencies.assets,row.user_id,stored.id,'original',files.original);asset=files.asset;}
 else{
  if(!run.taskId)throw new HttpError(409,'TASK_ID_REQUIRED');const reply=await dependencies.outbound.video(row.frozen_config.api_base,key,{kind:'content',taskId:run.taskId},Math.min(dependencies.assets.maxAssetBytes,200*1024*1024));if(reply.status<200||reply.status>=300)throw new HttpError(502,'UPSTREAM_FAILED');const mimeType=detectMediaMime(reply.body.subarray(0,128));if(!mimeType||!mimeType.startsWith('video/'))throw new HttpError(400,'UPLOAD_INVALID');const manifest={sha256:createHash('sha256').update(reply.body).digest('hex'),bytes:reply.body.length,mimeType};
  const pending=await reserveVideoResult(pool,owner(row.user_id),run.id,manifest,dependencies.assets,now);await writeAssetFile(dependencies.assets,row.user_id,pending.id,'original',manifest,Readable.from(reply.body));asset=await completeAsset(pool,owner(row.user_id),pending.id,dependencies.assets);
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
export async function executeNextVideoTask(pool:Pool,dependencies:VideoTaskDependencies,clock:()=>Date=()=>new Date()){
 const now=clock(),row=await transaction(pool,async db=>{
  const result=await db.query<VideoRow>("SELECT v.user_id,v.id,v.document,v.frozen_config,v.lease_token FROM workspace_video_runs v WHERE v.lease_token IS NULL AND (v.document->>'executionState'='persisted' OR (v.document->>'taskId' IS NOT NULL AND v.document->>'queryState' NOT IN ('paused_by_user','auth_required','interrupted') AND (v.next_query_at IS NULL OR v.next_query_at<=$1) AND (v.document->>'executionState' IN ('accepted','running') OR v.document->>'billingState'='pending_reconciliation' OR v.document->>'executionState'='succeeded' AND v.document->>'deliveryState'<>'available_for_preview')) OR ((v.next_query_at IS NULL OR v.next_query_at<=$1) AND v.frozen_config->>'canvasAutoPlace'='true' AND v.document->>'executionState'='succeeded' AND v.document->>'deliveryState'='available_for_preview' AND NOT EXISTS(SELECT 1 FROM workspace_command_receipts c WHERE c.user_id=v.user_id AND c.id=v.id) AND EXISTS(SELECT 1 FROM workspace_projects p WHERE p.user_id=v.user_id AND p.id=v.project_id AND p.trashed_at IS NULL AND p.purged_at IS NULL))) ORDER BY CASE WHEN v.document->>'executionState'='persisted' THEN 0 ELSE 1 END,v.created_at,v.id LIMIT 1 FOR UPDATE OF v SKIP LOCKED",[now]);const stored=result.rows[0];if(!stored)return undefined;
  const current=cloudVideoRunSchema.parse(stored.document),run=current.executionState==='persisted'?{...current,executionState:current.inputSnapshot.references.length?'uploading' as const:'submitting' as const,updatedAt:now.getTime()}:current,token=randomUUID();await db.query("UPDATE workspace_video_runs SET document=jsonb_set($3::jsonb,'{recordRevision}',to_jsonb(COALESCE((document->>'recordRevision')::integer,0)+1)),lease_token=$4,lease_until=$5 WHERE user_id=$1 AND id=$2",[stored.user_id,stored.id,JSON.stringify(run),token,new Date(now.getTime()+150000)]);return {...stored,document:run,lease_token:token};
 });if(!row)return false;
 let run=cloudVideoRunSchema.parse(row.document),sending=false;
 try{
  // Placement retries use only local transactions; they never repeat a paid
  // submission, download or upstream query, and still work after key rotation.
  if(run.executionState==='succeeded'&&run.deliveryState==='available_for_preview'&&run.billingState!=='pending_reconciliation'){
   try{await placeCanvasResult(pool,row,run,clock());}catch{/* Retry the local placement, preserving delivery and billing. */}
   await save(pool,row,run,clock());return true;
  }
  const key=await frozenTaskKey(pool,row.user_id,row.frozen_config,dependencies),redact=safeRedactor(await userSecrets(pool,row.user_id,dependencies));
  if(['uploading','submitting'].includes(run.executionState)){
   const mappings=await prepareReferences(pool,row,run,dependencies,key,redact,clock),finalBody=run.finalBody??buildVideoRequestBody(run.inputSnapshot,mappings);
   run={...run,finalBody,finalBodyHash:createHash('sha256').update(finalBody).digest('hex'),executionState:'submitting',updatedAt:clock().getTime()};await stage(pool,row,run,clock());sending=true;
   const reply=await dependencies.outbound.video(row.frozen_config.api_base,key,{kind:'submit',body:finalBody,idempotencyKey:run.idempotencyKey});
   if(reply.status<200||reply.status>=300){const failure=classifyCoreError(reply.status,JSON.parse(reply.body.toString('utf8')),undefined,redact);run={...run,executionState:failure.submissionOutcome==='not_sent'?'failed_confirmed':'submit_unknown',queryState:'interrupted',billingState:failure.submissionOutcome==='not_sent'?'not_provided':'pending_reconciliation',...(failure.submissionOutcome==='not_sent'?{failure:{reasonCode:'video_not_submitted' as const},executionFinishedAt:clock().getTime()}:{}),updatedAt:clock().getTime()};}
   else{const observed=observeVideoTask(run,parseVideoTask(JSON.parse(reply.body.toString('utf8')),redact));run=cloudVideoRunSchema.parse({...run,...observed,inputSnapshot:run.inputSnapshot,...(!run.executionFinishedAt&&observed.executionFinishedAt?{executionFinishedAt:clock().getTime()}:{}),updatedAt:clock().getTime()});}
  }else if(run.taskId){
   const reply=await dependencies.outbound.video(row.frozen_config.api_base,key,{kind:'query',taskId:run.taskId});if(reply.status===401||reply.status===403){run={...run,queryState:'auth_required',updatedAt:clock().getTime()};await save(pool,row,run,clock());return true;}if(reply.status<200||reply.status>=300)throw new HttpError(502,'UPSTREAM_FAILED');
   const observed=observeVideoTask(run,parseVideoTask(JSON.parse(reply.body.toString('utf8')),redact));run=cloudVideoRunSchema.parse({...run,...observed,inputSnapshot:run.inputSnapshot,...(!run.executionFinishedAt&&observed.executionFinishedAt?{executionFinishedAt:clock().getTime()}:{}),updatedAt:clock().getTime()});
  }
  if(run.executionState==='succeeded'&&run.deliveryState!=='available_for_preview'){await stage(pool,row,{...run,deliveryState:'fetching'},clock());try{run=await copyResult(pool,row,run,dependencies,key,clock());}catch{run={...run,deliveryState:'download_failed',issueCode:'RESULT_SAVE_PENDING',updatedAt:clock().getTime()};}}
  if(run.executionState==='succeeded'&&run.deliveryState==='available_for_preview'){
   await stage(pool,row,run,clock());
   try{await placeCanvasResult(pool,row,run,clock());}catch{/* The available result stays intact and the local placement is retried. */}
  }
  await save(pool,row,cloudVideoRunSchema.parse(run),clock());
 }catch(error){
  const notSent=error instanceof HttpError&&['SECRET_UNAVAILABLE','OUTBOUND_BLOCKED','INVALID_API_KEY','INVALID_API_BASE','REFERENCE_CHANGED'].includes(error.code),submission=['submitting','uploading'].includes(run.executionState);
  const secretMissing=error instanceof HttpError&&error.code==='SECRET_UNAVAILABLE';
  const next={...run,...(submission?{executionState:notSent?'failed_confirmed' as const:'submit_unknown' as const,queryState:'interrupted' as const,billingState:notSent||!sending?'not_provided' as const:'pending_reconciliation' as const,...(notSent?{failure:{reasonCode:'video_not_submitted' as const},executionFinishedAt:clock().getTime()}:{} )}:secretMissing?{queryState:'auth_required' as const}:{}),issueCode:secretMissing?'SECRET_UNAVAILABLE' as const:error instanceof HttpError&&error.code==='OUTBOUND_BLOCKED'?'OUTBOUND_BLOCKED' as const:run.executionState==='uploading'?'UPLOAD_UNKNOWN' as const:'UPSTREAM_FAILED' as const,updatedAt:clock().getTime()};await save(pool,row,cloudVideoRunSchema.parse(next),clock());
 }
 return true;
}
export async function recoverExpiredVideoTasks(pool:Pool,now:Date){
 await transaction(pool,async db=>{
  const rows=await db.query<VideoRow>('SELECT user_id,id,document,frozen_config,lease_token FROM workspace_video_runs WHERE lease_token IS NOT NULL AND lease_until<$1 FOR UPDATE SKIP LOCKED',[now]);
  for(const row of rows.rows){const run=cloudVideoRunSchema.parse(row.document),uncertain=['uploading','submitting'].includes(run.executionState),next=cloudVideoRunSchema.parse({...run,...(uncertain?{executionState:'submit_unknown',queryState:'interrupted',billingState:run.executionState==='uploading'?'not_provided':'pending_reconciliation',issueCode:run.executionState==='uploading'?'UPLOAD_UNKNOWN':'UPSTREAM_FAILED'}:{}),recordRevision:run.recordRevision+1,updatedAt:now.getTime()});await db.query('UPDATE workspace_video_runs SET document=$3::jsonb,lease_token=NULL,lease_until=NULL,next_query_at=$4,updated_at=$4 WHERE user_id=$1 AND id=$2',[row.user_id,row.id,JSON.stringify(next),now]);}
 });
}
export function startVideoWorker(pool:Pool,dependencies:VideoTaskDependencies,clock:()=>Date=()=>new Date()){
 let stopped=false,inFlight:Promise<void>|undefined;const tick=()=>{if(stopped||inFlight)return;inFlight=(async()=>{await recoverExpiredVideoTasks(pool,clock());await executeNextVideoTask(pool,dependencies,clock);})().catch(()=>{}).finally(()=>{inFlight=undefined;});};const timer=setInterval(tick,500);timer.unref();tick();return {async stop(){stopped=true;clearInterval(timer);await inFlight;}};
}
