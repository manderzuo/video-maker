import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool,PoolClient} from 'pg';
import type {AuthContext} from '../auth/context.js';
import {HttpError} from '../errors.js';
import {transaction} from '../db/transaction.js';
import type {ApiSettingsDependencies} from '../settings/service.js';
import {findConfig,readSecret,type ConfigRow} from '../settings/repository.js';
import {ownedContent} from '../prompts/repository.js';
import {promptDraftSchema} from '../prompts/contracts.js';
import {cloudTaskSchema,promptOptimizationPreviewSchema} from '../../../src/domain/cloud-task.js';
import {cloudRunSchema,type CloudRun} from '../../../src/domain/cloud-video-run.js';
import {buildPromptOptimizationRequest} from '../../../src/domain/prompt-engine/optimization-request.js';
export const optimizationInputSchema=z.strictObject({expectedRevision:z.number().int().nonnegative(),configRevision:z.number().int().positive(),referenceAliases:z.array(z.string()).max(100)});
export const optimizationDecisionSchema=z.strictObject({approvalId:z.uuid(),decision:z.strictObject({confirmed:z.literal(true),acknowledgeTextFee:z.literal(true),acknowledgePriorUnknown:z.literal(true).optional()})});
export async function userSecrets(db:Pool|PoolClient,userId:string,dependencies:ApiSettingsDependencies){const result=await db.query<{config_id:string;secret_version:number;key_version:string;nonce:Buffer;ciphertext:Buffer;tag:Buffer}>('SELECT config_id,secret_version,key_version,nonce,ciphertext,tag FROM api_secret_versions WHERE user_id=$1',[userId]);return result.rows.map(row=>dependencies.secrets.open({userId,configId:row.config_id,secretVersion:row.secret_version},{keyVersion:row.key_version,nonce:row.nonce,ciphertext:row.ciphertext,tag:row.tag}));}
export async function frozenTaskKey(pool:Pool,userId:string,config:ConfigRow,dependencies:ApiSettingsDependencies){const secret=await readSecret(pool,{userId,sessionId:'task',contextId:'task'},config);if(!secret)throw new HttpError(500,'SECRET_UNAVAILABLE');return dependencies.secrets.open({userId,configId:config.id,secretVersion:config.active_secret_version},secret);}
async function priorUnknown(db:Pool|PoolClient,userId:string,draftId:string){const rows=await db.query<{id:string}>("SELECT id FROM workspace_tasks WHERE user_id=$1 AND draft_id=$2 AND document->>'executionState' IN ('sending','response_unknown') ORDER BY id",[userId,draftId]);return rows.rows.map(row=>row.id);}
export async function ownedTask(db:Pool|PoolClient,context:AuthContext,id:string):Promise<CloudRun>{const rows=await db.query<{document:unknown}>('SELECT document FROM workspace_tasks WHERE user_id=$1 AND id::text=$2 UNION ALL SELECT document FROM workspace_video_runs WHERE user_id=$1 AND id::text=$2 UNION ALL SELECT document FROM workspace_task_archives WHERE user_id=$1 AND id::text=$2',[context.userId,id]);if(!rows.rows[0])throw new HttpError(404,'NOT_FOUND');return cloudRunSchema.parse(rows.rows[0].document);}
export async function listTasks(pool:Pool,context:AuthContext){const rows=await pool.query<{document:unknown}>("SELECT document FROM (SELECT document FROM workspace_tasks WHERE user_id=$1 UNION ALL SELECT document FROM workspace_video_runs WHERE user_id=$1 UNION ALL SELECT document FROM workspace_task_archives WHERE user_id=$1) AS owned ORDER BY (document->>'createdAt')::bigint DESC,document->>'id'",[context.userId]);return rows.rows.map(row=>cloudRunSchema.parse(row.document));}
export async function prepareOptimization(pool:Pool,context:AuthContext,draftId:string,input:z.infer<typeof optimizationInputSchema>,dependencies:ApiSettingsDependencies,now:Date){
 return transaction(pool,async db=>{
  const {row,document}=await ownedContent(db,context,draftId,'draft',true),draft=promptDraftSchema.parse(document);if(row.trashed_at)throw new HttpError(409,'CONTENT_IN_TRASH');if(draft.revision!==input.expectedRevision)throw new HttpError(409,'REVISION_CONFLICT');
  await db.query('SELECT id FROM api_configs WHERE user_id=$1 AND channel=$2 FOR SHARE',[context.userId,'text']);const config=await findConfig(db,context,'text');if(!config)throw new HttpError(422,'MODEL_CONFIG_REQUIRED');if(config.revision!==input.configRevision)throw new HttpError(409,'CONFIG_CHANGED');
  let body:string;try{body=buildPromptOptimizationRequest(draft,config.model,input.referenceAliases);}catch{throw new HttpError(422,'PROMPT_INPUT_INVALID');}
  if((await userSecrets(db,context.userId,dependencies)).some(key=>body.includes(key)||body.includes(JSON.stringify(key).slice(1,-1))))throw new HttpError(422,'INPUT_CONTAINS_CREDENTIAL');
  const preview=promptOptimizationPreviewSchema.parse({id:randomUUID(),draftId,draftRevision:draft.revision,configRevision:config.revision,apiBase:config.api_base,model:config.model,referenceAliases:input.referenceAliases,priorUnknownRunIds:await priorUnknown(db,context.userId,draftId),expiresAt:now.getTime()+120000});
  await db.query('INSERT INTO workspace_prompt_previews(user_id,id,draft_id,document,frozen_config,request_body) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)',[context.userId,preview.id,draftId,JSON.stringify(preview),JSON.stringify(config),body]);return preview;
 });
}
export async function confirmOptimization(pool:Pool,context:AuthContext,draftId:string,input:z.infer<typeof optimizationDecisionSchema>,now:Date){
 return transaction(pool,async db=>{
  const {row,document}=await ownedContent(db,context,draftId,'draft',true),draft=promptDraftSchema.parse(document);
  const rows=await db.query<{document:unknown;frozen_config:ConfigRow;request_body:string;task_id:string|null}>('SELECT document,frozen_config,request_body,task_id FROM workspace_prompt_previews WHERE user_id=$1 AND id=$2 AND draft_id=$3 FOR UPDATE',[context.userId,input.approvalId,draftId]);const stored=rows.rows[0];if(!stored)throw new HttpError(404,'NOT_FOUND');
  if(stored.task_id)return ownedTask(db,context,stored.task_id);
  const preview=promptOptimizationPreviewSchema.parse(stored.document);if(row.trashed_at)throw new HttpError(409,'CONTENT_IN_TRASH');if(preview.expiresAt<=now.getTime()||draft.revision!==preview.draftRevision)throw new HttpError(409,'PREVIEW_EXPIRED');
  await db.query('SELECT id FROM api_configs WHERE user_id=$1 AND channel=$2 FOR SHARE',[context.userId,'text']);const current=await findConfig(db,context,'text');if(!current||(['id','user_id','channel','api_base','model','revision','active_secret_version'] as const).some(key=>current[key]!==stored.frozen_config[key]))throw new HttpError(409,'CONFIG_CHANGED');
  const unknown=await priorUnknown(db,context.userId,draftId);if(JSON.stringify(unknown)!==JSON.stringify(preview.priorUnknownRunIds))throw new HttpError(409,'PREVIEW_EXPIRED');if(unknown.length&&!input.decision.acknowledgePriorUnknown)throw new HttpError(422,'PRIOR_UNKNOWN_CONFIRMATION_REQUIRED');
  const task=cloudTaskSchema.parse({id:randomUUID(),kind:'prompt-optimize',draftId,sourceRevision:preview.draftRevision,apiBase:preview.apiBase,model:preview.model,configRevision:preview.configRevision,secretVersion:current.active_secret_version,executionState:'persisted',billingState:'not_provided',createdAt:now.getTime(),updatedAt:now.getTime()});
  await db.query('INSERT INTO workspace_tasks(user_id,id,draft_id,config_id,secret_version,frozen_config,request_body,document,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$9)',[context.userId,task.id,draftId,current.id,current.active_secret_version,JSON.stringify(current),stored.request_body,JSON.stringify(task),now]);await db.query('UPDATE workspace_prompt_previews SET task_id=$3 WHERE user_id=$1 AND id=$2',[context.userId,preview.id,task.id]);return task;
 });
}
