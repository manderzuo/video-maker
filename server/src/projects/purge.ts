import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {AuthContext} from '../auth/context.js';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import {ownedProject} from './repository.js';
import {purgePreviewSchema,purgeReceiptSchema,type PurgePreview,type PurgeReceipt} from './contracts.js';
// 非终态即阻止删除：终态只有 succeeded 与 failed_confirmed，其余（含未知）一律保护。
type Impact={projectId:string;title:string;revision:number;nodeCount:number;assetCount:number;receiptCount:number;blockingVideo:string[];blockingAgent:string[]};
function impactToken(impact:Impact){return createHash('sha256').update(JSON.stringify([impact.projectId,impact.title,impact.revision,impact.nodeCount,impact.assetCount,impact.receiptCount,impact.blockingVideo,impact.blockingAgent])).digest('hex');}
async function impactOf(pool:Pool|PoolClient,context:AuthContext,id:string):Promise<{project:{id:string;title:string;revision:number;trashedAt:number|null};impact:Impact}>{
 const project=await ownedProject(pool,context,id);
 const graph=await pool.query<{graph:unknown;nodes:number}>(`SELECT graph,jsonb_array_length(graph->'nodes') AS nodes FROM workspace_graphs WHERE user_id=$1 AND project_id=$2`,[context.userId,id]);
 if(!graph.rows[0])throw new HttpError(404,'NOT_FOUND');
 const nodes=graph.rows[0].graph as {nodes:{type:string;data:{assetId?:string}}[]};
 const assets=new Set<string>();
 for(const node of nodes.nodes)if((node.type==='asset'||node.type==='result')&&typeof node.data.assetId==='string')assets.add(node.data.assetId);
 const receipts=await pool.query('SELECT COUNT(*)::int AS n FROM workspace_command_receipts WHERE user_id=$1 AND project_id=$2',[context.userId,id]);
 const blockingVideo=(await pool.query<{id:string}>(`SELECT id FROM workspace_video_runs WHERE user_id=$1 AND project_id=$2 AND COALESCE(document->>'executionState','') NOT IN ('succeeded','failed_confirmed')`,[context.userId,id])).rows.map(row=>row.id);
 const blockingAgent=(await pool.query<{id:string}>(`SELECT r.id FROM workspace_agent_runs r JOIN workspace_agent_conversations c ON c.user_id=r.user_id AND c.id=r.conversation_id WHERE r.user_id=$1 AND c.project_id=$2 AND COALESCE(r.document->>'executionState','') NOT IN ('succeeded','failed_confirmed')`,[context.userId,id])).rows.map(row=>row.id);
 const impact:Impact={projectId:id,title:project.title,revision:project.revision,nodeCount:nodes.nodes.length,assetCount:assets.size,receiptCount:receipts.rows[0]?.n??0,blockingVideo,blockingAgent};
 return {project,impact};
}
export async function inspectPurge(pool:Pool,context:AuthContext,id:string):Promise<PurgePreview>{
 const {project,impact}=await impactOf(pool,context,id);
 if(project.trashedAt===null)throw new HttpError(409,'PROJECT_NOT_IN_TRASH');
 const blocking=[...impact.blockingVideo.map(runId=>'视频任务 '+runId),...impact.blockingAgent.map(runId=>'Agent 任务 '+runId)];
 return purgePreviewSchema.parse({projectId:id,title:project.title,revision:project.revision,nodeCount:impact.nodeCount,assetCount:impact.assetCount,receiptCount:impact.receiptCount,blockingReasons:blocking,impactToken:impactToken(impact)});
}
export async function confirmPurge(pool:Pool,context:AuthContext,id:string,input:{title:string;expectedRevision:number;impactToken:string;confirmed:boolean;idempotencyKey:string},now:Date):Promise<PurgeReceipt>{
 return transaction(pool,async client=>{
  const prior=await client.query<{fingerprint:string}>('SELECT fingerprint FROM workspace_project_purges WHERE user_id=$1 AND id=$2',[context.userId,input.idempotencyKey]);
  if(prior.rows[0]){
   const receipt=await client.query<{project_id:string;revision:number;node_count:number;created_at:Date}>('SELECT project_id,revision,node_count,created_at FROM workspace_project_purges WHERE user_id=$1 AND id=$2',[context.userId,input.idempotencyKey]);
   const expected=createHash('sha256').update(JSON.stringify({projectId:id,title:input.title,revision:input.expectedRevision,impactToken:input.impactToken})).digest('hex');
   if(prior.rows[0].fingerprint!==expected)throw new HttpError(409,'IDEMPOTENCY_CONFLICT');
   return purgeReceiptSchema.parse({id:input.idempotencyKey,projectId:receipt.rows[0].project_id,revision:receipt.rows[0].revision,nodeCount:receipt.rows[0].node_count,createdAt:receipt.rows[0].created_at.getTime()});
  }
  const project=await ownedProject(client,context,id,true,true);
  if(project.trashedAt===null)throw new HttpError(409,'PROJECT_NOT_IN_TRASH');
  // 锁后先复查幂等：并发同 key 在锁前都读不到，先行者提交后后来者在此重放同一收据。
  const replay=await client.query<{project_id:string;revision:number;node_count:number;fingerprint:string;created_at:Date}>('SELECT project_id,revision,node_count,fingerprint,created_at FROM workspace_project_purges WHERE user_id=$1 AND id=$2',[context.userId,input.idempotencyKey]);
  if(replay.rows[0]){
   const expected=createHash('sha256').update(JSON.stringify({projectId:id,title:input.title,revision:input.expectedRevision,impactToken:input.impactToken})).digest('hex');
   if(replay.rows[0].fingerprint!==expected)throw new HttpError(409,'IDEMPOTENCY_CONFLICT');
   return purgeReceiptSchema.parse({id:input.idempotencyKey,projectId:replay.rows[0].project_id,revision:replay.rows[0].revision,nodeCount:replay.rows[0].node_count,createdAt:replay.rows[0].created_at.getTime()});
  }
  const existing=await client.query('SELECT purged_at FROM workspace_projects WHERE user_id=$1 AND id=$2',[context.userId,id]);
  if(existing.rows[0]?.purged_at)throw new HttpError(410,'PROJECT_PURGED');
  if(project.title!==input.title)throw new HttpError(422,'TITLE_MISMATCH');
  if(project.revision!==input.expectedRevision)throw new HttpError(409,'REVISION_CONFLICT');
  const {impact}=await impactOf(client,context,id);
  if(impactToken(impact)!==input.impactToken)throw new HttpError(409,'IMPACT_CHANGED');
  const blocking=[...impact.blockingVideo,...impact.blockingAgent];
  if(blocking.length)throw new HttpError(409,'PURGE_BLOCKED_BY_TASKS');
  if(!input.confirmed)throw new HttpError(422,'CONFIRMATION_REQUIRED');
  await client.query('DELETE FROM workspace_graphs WHERE user_id=$1 AND project_id=$2',[context.userId,id]);
  await client.query('DELETE FROM workspace_command_history WHERE user_id=$1 AND project_id=$2',[context.userId,id]);
  await client.query("DELETE FROM workspace_asset_references WHERE user_id=$1 AND project_id=$2 AND source_id='graph'",[context.userId,id]);
  await client.query(`UPDATE workspace_projects SET purged_at=$3,purged_revision=$4,updated_at=$3,
   document=jsonb_set(jsonb_set(document,'{description}','""'),'{tags}','[]')
   WHERE user_id=$1 AND id=$2`,[context.userId,id,now,project.revision]);
  const fingerprint=createHash('sha256').update(JSON.stringify({projectId:id,title:input.title,revision:input.expectedRevision,impactToken:input.impactToken})).digest('hex');
  const inserted=await client.query('INSERT INTO workspace_project_purges(user_id,id,project_id,revision,node_count,fingerprint,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,id) DO NOTHING RETURNING revision,node_count,created_at',[context.userId,input.idempotencyKey,id,project.revision,impact.nodeCount,fingerprint,now]);
  if(!inserted.rows[0]){
   // 跨项目同 key 并发已建：读收据比对，冲突明确 409，不抛 unique 500。
   const existing=await client.query<{project_id:string;revision:number;node_count:number;fingerprint:string;created_at:Date}>('SELECT project_id,revision,node_count,fingerprint,created_at FROM workspace_project_purges WHERE user_id=$1 AND id=$2',[context.userId,input.idempotencyKey]);
   if(existing.rows[0]?.fingerprint!==fingerprint)throw new HttpError(409,'IDEMPOTENCY_CONFLICT');
   return purgeReceiptSchema.parse({id:input.idempotencyKey,projectId:existing.rows[0].project_id,revision:existing.rows[0].revision,nodeCount:existing.rows[0].node_count,createdAt:existing.rows[0].created_at.getTime()});
  }
  return purgeReceiptSchema.parse({id:input.idempotencyKey,projectId:id,revision:project.revision,nodeCount:impact.nodeCount,createdAt:now.getTime()});
 });
}
