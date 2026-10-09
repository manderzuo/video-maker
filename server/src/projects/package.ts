import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import type {AuthContext} from '../auth/context.js';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import {ownedProject,readProjectGraph,readWorkspace} from './repository.js';
import {projectViewSchema} from './contracts.js';
import {graphAssetIds,graphContentIds,validateResources} from './commands.js';
import {manifests,ownedAsset} from '../assets/repository.js';
import type {AssetRow} from '../assets/contracts.js';
import {verifyAssetFile,type AssetStorageOptions} from '../assets/storage.js';
import {cloudProjectPackageSchema,portableCloudContent,type CloudProjectPackage} from '../../../src/domain/cloud-project-package.js';
import {graphSchema,type Graph} from '../../../src/domain/graph.js';
import {remapResources} from '../../../src/domain/resource-remap.js';
import {executeGraphOperations} from '../../../src/application/commands/registry.js';
import {parseContent,type ContentKind,promptDraftSchema} from '../prompts/contracts.js';
import {contentAssetIds,writeContent} from '../prompts/repository.js';
import {cloudTaskSchema} from '../../../src/domain/cloud-task.js';
export const importProjectSchema=z.strictObject({data:cloudProjectPackageSchema,assets:z.record(z.string(),z.uuid()),idempotencyKey:z.uuid()});
type ReceiptRow={id:string;revision:number;command_type:'operations'|'undo'|'redo'|'viewport';before_graph:unknown;after_graph:unknown;created_at:Date};
export async function exportProjectPackage(pool:Pool,context:AuthContext,id:string,now:Date,storage?:AssetStorageOptions){
 return transaction(pool,async client=>{
  await client.query('SELECT id FROM workspace_projects WHERE user_id=$1 AND id=$2 FOR SHARE',[context.userId,id]);
  const project=await ownedProject(client,context,id),graph=await readProjectGraph(client,context,id);
  const rows=await client.query<ReceiptRow>('SELECT id,revision,command_type,before_graph,after_graph,created_at FROM workspace_command_receipts WHERE user_id=$1 AND project_id=$2 ORDER BY revision,id',[context.userId,id]);
  const receipts=rows.rows.map(row=>({id:row.id,revision:row.revision,type:row.command_type,before:graphSchema.parse(row.before_graph),after:graphSchema.parse(row.after_graph),createdAt:row.created_at.getTime()}));
  const history=await client.query<{undo_stack:string[];redo_stack:string[]}>('SELECT undo_stack,redo_stack FROM workspace_command_history WHERE user_id=$1 AND project_id=$2',[context.userId,id]);
  const graphs=[graph,...receipts.flatMap(r=>[r.before,r.after])],contentIds=[...new Set(graphs.flatMap(graphContentIds))];
  const records=await client.query<{id:string;kind:ContentKind;document:unknown;trashed_at:Date|null}>("SELECT id,kind,document,trashed_at FROM workspace_content WHERE user_id=$1 AND (id::text=ANY($2::text[]) OR document->>'sourceProjectId'=$3) ORDER BY id FOR SHARE",[context.userId,contentIds,id]);
  const content:NonNullable<CloudProjectPackage['content']>=[];
  for(const row of records.rows){const versions=await client.query<{document:unknown}>('SELECT document FROM workspace_content_versions WHERE user_id=$1 AND id=$2 ORDER BY revision',[context.userId,row.id]);content.push({kind:row.kind,document:parseContent(row.kind,row.document),versions:versions.rows.map(version=>parseContent(row.kind,version.document)),trashed:row.trashed_at!==null} as NonNullable<CloudProjectPackage['content']>[number]);}
  const taskRows=await client.query<{document:unknown}>("SELECT document FROM workspace_tasks WHERE user_id=$1 AND draft_id::text=ANY($2::text[]) UNION ALL SELECT document FROM workspace_task_archives WHERE user_id=$1 AND document->>'draftId'=ANY($2::text[])",[context.userId,content.filter(record=>record.kind==='draft').map(record=>record.document.id)]);
  const taskHistory=taskRows.rows.map(row=>cloudTaskSchema.parse(row.document));
  const ids=[...new Set([...graphs.flatMap(graphAssetIds),...contentAssetIds(content)])].sort();
  const media=await client.query<AssetRow>("SELECT id,state,document,thumbnail FROM workspace_assets WHERE user_id=$1 AND id::text=ANY($2::text[]) ORDER BY id FOR SHARE",[context.userId,ids]);
  if(media.rows.length!==ids.length)throw new HttpError(409,'PACKAGE_INCOMPLETE');
  const assets:CloudProjectPackage['assets']=[];
  for(const row of media.rows){
   if(row.state!=='complete'||!storage)throw new HttpError(409,'PACKAGE_INCOMPLETE');
   const {asset,original,thumbnail}=manifests(row);
   await verifyAssetFile(storage,context.userId,asset.id,'original',original);
   if(thumbnail)await verifyAssetFile(storage,context.userId,asset.id,'thumbnail',thumbnail);
   assets.push({asset:{...asset,blobKey:'sha256:'+asset.sha256},...(thumbnail?{thumbnail}:{})});
  }
  const stack=history.rows[0];
  const data=cloudProjectPackageSchema.parse(portableCloudContent({format:'aiwork-studio-cloud-project',version:1,createdAt:now.getTime(),project,graph,assets,content,taskHistory,history:{receipts,undo:stack?.undo_stack??[],redo:stack?.redo_stack??[]}}));
  if(Buffer.byteLength(JSON.stringify(data))>16*1024*1024)throw new HttpError(413,'BODY_TOO_LARGE');
  return data;
 });
}
export async function importProjectPackage(pool:Pool,context:AuthContext,input:z.infer<typeof importProjectSchema>,now:Date,storage?:AssetStorageOptions){
 const data=cloudProjectPackageSchema.parse(portableCloudContent(input.data));
 if(Object.keys(input.assets).length!==data.assets.length||data.assets.some(item=>!input.assets[item.asset.id]))throw new HttpError(400,'INVALID_REQUEST');
 const fingerprint=createHash('sha256').update(JSON.stringify({...input,data})).digest('hex');
 return transaction(pool,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[context.userId+':project-import:'+input.idempotencyKey]);
  const prior=await client.query<{fingerprint:string;project_id:string}>('SELECT fingerprint,project_id FROM workspace_project_imports WHERE user_id=$1 AND id=$2',[context.userId,input.idempotencyKey]);
  if(prior.rows[0]){
   if(prior.rows[0].fingerprint!==fingerprint)throw new HttpError(409,'IDEMPOTENCY_CONFLICT');return readWorkspace(client,context,prior.rows[0].project_id);
  }
  for(const item of [...data.assets].sort((a,b)=>input.assets[a.asset.id].localeCompare(input.assets[b.asset.id]))){
   const row=await ownedAsset(client,context,input.assets[item.asset.id]);
   await client.query('SELECT id FROM workspace_assets WHERE user_id=$1 AND id=$2 FOR SHARE',[context.userId,row.id]);
   const stored=manifests(await ownedAsset(client,context,row.id));
   if(row.state!=='complete'||stored.asset.trashedAt!=null)throw new HttpError(404,'NOT_FOUND');
   if(stored.asset.sha256!==item.asset.sha256||stored.asset.bytes!==item.asset.bytes||stored.asset.mimeType!==item.asset.mimeType||item.thumbnail&&JSON.stringify(stored.thumbnail)!==JSON.stringify(item.thumbnail))throw new HttpError(400,'INVALID_REQUEST');
   if(!storage)throw new HttpError(409,'PACKAGE_INCOMPLETE');
   await verifyAssetFile(storage,context.userId,row.id,'original',stored.original);
   if(stored.thumbnail)await verifyAssetFile(storage,context.userId,row.id,'thumbnail',stored.thumbnail);
  }
  const projectId=randomUUID(),graphs=[data.graph,...data.history.receipts.flatMap(r=>[r.before,r.after])];
  const records=data.content??[],draftVersions=records.flatMap(record=>record.kind==='draft'?record.versions.flatMap(draft=>draft.resultVersions):[]);
  const maps={project:new Map([[data.project.id,projectId]]),node:new Map(graphs.flatMap(g=>g.nodes).map(n=>[n.id,randomUUID()])),asset:new Map(Object.entries(input.assets)),entry:new Map(records.filter(r=>r.kind==='prompt').map(r=>[r.document.id,randomUUID()])),draft:new Map(records.filter(r=>r.kind==='draft').map(r=>[r.document.id,randomUUID()])),version:new Map(draftVersions.map(v=>[v.id,randomUUID()])),run:new Map((data.taskHistory??[]).map(task=>[task.id,randomUUID()]))};
  const shots=new Map(draftVersions.flatMap(version=>version.shotPlan).map(shot=>[shot.id,randomUUID()]));
  const edgeIds=new Map(graphs.flatMap(g=>g.edges).map(e=>[e.id,randomUUID()]));
  const mapGraph=(source:Graph)=>{
   const mapped=remapResources(source,maps) as Graph;
   return executeGraphOperations(graphSchema.parse({...mapped,projectId,nodes:mapped.nodes.map((node,index)=>({...node,id:maps.node.get(source.nodes[index].id)!})),edges:mapped.edges.map((edge,index)=>({...edge,id:edgeIds.get(source.edges[index].id)!}))}),[]);
  };
  const graph={...mapGraph(data.graph),revision:0};
  const receiptIds=new Map(data.history.receipts.map(r=>[r.id,randomUUID()]));
  const receipts=data.history.receipts.map(r=>({...r,id:receiptIds.get(r.id)!,before:mapGraph(r.before),after:mapGraph(r.after)}));
  const project=projectViewSchema.parse({...data.project,id:projectId,starred:data.project.starred??false,revision:0,createdAt:now.getTime(),updatedAt:now.getTime(),trashedAt:null});
  await client.query('INSERT INTO workspace_projects(id,user_id,revision,document,created_at,updated_at) VALUES($1,$2,0,$3::jsonb,$4,$4)',[projectId,context.userId,JSON.stringify(project),now]);
  await client.query('INSERT INTO workspace_graphs(user_id,project_id,revision,graph) VALUES($1,$2,0,$3::jsonb)',[context.userId,projectId,JSON.stringify(graph)]);
  for(const task of data.taskHistory??[]){const id=maps.run.get(task.id)!,document=cloudTaskSchema.parse({...remapResources(task,maps) as object,id,historical:true});await client.query('INSERT INTO workspace_task_archives(user_id,id,project_id,source_task_id,document) VALUES($1,$2,$3,$4,$5::jsonb)',[context.userId,id,projectId,task.id,JSON.stringify(document)]);}
  for(const receipt of receipts){
   await client.query('INSERT INTO workspace_command_receipts(user_id,id,project_id,revision,fingerprint,before_graph,after_graph,command_type,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)',[context.userId,receipt.id,projectId,receipt.revision,'import-history:'+receipt.id,JSON.stringify(receipt.before),JSON.stringify(receipt.after),receipt.type,new Date(receipt.createdAt)]);
   for(const assetId of new Set([...graphAssetIds(receipt.before),...graphAssetIds(receipt.after)]))await client.query('INSERT INTO workspace_asset_references(user_id,project_id,asset_id,source_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[context.userId,projectId,assetId,'command:'+receipt.id]);
  }
  for(const record of records){
   const id=(record.kind==='prompt'?maps.entry:maps.draft).get(record.document.id)!;
   const mapped=(document:typeof record.document)=>{
    const value=parseContent(record.kind,{...remapResources(document,maps) as object,id});
    if(record.kind==='draft'){const draft=promptDraftSchema.parse(value);return promptDraftSchema.parse({...draft,resultVersions:draft.resultVersions.map(version=>({...version,id:maps.version.get(version.id)!,shotPlan:version.shotPlan.map(shot=>({...shot,id:shots.get(shot.id)!}))}))});}
    return value;
   };
   const current=mapped(record.document);
   await client.query('INSERT INTO workspace_content(user_id,id,kind,revision,document,created_at,updated_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,$6)',[context.userId,id,record.kind,current.revision,JSON.stringify(current),now]);
   for(const version of [...record.versions].sort((a,b)=>a.revision-b.revision))await writeContent(client,context,record.kind,mapped(version),now,record.trashed);
  }
  for(const content of [graph,...receipts.flatMap(r=>[r.before,r.after])])await validateResources(client,context,content);
  const undo=data.history.undo.map(id=>receiptIds.get(id)!),redo=data.history.redo.map(id=>receiptIds.get(id)!);
  await client.query('INSERT INTO workspace_command_history(user_id,project_id,undo_stack,redo_stack) VALUES($1,$2,$3,$4)',[context.userId,projectId,undo,redo]);
  for(const assetId of graphAssetIds(graph))await client.query("INSERT INTO workspace_asset_references(user_id,project_id,asset_id,source_id) VALUES($1,$2,$3,'graph')",[context.userId,projectId,assetId]);
  await client.query('INSERT INTO workspace_project_imports(user_id,id,project_id,fingerprint,created_at) VALUES($1,$2,$3,$4,$5)',[context.userId,input.idempotencyKey,projectId,fingerprint,now]);
  return {project,graph,history:{undoDepth:undo.length,redoDepth:redo.length}};
 });
}
