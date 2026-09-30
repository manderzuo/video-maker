import {projectSchema,type Project} from '../../domain/project';
import {graphSchema,type Graph} from '../../domain/graph';
import {withDatabase,transact,requestResult,type StudioDb} from '../../infrastructure/storage/database';
import {readProject,readGraph,saveProject} from '../../infrastructure/storage/project-repository';
import {acquireProjectLease,releaseProjectLease,type ProjectLeaseToken} from '../../infrastructure/storage/project-lease';
import {snapshotAssetIds,loadResourceSnapshot} from '../assets/reference-index';
import {deletionTables} from './delete-policy';
export type NewProjectInput={title:string;description?:string;template?:'original-shot-draft'};
export const studioTabId=crypto.randomUUID();
export async function getProjectWriter(projectId:string,db?:StudioDb):Promise<ProjectLeaseToken>{
 const result=await acquireProjectLease(projectId,studioTabId,Date.now(),{db});
 if(!result.ok)throw new Error(result.errorCode);
 return result.token;
}
export async function listProjects(db?:StudioDb):Promise<Project[]>{
 return withDatabase(db,c=>transact(c,['projects'],'readonly',async tx=>(await requestResult<unknown[]>(tx.objectStore('projects').getAll())).map(p=>projectSchema.parse(p))));
}
export async function createProject(input:NewProjectInput,options:{db?:StudioDb;graph?:Graph;tags?:string[];importedAssetIds?:string[]}={}):Promise<Project>{
 const id=crypto.randomUUID(),now=Date.now(),project=projectSchema.parse({id,schemaVersion:1,title:input.title,description:input.description??'',revision:1,createdAt:now,updatedAt:now,archived:false,trashedAt:null,tags:options.tags??[]});
 let nodes:Graph['nodes']=[];
 if(input.template==='original-shot-draft')nodes=[
  {id:crypto.randomUUID(),type:'text',title:'原创需求',x:64,y:64,locked:false,data:{kind:'text',text:'在这里写下人物、场景、品牌文字与创作要求。',referenceTokens:[]}},
  {id:crypto.randomUUID(),type:'text',title:'原创分镜约束',x:448,y:64,locked:false,data:{kind:'text',text:'明确每个镜头的动作与衔接；时长和画幅由你填写，不自动生成。',referenceTokens:[]}}
 ];
 const graph=graphSchema.parse(options.graph?{...options.graph,projectId:id,revision:1}:{projectId:id,revision:1,nodes,edges:[],viewport:{x:0,y:0,scale:1}});
 const lease=await getProjectWriter(id,options.db);
 const result=await saveProject(project,0,{db:options.db,graph,lease,importedAssetIds:options.importedAssetIds});
 if(result.status!=='saved'){await releaseProjectLease(lease,options.db);throw new Error(result.status==='conflict'?'project_revision_conflict':result.code);}
 return project;
}
export async function cloneProject(id:string,input:{title?:string;description?:string;includeReadonlyHistory?:boolean;db?:StudioDb}={}):Promise<Project>{
 const source=await readProject(id,input.db),graph=await readGraph(id,input.db);
 if(!source||!graph||source.trashedAt!==null)throw new Error('project_not_available');
 if(source.revision!==graph.revision)throw new Error('graph_revision_conflict');
 const nodeIds=new Map(graph.nodes.map(node=>[node.id,crypto.randomUUID()]));
 const copied=structuredClone(graph);
 copied.nodes=copied.nodes.filter(node=>input.includeReadonlyHistory!==false||node.type!=='result').map(node=>{
  const copied={...node,id:nodeIds.get(node.id)!};
  if(copied.type==='group')copied.data={...copied.data,childIds:copied.data.childIds.map(id=>nodeIds.get(id)!).filter(id=>graph.nodes.some(n=>nodeIds.get(n.id)===id&&(input.includeReadonlyHistory!==false||n.type!=='result')))};
  if(copied.type==='video-generation')copied.data={...copied.data,stale:true,inputBindings:copied.data.inputBindings.map(({runId:oldRunId,...binding})=>{void oldRunId;return {...binding,nodeId:nodeIds.get(binding.nodeId)??binding.nodeId};})};
  return copied;
 });
 const retained=new Set(copied.nodes.map(n=>n.id));
 copied.edges=copied.edges.map(edge=>({...edge,id:crypto.randomUUID(),sourceId:nodeIds.get(edge.sourceId)!,targetId:nodeIds.get(edge.targetId)!})).filter(edge=>retained.has(edge.sourceId)&&retained.has(edge.targetId));
 const importedAssetIds=await withDatabase(input.db,db=>transact(db,['references'],'readonly',async tx=>(await requestResult<{assetId:string;kind?:string}[]>(tx.objectStore('references').index('projectId').getAll(id))).filter(ref=>ref.kind==='project-import').map(ref=>ref.assetId)));
 return createProject({title:input.title??([...source.title].length<=57?source.title+' 副本':source.title),description:input.description??source.description},{db:input.db,graph:copied,tags:source.tags,importedAssetIds});
}
export async function updateProjectMetadata(id:string,expectedRevision:number,patch:Pick<Partial<Project>,'title'|'description'|'archived'|'starred'>,db?:StudioDb):Promise<Project>{
 const validatedPatch=projectSchema.pick({title:true,description:true,archived:true,starred:true}).partial().parse(patch);
 const project=await readProject(id,db);
 if(!project||project.trashedAt!==null)throw new Error('project_not_available');
 if(project.revision!==expectedRevision)throw new Error('project_revision_conflict');
 const next=projectSchema.parse({...project,...validatedPatch,revision:project.revision+1,updatedAt:Date.now()}),lease=await getProjectWriter(id,db);
 const saved=await saveProject(next,expectedRevision,{db,lease});
 if(saved.status!=='saved')throw new Error(saved.status==='conflict'?'project_revision_conflict':saved.code);
 return next;
}
export async function projectDetails(id:string,db?:StudioDb){
 return withDatabase(db,c=>transact(c,deletionTables,'readonly',async tx=>{
  const snapshot=await loadResourceSnapshot(tx),project=snapshot.projects.find(p=>p.id===id);
  if(!project)throw new Error('project_not_available');
  const graph=snapshot.graphs.find(g=>g.projectId===id),assetIds=new Set([...snapshotAssetIds(graph?.nodes),...snapshot.links.filter(l=>l.projectId===id&&l.kind==='project-import').map(l=>l.assetId)]);
  const media=snapshot.assets.filter(a=>assetIds.has(a.id)),knownBlobs=new Set<string>();let actualKnownBytes=0,missing=0;
  for(const asset of media)if(!knownBlobs.has(asset.blobKey)){knownBlobs.add(asset.blobKey);const row=await requestResult<{blob?:Blob}|undefined>(tx.objectStore('blobs').get(asset.blobKey));if(row?.blob)actualKnownBytes+=row.blob.size;else missing++;}
  return {project,assetCount:media.length,nodeCount:graph?.nodes.length??0,runCount:snapshot.runs.filter(r=>r.projectId===id).length,actualKnownBytes,missing};
 }));
}
export const projectError=(error:unknown)=>{
 const message=error instanceof Error?error.message:'unknown';
 if(message.includes('lease')||message.includes('writer'))return '此项目正在其他标签页编辑。请先关闭旧页或在画布明确接管。';
 if(message.includes('revision'))return '项目已发生变化，请刷新后重试。';
 if(message.includes('quota'))return '存储空间不足，本次修改尚未保存。';
 if(message.includes('schema'))return '项目版本暂不可写，请保留数据并检查兼容性。';
 return '本次操作未保存。请检查名称为1–60字符，说明不超过500字符，或重试。';
};
