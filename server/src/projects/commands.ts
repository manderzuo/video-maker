import type {Pool,PoolClient} from 'pg';
import type {AuthContext} from '../auth/context.js';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import {graphSchema,type Graph} from '../../../src/domain/graph.js';
import {commandEnvelopeSchema,executeGraphOperations} from '../../../src/application/commands/registry.js';
import {getOrderedInputs,validateConnection} from '../../../src/domain/graph-validation.js';
import {unverifiedCapabilities} from '../../../src/domain/connection.js';
import {ownedProject,readProjectGraph,writeProjectAndGraph} from './repository.js';
import type {ProjectCommand} from './contracts.js';
import {assetSchema,type Asset} from '../../../src/domain/asset.js';
const contents=(graph:Graph)=>JSON.stringify({...graph,revision:0,viewport:{x:0,y:0,scale:1}});
// Resource references are checked even when an input binding is inactive.
export function graphAssetIds(graph:Graph){
 const ids=new Set<string>();function visit(value:unknown){if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){if(['assetId','sourceAssetId'].includes(key)&&typeof item==='string')ids.add(item);else visit(item);}}visit(graph.nodes);return [...ids];
}
async function validateResources(client:PoolClient,context:AuthContext,graph:Graph,validateBindings=true){
 const assetIds=graphAssetIds(graph),unsupported=new Set<string>();
 function visit(value:unknown){if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){if(['runId','sourceRunId','entryId','draftId','resultVersionId'].includes(key)&&typeof item==='string')unsupported.add(item);else visit(item);}}
 visit(graph.nodes);if(unsupported.size)throw new HttpError(404,'NOT_FOUND');
 const assets:Asset[]=[];
 if(assetIds.length){const result=await client.query<{document:unknown}>("SELECT document FROM workspace_assets WHERE user_id=$1 AND id::text=ANY($2::text[]) AND state='complete' AND trashed_at IS NULL ORDER BY id FOR SHARE",[context.userId,assetIds]);if(result.rows.length!==assetIds.length)throw new HttpError(404,'NOT_FOUND');assets.push(...result.rows.map(row=>assetSchema.parse(row.document)));}
 for(const edge of graph.edges){const valid=validateConnection(graph,edge,unverifiedCapabilities(),{assets});if(!valid.ok)throw new HttpError(400,'INVALID_COMMAND');}
 if(validateBindings)for(const node of graph.nodes)if(node.type==='video-generation'&&JSON.stringify(node.data.inputBindings)!==JSON.stringify(getOrderedInputs(graph,node.id)))throw new HttpError(400,'INVALID_COMMAND');
}
export async function applyProjectCommand(pool:Pool,context:AuthContext,projectId:string,input:ProjectCommand,now:Date){
 return transaction(pool,async client=>{
  const project=await ownedProject(client,context,projectId,true),before=await readProjectGraph(client,context,projectId);
  if(project.trashedAt!==null)throw new HttpError(409,'PROJECT_IN_TRASH');
  const fingerprint=JSON.stringify({projectId,...input});
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[context.userId+':command:'+input.idempotencyKey]);
  const prior=await client.query<{fingerprint:string;revision:number}>('SELECT fingerprint,revision FROM workspace_command_receipts WHERE user_id=$1 AND id=$2',[context.userId,input.idempotencyKey]);
  const stored=await client.query<{undo_stack:string[];redo_stack:string[]}>('SELECT undo_stack,redo_stack FROM workspace_command_history WHERE user_id=$1 AND project_id=$2',[context.userId,projectId]);
  const history=stored.rows[0]??{undo_stack:[],redo_stack:[]};let next:Graph;
  if(prior.rows[0]){if(prior.rows[0].fingerprint!==fingerprint)throw new HttpError(409,'IDEMPOTENCY_CONFLICT');return {id:input.idempotencyKey,status:'replayed',revision:project.revision,commandRevision:prior.rows[0].revision,project,graph:before,history:{undoDepth:history.undo_stack.length,redoDepth:history.redo_stack.length}};}
  if(project.revision!==input.expectedRevision)throw new HttpError(409,'REVISION_CONFLICT');
  if(input.command.type==='operations'){
   const envelope=commandEnvelopeSchema.parse({id:input.idempotencyKey,projectId,baseRevision:input.expectedRevision,leaseEpoch:1,origin:'ui',operations:input.command.operations});
   try{next=executeGraphOperations(before,envelope.operations);}catch{throw new HttpError(400,'INVALID_COMMAND');}
   await validateResources(client,context,next,false);
   if(input.command.viewport)next.viewport=input.command.viewport;
   const changed=new Set(envelope.operations.flatMap(op=>op.type==='update_node'&&'data' in op.payload.patch||op.type==='select_result'?[op.payload.nodeId]:[]));
   for(const node of next.nodes)if(node.type==='video-generation'){
    const inputs=getOrderedInputs(next,node.id),old=before.nodes.find(n=>n.id===node.id);
    const previous=old?.type==='video-generation'?old.data:undefined,missing=[...new Set([...(node.data.missingInputNodeIds??[]),...(previous?.inputBindings.filter(binding=>!next.nodes.some(n=>n.id===binding.nodeId)).map(binding=>binding.nodeId)??[])])].filter(id=>!inputs.some(binding=>binding.nodeId===id));
    node.data={...node.data,inputBindings:inputs,...(missing.length?{missingInputNodeIds:missing}:{}),stale:node.data.stale||!previous||JSON.stringify(inputs)!==JSON.stringify(previous.inputBindings)||inputs.some(binding=>changed.has(binding.nodeId))};
   }
   history.undo_stack.push(input.idempotencyKey);history.redo_stack=[];
  }else if(input.command.type==='viewport')next={...before,viewport:input.command.viewport};
  else{
   const undo=input.command.type==='undo',from=undo?history.undo_stack:history.redo_stack,to=undo?history.redo_stack:history.undo_stack,sourceId=from.at(-1);
   if(!sourceId)throw new HttpError(409,'HISTORY_EMPTY');
   const result=await client.query<{before_graph:unknown;after_graph:unknown}>('SELECT before_graph,after_graph FROM workspace_command_receipts WHERE user_id=$1 AND project_id=$2 AND id=$3',[context.userId,projectId,sourceId]);
   if(!result.rows[0])throw new HttpError(409,'HISTORY_CHANGED');
   const expected=graphSchema.parse(undo?result.rows[0].after_graph:result.rows[0].before_graph);
   if(contents(before)!==contents(expected))throw new HttpError(409,'HISTORY_CHANGED');
   next=graphSchema.parse(undo?result.rows[0].before_graph:result.rows[0].after_graph);next.viewport=before.viewport;from.pop();to.push(sourceId);
  }
  next=graphSchema.parse({...next,projectId,revision:project.revision+1});await validateResources(client,context,next);
  const updated=await writeProjectAndGraph(client,context,{...project,revision:next.revision,updatedAt:now.getTime()},now);
  await client.query('UPDATE workspace_graphs SET graph=$3::jsonb WHERE user_id=$1 AND project_id=$2',[context.userId,projectId,JSON.stringify(next)]);
  await client.query('INSERT INTO workspace_command_receipts(user_id,id,project_id,revision,fingerprint,before_graph,after_graph,command_type,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)',[context.userId,input.idempotencyKey,projectId,next.revision,fingerprint,JSON.stringify(before),JSON.stringify(next),input.command.type,now]);
  await client.query('INSERT INTO workspace_command_history(user_id,project_id,undo_stack,redo_stack) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,project_id) DO UPDATE SET undo_stack=EXCLUDED.undo_stack,redo_stack=EXCLUDED.redo_stack',[context.userId,projectId,history.undo_stack,history.redo_stack]);
  await client.query("DELETE FROM workspace_asset_references WHERE user_id=$1 AND project_id=$2 AND source_id='graph'",[context.userId,projectId]);
  for(const assetId of graphAssetIds(next))await client.query("INSERT INTO workspace_asset_references(user_id,project_id,asset_id,source_id) VALUES($1,$2,$3,'graph') ON CONFLICT DO NOTHING",[context.userId,projectId,assetId]);
  for(const assetId of new Set([...graphAssetIds(before),...graphAssetIds(next)]))await client.query('INSERT INTO workspace_asset_references(user_id,project_id,asset_id,source_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[context.userId,projectId,assetId,'command:'+input.idempotencyKey]);
  return {id:input.idempotencyKey,status:'applied',revision:next.revision,project:updated,graph:next,history:{undoDepth:history.undo_stack.length,redoDepth:history.redo_stack.length}};
 });
}
