import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {z} from 'zod';
import type {AuthContext} from '../auth/context.js';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import {projectCopySchema,projectViewSchema} from './contracts.js';
import {ownedProject,readProjectGraph,readWorkspace} from './repository.js';
import {graphAssetIds,validateResources} from './commands.js';
import {graphSchema,type Graph} from '../../../src/domain/graph.js';
import {remapResources} from '../../../src/domain/resource-remap.js';
export async function copyProject(pool:Pool,context:AuthContext,id:string,input:z.infer<typeof projectCopySchema>,now:Date){
 return transaction(pool,async client=>{
  const source=await ownedProject(client,context,id,true);
  const fingerprint=JSON.stringify({id,...input});
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[context.userId+':project-copy:'+input.idempotencyKey]);
  const prior=await client.query<{fingerprint:string;project_id:string}>('SELECT fingerprint,project_id FROM workspace_project_copies WHERE user_id=$1 AND id=$2',[context.userId,input.idempotencyKey]);
  if(prior.rows[0]){
   if(prior.rows[0].fingerprint!==fingerprint)throw new HttpError(409,'IDEMPOTENCY_CONFLICT');
   return readWorkspace(client,context,prior.rows[0].project_id);
  }
  if(source.revision!==input.expectedRevision)throw new HttpError(409,'REVISION_CONFLICT');
  if(source.trashedAt!==null)throw new HttpError(409,'PROJECT_IN_TRASH');
  const before=await readProjectGraph(client,context,id),projectId=randomUUID();
  const maps={project:new Map([[id,projectId]]),node:new Map(before.nodes.map(node=>[node.id,randomUUID()]))};
  const mapped=remapResources(before,maps) as Graph;
  const graph=graphSchema.parse({...mapped,projectId,revision:0,nodes:mapped.nodes.map((node,index)=>({...node,id:maps.node.get(before.nodes[index].id)!,...(node.type==='video-generation'?{data:{...node.data,stale:true}}:{})})),edges:mapped.edges.map(edge=>({...edge,id:randomUUID()}))});
  await validateResources(client,context,graph);
  const project=projectViewSchema.parse({...source,id:projectId,title:input.title??([...source.title].slice(0,57).join('')+' 副本'),revision:0,createdAt:now.getTime(),updatedAt:now.getTime(),starred:false,archived:false,trashedAt:null});
  await client.query('INSERT INTO workspace_projects(id,user_id,revision,document,created_at,updated_at) VALUES($1,$2,0,$3::jsonb,$4,$4)',[projectId,context.userId,JSON.stringify(project),now]);
  await client.query('INSERT INTO workspace_graphs(user_id,project_id,revision,graph) VALUES($1,$2,0,$3::jsonb)',[context.userId,projectId,JSON.stringify(graph)]);
  for(const assetId of graphAssetIds(graph))await client.query("INSERT INTO workspace_asset_references(user_id,project_id,asset_id,source_id) VALUES($1,$2,$3,'graph')",[context.userId,projectId,assetId]);
  await client.query('INSERT INTO workspace_project_copies(user_id,id,source_id,project_id,fingerprint,created_at) VALUES($1,$2,$3,$4,$5,$6)',[context.userId,input.idempotencyKey,id,projectId,fingerprint,now]);
  return {project,graph,history:{undoDepth:0,redoDepth:0}};
 });
}
