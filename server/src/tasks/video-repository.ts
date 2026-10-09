import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool,PoolClient} from 'pg';
import type {AuthContext} from '../auth/context.js';
import {HttpError} from '../errors.js';
import {transaction} from '../db/transaction.js';
import type {ApiSettingsDependencies} from '../settings/service.js';
import {findConfig,type ConfigRow} from '../settings/repository.js';
import {userSecrets} from './prompt-repository.js';
import {frozenTaskKey} from './prompt-repository.js';
import {ownedProject,readProjectGraph} from '../projects/repository.js';
import {listAssets,ownedAsset,manifests} from '../assets/repository.js';
import {verifyAssetFile,type AssetStorageOptions} from '../assets/storage.js';
import {deploymentContractSchema,type DeploymentContract} from '../../../src/adapters/core/capabilities.js';
import {preflightRun} from '../../../src/application/runs/preflight.js';
import {resolvedInputAssetId} from '../../../src/domain/graph-validation.js';
import {validateResources} from '../projects/commands.js';
import {cloudVideoRunSchema,cloudVideoPreviewSchema} from '../../../src/domain/cloud-video-run.js';
export type VideoTaskDependencies=ApiSettingsDependencies&{assets:AssetStorageOptions;contracts:ReadonlyMap<string,DeploymentContract>};
export const videoPreviewInputSchema=z.strictObject({expectedRevision:z.number().int().nonnegative(),configRevision:z.number().int().positive(),nodeIds:z.array(z.uuid()).min(1).max(10)});
export const videoConfirmationSchema=z.strictObject({approvalId:z.uuid(),decision:z.strictObject({confirmed:z.literal(true),acknowledgeVideoFee:z.literal(true),acknowledgePriorUnknown:z.literal(true).optional()})});
async function priorRuns(db:Pool|PoolClient,context:AuthContext,projectId:string){const rows=await db.query<{document:unknown}>('SELECT document FROM workspace_video_runs WHERE user_id=$1 AND project_id=$2 ORDER BY id',[context.userId,projectId]);return rows.rows.map(row=>cloudVideoRunSchema.parse(row.document));}
export async function ownedVideoRun(db:Pool|PoolClient,context:AuthContext,id:string){const rows=await db.query<{document:unknown}>('SELECT document FROM workspace_video_runs WHERE user_id=$1 AND id::text=$2',[context.userId,id]);if(!rows.rows[0])throw new HttpError(404,'NOT_FOUND');return cloudVideoRunSchema.parse(rows.rows[0].document);}
function reviewedContract(dependencies:VideoTaskDependencies,base:string){const parsed=deploymentContractSchema.safeParse(dependencies.contracts.get(base));return parsed.success&&parsed.data.verification!=='unknown'&&parsed.data.evidence.some(e=>['deployment_review','live_probe','mock'].includes(e.kind))&&(parsed.data.verification!=='live_verified'||parsed.data.evidence.some(e=>e.kind==='live_probe'))?parsed.data:undefined;}
export async function videoCapability(pool:Pool,context:AuthContext,dependencies:VideoTaskDependencies){const config=await findConfig(pool,context,'video');if(!config)throw new HttpError(422,'MODEL_CONFIG_REQUIRED');const policy=reviewedContract(dependencies,config.api_base),verified=!!policy&&policy.routes.videoSubmit&&policy.routes.videoQuery&&policy.routes.videoContent;return {configRevision:config.revision,apiBase:config.api_base,model:config.model,verified,videoSpecs:verified?policy.videoSpecs.filter(spec=>spec.modelId===config.model):[],...(verified&&policy?{limits:{...policy.limits}}:{})};}
export async function prepareVideoPreview(pool:Pool,context:AuthContext,projectId:string,input:z.infer<typeof videoPreviewInputSchema>,dependencies:VideoTaskDependencies,now:Date){
 return transaction(pool,async db=>{
  await db.query('SELECT id FROM workspace_projects WHERE user_id=$1 AND id::text=$2 AND purged_at IS NULL FOR SHARE',[context.userId,projectId]);const project=await ownedProject(db,context,projectId),graph=await readProjectGraph(db,context,projectId);if(project.trashedAt!=null)throw new HttpError(409,'PROJECT_IN_TRASH');if(graph.revision!==input.expectedRevision)throw new HttpError(409,'REVISION_CONFLICT');
  await db.query("SELECT id FROM api_configs WHERE user_id=$1 AND channel='video' FOR SHARE",[context.userId]);const config=await findConfig(db,context,'video');if(!config)throw new HttpError(422,'MODEL_CONFIG_REQUIRED');if(config.revision!==input.configRevision)throw new HttpError(409,'CONFIG_CHANGED');
  const policy=reviewedContract(dependencies,config.api_base);if(!policy)throw new HttpError(422,'VIDEO_CONTRACT_UNVERIFIED');
  const capability={contractVersion:policy.version,verification:policy.verification,textModels:policy.textModels,videoModels:policy.routes.videoSubmit&&policy.routes.videoQuery&&policy.routes.videoContent?policy.videoModels:[],videoAliases:policy.videoAliases,videoSpecs:policy.videoSpecs,workContext:policy.routes.workContext,continuation:policy.routes.continuation,imageGeneration:false as const,audioGeneration:false as const,cancelVideo:false as const,backup:policy.routes.backup,limits:{...policy.limits,...(!policy.routes.assets?{assetBytes:undefined}:{})}};
  await validateResources(db,context,graph);
  const assets=await listAssets(pool,context,false),readable:string[]=[];
  const referenced=new Set(graph.edges.filter(edge=>input.nodeIds.includes(edge.targetId)&&!edge.relation).flatMap(edge=>{const node=graph.nodes.find(node=>node.id===edge.sourceId);return node&&(node.type==='asset'||node.type==='result')?[node.data.assetId,resolvedInputAssetId(node,edge.port)!]:[];}));
  for(const id of [...referenced].sort()){await db.query('SELECT id FROM workspace_assets WHERE user_id=$1 AND id::text=$2 FOR SHARE',[context.userId,id]);const row=await ownedAsset(db,context,id),{original}=manifests(row);if(row.state!=='complete')throw new HttpError(404,'NOT_FOUND');await verifyAssetFile(dependencies.assets,context.userId,id,'original',original);readable.push(id);}
  const result=preflightRun({graph,nodeIds:input.nodeIds,assets,readableAssetIds:readable,capability,connection:{id:config.id,name:'当前用户视频 API',originSnapshot:new URL(config.api_base).origin,proxyBase:'/studio-api',contractVersion:policy.version},binding:{id:config.id+':'+config.active_secret_version,connectionId:config.id,originSnapshot:new URL(config.api_base).origin,kind:'core-user',createdAt:now.getTime()},canWrite:true,credentialAvailable:true,priorRuns:await priorRuns(db,context,projectId)});
  if(result.status==='blocked')throw new HttpError(422,'VIDEO_PREFLIGHT_BLOCKED',[...new Set(result.issues.map(issue=>issue.message))].slice(0,30));if(result.plan.nodes.some(node=>node.inputSnapshot.spec.modelId!==config.model))throw new HttpError(409,'VIDEO_MODEL_CHANGED');
  const document=cloudVideoPreviewSchema.parse({id:randomUUID(),projectId,graphRevision:graph.revision,configRevision:config.revision,apiBase:config.api_base,model:config.model,contractVersion:policy.version,expiresAt:now.getTime()+120000,priorUnknownRunIds:result.plan.priorUnknownRunIds,nodes:result.plan.nodes});
  const serialized=JSON.stringify(document);if((await userSecrets(db,context.userId,dependencies)).some(key=>serialized.includes(key)||serialized.includes(JSON.stringify(key).slice(1,-1))))throw new HttpError(422,'INPUT_CONTAINS_CREDENTIAL');
  await db.query('INSERT INTO workspace_video_previews(user_id,id,project_id,document,frozen_config,frozen_contract) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)',[context.userId,document.id,projectId,serialized,JSON.stringify(config),JSON.stringify(policy)]);return document;
 });
}
export async function confirmVideoPreview(pool:Pool,context:AuthContext,projectId:string,input:z.infer<typeof videoConfirmationSchema>,dependencies:VideoTaskDependencies,now:Date){
 return transaction(pool,async db=>{
  await db.query('SELECT id FROM workspace_projects WHERE user_id=$1 AND id::text=$2 AND purged_at IS NULL FOR UPDATE',[context.userId,projectId]);const project=await ownedProject(db,context,projectId);
  const rows=await db.query<{document:unknown;frozen_config:ConfigRow;frozen_contract:DeploymentContract;consumed_runs:string[]|null}>('SELECT document,frozen_config,frozen_contract,consumed_runs FROM workspace_video_previews WHERE user_id=$1 AND id=$2 AND project_id=$3 FOR UPDATE',[context.userId,input.approvalId,projectId]);const stored=rows.rows[0];if(!stored)throw new HttpError(404,'NOT_FOUND');if(stored.consumed_runs)return Promise.all(stored.consumed_runs.map(id=>ownedVideoRun(db,context,id)));
  const preview=cloudVideoPreviewSchema.parse(stored.document);if(project.trashedAt!=null)throw new HttpError(409,'PROJECT_IN_TRASH');if(preview.expiresAt<=now.getTime()||project.revision!==preview.graphRevision)throw new HttpError(409,'PREVIEW_EXPIRED');
  await db.query("SELECT id FROM api_configs WHERE user_id=$1 AND channel='video' FOR SHARE",[context.userId]);const config=await findConfig(db,context,'video');if(!config||(['id','user_id','api_base','model','revision','active_secret_version'] as const).some(key=>config[key]!==stored.frozen_config[key])||dependencies.contracts.get(config.api_base)?.version!==preview.contractVersion)throw new HttpError(409,'CONFIG_CHANGED');
  const unknown=(await priorRuns(db,context,projectId)).filter(run=>preview.nodes.some(node=>node.nodeId===run.nodeId)&&['submitting','submit_unknown'].includes(run.executionState)).map(run=>run.id).sort();if(JSON.stringify(unknown)!==JSON.stringify(preview.priorUnknownRunIds))throw new HttpError(409,'PREVIEW_EXPIRED');if(unknown.length&&!input.decision.acknowledgePriorUnknown)throw new HttpError(422,'PRIOR_UNKNOWN_CONFIRMATION_REQUIRED');
  const runs=[];for(const node of preview.nodes){
   for(const asset of node.assets){const row=await ownedAsset(db,context,asset.assetId);if(row.state!=='complete'||manifests(row).asset.trashedAt!=null)throw new HttpError(404,'NOT_FOUND');}
   const run=cloudVideoRunSchema.parse({id:randomUUID(),kind:'video',projectId,nodeId:node.nodeId,graphRevision:preview.graphRevision,connectionId:config.id,authBindingId:config.id+':'+config.active_secret_version,originSnapshot:new URL(config.api_base).origin,configRevision:config.revision,secretVersion:config.active_secret_version,idempotencyKey:'studio-video-'+randomUUID(),inputSnapshot:node.inputSnapshot,requestedSpec:node.inputSnapshot.spec,executionSpec:node.inputSnapshot.spec,executionState:'persisted',queryState:'idle',deliveryState:'not_ready',billingState:'not_provided',createdAt:now.getTime(),updatedAt:now.getTime()});
   await db.query('INSERT INTO workspace_video_runs(user_id,id,project_id,config_id,secret_version,frozen_config,frozen_contract,document,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$9)',[context.userId,run.id,projectId,config.id,config.active_secret_version,JSON.stringify(config),JSON.stringify(stored.frozen_contract),JSON.stringify(run),now]);
   for(const asset of node.assets)await db.query('INSERT INTO workspace_asset_references(user_id,project_id,asset_id,source_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[context.userId,projectId,asset.assetId,'run:'+run.id]);runs.push(run);
  }
  await db.query('UPDATE workspace_video_previews SET consumed_runs=$3 WHERE user_id=$1 AND id=$2',[context.userId,preview.id,runs.map(run=>run.id)]);return runs;
 });
}
export async function controlVideoTask(pool:Pool,context:AuthContext,id:string,expectedRevision:number,action:'pause'|'resume'|'withdraw',dependencies:VideoTaskDependencies,now:Date){
 return transaction(pool,async db=>{
  const rows=await db.query<{document:unknown;frozen_config:ConfigRow;lease_token:string|null}>('SELECT document,frozen_config,lease_token FROM workspace_video_runs WHERE user_id=$1 AND id::text=$2 FOR UPDATE',[context.userId,id]);const row=rows.rows[0];if(!row)throw new HttpError(404,'NOT_FOUND');const run=cloudVideoRunSchema.parse(row.document);if(run.recordRevision!==expectedRevision)throw new HttpError(409,'REVISION_CONFLICT');
  if(action==='withdraw'&&(run.executionState!=='persisted'||row.lease_token))throw new HttpError(409,'TASK_ALREADY_STARTED');
  if(action==='pause'&&!run.taskId)throw new HttpError(409,'ORIGINAL_TASK_ID_REQUIRED');
  if(action==='resume'){if(!run.taskId)throw new HttpError(409,'ORIGINAL_TASK_ID_REQUIRED');await frozenTaskKey(pool,context.userId,row.frozen_config,dependencies);}
  const next=cloudVideoRunSchema.parse({...run,...(action==='withdraw'?{executionState:'failed_confirmed',queryState:'idle',failure:{reasonCode:'video_not_submitted'},billingState:'not_provided',executionFinishedAt:now.getTime()}:{queryState:action==='pause'?'paused_by_user':'polling'}),recordRevision:run.recordRevision+1,updatedAt:now.getTime()});
  await db.query('UPDATE workspace_video_runs SET document=$3::jsonb,lease_token=NULL,lease_until=NULL,next_query_at=$4,updated_at=$4 WHERE user_id=$1 AND id=$2',[context.userId,id,JSON.stringify(next),now]);return next;
 });
}
