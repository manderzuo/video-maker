import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {AuthContext} from '../auth/context.js';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import {projectViewSchema,workspaceGraphSchema,type ProjectView,type ProjectCreate,type ProjectPatch} from './contracts.js';

export async function ownedProject(client:Pool|PoolClient,context:AuthContext,id:string,lock=false):Promise<ProjectView>{
 const result=await client.query<{document:unknown}>('SELECT document FROM workspace_projects WHERE user_id=$1 AND id=$2'+(lock?' FOR UPDATE':''),[context.userId,id]);
 if(!result.rows[0])throw new HttpError(404,'NOT_FOUND');return projectViewSchema.parse(result.rows[0].document);
}
export async function listProjects(pool:Pool,context:AuthContext,trashed=false){
 const result=await pool.query<{document:unknown}>('SELECT document FROM workspace_projects WHERE user_id=$1 AND '+(trashed?'trashed_at IS NOT NULL':'trashed_at IS NULL')+' ORDER BY updated_at DESC,id',[context.userId]);
 return result.rows.map(row=>projectViewSchema.parse(row.document));
}
export async function readProject(pool:Pool,context:AuthContext,id:string){return ownedProject(pool,context,id);}
export async function readWorkspace(pool:Pool|PoolClient,context:AuthContext,id:string){
 const result=await pool.query<{document:unknown;graph:unknown;undo_depth:number;redo_depth:number}>('SELECT p.document,g.graph,COALESCE(cardinality(h.undo_stack),0) AS undo_depth,COALESCE(cardinality(h.redo_stack),0) AS redo_depth FROM workspace_projects p JOIN workspace_graphs g ON g.user_id=p.user_id AND g.project_id=p.id AND g.revision=p.revision LEFT JOIN workspace_command_history h ON h.user_id=p.user_id AND h.project_id=p.id WHERE p.user_id=$1 AND p.id=$2',[context.userId,id]);
 if(!result.rows[0])throw new HttpError(404,'NOT_FOUND');const row=result.rows[0];return {project:projectViewSchema.parse(row.document),graph:workspaceGraphSchema.parse(row.graph),history:{undoDepth:row.undo_depth,redoDepth:row.redo_depth}};
}
export async function readProjectGraph(pool:Pool|PoolClient,context:AuthContext,id:string){
 const result=await pool.query<{graph:unknown}>('SELECT g.graph FROM workspace_graphs g JOIN workspace_projects p ON p.user_id=g.user_id AND p.id=g.project_id AND p.revision=g.revision WHERE p.user_id=$1 AND p.id=$2',[context.userId,id]);
 if(!result.rows[0])throw new HttpError(404,'NOT_FOUND');return workspaceGraphSchema.parse(result.rows[0].graph);
}
export async function createProject(pool:Pool,context:AuthContext,input:ProjectCreate,now:Date){
 const project=projectViewSchema.parse({...input,id:randomUUID(),schemaVersion:1,revision:0,createdAt:now.getTime(),updatedAt:now.getTime(),archived:false,trashedAt:null});
 const graph=workspaceGraphSchema.parse({projectId:project.id,revision:0,nodes:[],edges:[],viewport:{x:0,y:0,scale:1}});
 return transaction(pool,async client=>{
  await client.query('INSERT INTO workspace_projects(id,user_id,revision,document,created_at,updated_at) VALUES($1,$2,0,$3::jsonb,$4,$4)',[project.id,context.userId,JSON.stringify(project),now]);
  await client.query('INSERT INTO workspace_graphs(user_id,project_id,revision,graph) VALUES($1,$2,0,$3::jsonb)',[context.userId,project.id,JSON.stringify(graph)]);
  return project;
 });
}
export async function writeProjectAndGraph(client:PoolClient,context:AuthContext,next:ProjectView,now:Date){
 const project=await client.query('UPDATE workspace_projects SET revision=$3,document=$4::jsonb,updated_at=$5,trashed_at=$6 WHERE user_id=$1 AND id=$2',[context.userId,next.id,next.revision,JSON.stringify(next),now,next.trashedAt===null?null:new Date(next.trashedAt)]);
 const graph=await client.query("UPDATE workspace_graphs SET revision=$3,graph=jsonb_set(graph,'{revision}',to_jsonb($3::integer)) WHERE user_id=$1 AND project_id=$2",[context.userId,next.id,next.revision]);
 if(project.rowCount!==1||graph.rowCount!==1)throw new Error('Workspace project/graph transaction incomplete');
 return next;
}
export async function updateProject(pool:Pool,context:AuthContext,id:string,input:ProjectPatch,now:Date){
 return transaction(pool,async client=>{
  const current=await ownedProject(client,context,id,true);
  const {expectedRevision,...patch}=input;
  if(current.revision!==expectedRevision)throw new HttpError(409,'REVISION_CONFLICT');
  if(current.trashedAt!==null)throw new HttpError(409,'PROJECT_IN_TRASH');
  const next=projectViewSchema.parse({...current,...patch,revision:current.revision+1,updatedAt:now.getTime()});
  return writeProjectAndGraph(client,context,next,now);
 });
}
export async function trashProject(pool:Pool,context:AuthContext,id:string,expectedRevision:number,now:Date){
 return transaction(pool,async client=>{
  const current=await ownedProject(client,context,id,true);
  if(current.revision!==expectedRevision)throw new HttpError(409,'REVISION_CONFLICT');
  if(current.trashedAt!==null)return current;
  return writeProjectAndGraph(client,context,{...current,revision:current.revision+1,updatedAt:now.getTime(),trashedAt:now.getTime()},now);
 });
}
export async function restoreProject(pool:Pool,context:AuthContext,id:string,expectedRevision:number,now:Date){
 return transaction(pool,async client=>{
  const current=await ownedProject(client,context,id,true);
  if(current.revision!==expectedRevision)throw new HttpError(409,'REVISION_CONFLICT');
  if(current.trashedAt===null)return current;
  return writeProjectAndGraph(client,context,{...current,revision:current.revision+1,updatedAt:now.getTime(),trashedAt:null},now);
 });
}
