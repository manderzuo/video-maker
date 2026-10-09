import {useEffect,useRef,useState} from 'react';
import type {Project} from '../../domain/project';
import type {PurgePreview} from '../../domain/project-purge';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {exportCloudProject,inspectCloudProject,importCloudProject,type CloudImportPlan} from './cloud-project-package';
import {createPackageZip} from '../../infrastructure/packages/package-limits';
import {triggerLocalDownload} from '../../ui/local-download';
import {sessionStore} from '../../infrastructure/api/session';
import {savePreferences} from '../settings/preferences-store';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {LocalLink,navigate} from '../../app/routes';
import {usePreferences} from '../settings/preferences-store';
type BatchFailure={id:string;title:string;message:string};
type PurgeBatchItem={project:Project;preview:PurgePreview|undefined;failed:string;key:string;name:string;done:boolean};
function ProjectTable({rows,trashed,selection,toggleSelect,busy,onRestore,onExport,onPurge}:{rows:Project[];trashed:boolean;selection:Set<string>;toggleSelect:(id:string)=>void;busy:boolean;onRestore:(project:Project)=>void;onExport:(project:Project)=>void;onPurge:(project:Project)=>void}){
 return <table className="cloud-project-table"><thead><tr><th>选择</th><th>项目</th><th>修订</th><th>更新</th><th>操作</th></tr></thead><tbody>{rows.map(row=>(<tr key={row.id}><td><input data-interaction-id="cloud:project:select" aria-label={'选择项目'+row.title} type="checkbox" checked={selection.has(row.id)} onChange={()=>toggleSelect(row.id)}/></td><td>{trashed?row.title:(<LocalLink data-interaction-id="cloud:project:open" href={'/projects/'+row.id+'/canvas'}>{row.title}</LocalLink>)}</td><td>{row.revision}</td><td>{new Date(row.updatedAt).toLocaleString()}</td><td>{trashed?(<><Button data-interaction-id="cloud:project:restore" disabled={busy} onClick={()=>onRestore(row)}>恢复项目</Button><Button data-interaction-id="cloud:project:export" disabled={busy} onClick={()=>onExport(row)}>导出完整项目包</Button><Button data-interaction-id="cloud:project:purge" variant="danger" disabled={busy} onClick={()=>onPurge(row)}>永久删除</Button></>):(<LocalLink data-interaction-id="cloud:project:open" href={'/projects/'+row.id+'/canvas'}>打开画布</LocalLink>)}</td></tr>))}</tbody></table>;
}
export function CloudProjectsPage({client,trashed=false}:{client:WorkspaceClient;trashed?:boolean}){
 const preferences=usePreferences();
 const [projects,setProjects]=useState<Project[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[sort,setSort]=useState<string>(preferences.projectSort),[filter,setFilter]=useState('all');
 useEffect(()=>setSort(preferences.projectSort),[preferences.projectSort]);
 const [open,setOpen]=useState(false),[target,setTarget]=useState<Project>(),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[tags,setTags]=useState(''),[busy,setBusy]=useState(false);
 const [importOpen,setImportOpen]=useState(false),[file,setFile]=useState<File>(),[plan,setPlan]=useState<CloudImportPlan>();
 const [selection,setSelection]=useState<Set<string>>(new Set()),[batchOpen,setBatchOpen]=useState<'archive'|'export'>(),[batchFailures,setBatchFailures]=useState<BatchFailure[]>([]),[templateOpen,setTemplateOpen]=useState(false),[batchMessage,setBatchMessage]=useState(''),[viewMode,setViewMode]=useState<'grid'|'list'>(preferences.projectList?'list':'grid');
 const [purgeSingle,setPurgeSingle]=useState<{project:Project;preview:PurgePreview|undefined;failed:string;key:string}>(),[purgeName,setPurgeName]=useState('');
 const [pendingPurge,setPendingPurge]=useState<{projectId:string;title:string}[]>([]);
 const [pendingBatchCount,setPendingBatchCount]=useState(0);
 useEffect(()=>{
  if(!trashed)return;
  try{
   const identity=sessionStore.getState();
   if(identity.status!=='authenticated')return;
   const prefix='aiwork:purge-pending:'+identity.session.user.id+':',found:{projectId:string;title:string}[]=[];
   for(let index=0;index<localStorage.length;index++){
    const storageKey=localStorage.key(index);
    if(!storageKey||!storageKey.startsWith(prefix))continue;
    try{
     const saved=JSON.parse(localStorage.getItem(storageKey)??'') as {key?:unknown;body?:{title?:unknown}};
     if(typeof saved.key==='string'&&saved.key&&typeof saved.body?.title==='string')found.push({projectId:storageKey.slice(prefix.length),title:saved.body.title});
     else localStorage.removeItem(storageKey);
    }catch{/* 跳过损坏项 */}
   }
   setPendingPurge(found);
   const batchRaw=localStorage.getItem('aiwork:purge-batch-pending:'+identity.session.user.id);
   if(batchRaw){
    try{
     const items=JSON.parse(batchRaw) as {projectId?:unknown;done?:unknown}[];
     setPendingBatchCount(items.filter(item=>typeof item.projectId==='string'&&item.done!==true).length);
    }catch{setPendingBatchCount(0);}
   }else setPendingBatchCount(0);
  }catch{/* 忽略 */}
 },[trashed]);
 async function retryStoredPurge(projectId:string){
  setError('');
  try{
   const identity=sessionStore.getState();
   if(identity.status!=='authenticated')throw new Error('AUTH_REQUIRED');
   const raw=localStorage.getItem('aiwork:purge-pending:'+identity.session.user.id+':'+projectId);
   if(!raw)throw new Error('未找到该项目的未决删除请求。');
   const saved=JSON.parse(raw) as {key?:unknown;body?:{title:string;expectedRevision:number;impactToken:string;confirmed:true;idempotencyKey:string}};
   if(typeof saved.key!=='string'||!saved.body||typeof saved.body!=='object')throw new Error('未决删除请求已损坏。');
   await action(async()=>{
    await client.purgeProject(projectId,saved.body as {title:string;expectedRevision:number;impactToken:string;confirmed:true;idempotencyKey:string});
    if(alive.current){clearPurgeKey(projectId);setPendingPurge(current=>current.filter(item=>item.projectId!==projectId));await reload();}
   });
  }catch(e){setError(workspaceMessage(e));}
 }
 function abandonStoredPurge(projectId:string){
  clearPurgeKey(projectId);
  setPendingPurge(current=>current.filter(item=>item.projectId!==projectId));
  setBatchMessage('已放弃该项目的未决删除；若服务端已接受，可用原请求重试，结果以服务端收据为准。');
 }
 async function restorePurgeBatch(){
  setError('');
  try{
   const identity=sessionStore.getState();
   if(identity.status!=='authenticated')throw new Error('AUTH_REQUIRED');
   const raw=localStorage.getItem('aiwork:purge-batch-pending:'+identity.session.user.id);
   if(!raw)throw new Error('没有可恢复的批量删除。');
   const items:PurgeBatchItem[]=[];
   for(const entry of JSON.parse(raw) as {projectId?:unknown;title?:unknown;revision?:unknown;impactToken?:unknown;preview?:unknown;key?:unknown;name?:unknown;done?:unknown}[]){
    if(typeof entry.projectId!=='string'||entry.done===true)continue;
    if(typeof entry.title!=='string'||typeof entry.revision!=='number'||typeof entry.impactToken!=='string'||!entry.preview||typeof entry.preview!=='object'||typeof entry.key!=='string'||!entry.key)continue;
    items.push({project:{id:entry.projectId,title:entry.title,schemaVersion:1,description:'',revision:entry.revision,createdAt:0,updatedAt:0,archived:false,trashedAt:Date.now(),tags:[],starred:false} as Project,preview:entry.preview as PurgePreview,failed:'',key:entry.key,name:typeof entry.name==='string'?entry.name:'',done:false});
   }
   setPurgeBatch(items);
   setPendingBatchCount(0);
   setBatchMessage('已恢复 '+items.length+' 项未完成的批量删除；请核对后确认，原请求不变。');
  }catch(e){setError(workspaceMessage(e));}
 }
 const [purgeBatch,setPurgeBatch]=useState<PurgeBatchItem[]>();
 const copies=useRef(new Map<string,{key:string;revision:number}>()),template=useRef<{projectId:string;key:string}|undefined>(undefined),alive=useRef(true);
 const reload=async()=>{const rows=await client.listProjects(trashed);if(alive.current){setProjects(rows);setLoading(false);}};
 useEffect(()=>{alive.current=true;setLoading(true);void reload().catch(e=>{if(alive.current){setError(workspaceMessage(e));setLoading(false);}});return()=>{alive.current=false;copies.current.clear();};},[client,trashed]);
 async function action(work:()=>Promise<unknown>){
  if(busy)return;setBusy(true);setError('');try{await work();if(alive.current)await reload();}catch(e){if(alive.current)setError(workspaceMessage(e));}finally{if(alive.current)setBusy(false);}
 }
 async function save(){await action(async()=>{const input={title,description,tags:tags.split(',').map(s=>s.trim()).filter(Boolean)};if(target)await client.patchProject(target.id,target.revision,input);else await client.createProject(input);if(alive.current)setOpen(false);});}
 async function copy(project:Project){
  const pending=copies.current.get(project.id)??{key:crypto.randomUUID(),revision:project.revision};copies.current.set(project.id,pending);
  await action(async()=>{await client.copyProject(project.id,pending.revision,pending.key);copies.current.delete(project.id);});
 }
 async function download(project:Project){await action(async()=>{
  const result=await exportCloudProject(client,project.id);if(!alive.current)return;
  const url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=result.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });}
 async function inspect(){if(!file)return;setBusy(true);setError('');try{const checked=await inspectCloudProject(file);if(alive.current)setPlan(checked);}catch{if(alive.current)setError('项目包校验失败。请保留原文件，核对格式和文件完整性。');}finally{if(alive.current)setBusy(false);}}
 async function commit(){if(!plan)return;await action(async()=>{await importCloudProject(client,plan);if(alive.current){setImportOpen(false);setPlan(undefined);setFile(undefined);}});}
 async function createFromTemplate(){await action(async()=>{
  let frozen=template.current;
  if(!frozen){
   const created=await client.createProject({title:'原创分镜草稿',description:'原创静态结构：创作需求与分镜约束。',tags:[]});
   frozen={projectId:created.id,key:crypto.randomUUID()};
   template.current=frozen;
  }
  let workspace;
  try{workspace=await client.readWorkspace(frozen.projectId);}
  catch{template.current=undefined;throw new Error('模板项目已不可用，请重新创建；原空项目保留在列表中。');}
  const textNode=(title:string,text:string,x:number)=>({id:crypto.randomUUID(),type:'text',title,x,y:120,locked:false,data:{kind:'text',text,referenceTokens:[]}});
  await client.command(frozen.projectId,workspace.graph.revision,{type:'operations',operations:[{id:crypto.randomUUID(),type:'add_node',payload:{node:textNode('创作需求','本片要讲什么，一句话写清。',40)}},{id:crypto.randomUUID(),type:'add_node',payload:{node:textNode('分镜约束','镜头数量、时长与比例约束。',440)}}]},frozen.key);
  template.current=undefined;
  if(alive.current){setTemplateOpen(false);navigate('/projects/'+encodeURIComponent(frozen.projectId)+'/canvas');}
 });}
 async function commitBatchArchive(){await action(async()=>{
  let succeeded=0;const failures:BatchFailure[]=[];
  for(const id of selection){
   const project=projects.find(p=>p.id===id);
   if(!project){failures.push({id,title:id,message:'项目已不在当前列表，请刷新核对。'});continue;}
   try{await client.patchProject(project.id,project.revision,{archived:true});succeeded++;}
   catch(e){failures.push({id:project.id,title:project.title,message:workspaceMessage(e)});}
  }
  setBatchOpen(undefined);await reload();
  if(!alive.current)return;
  setBatchFailures(failures);setBatchMessage('批量归档成功 '+succeeded+'，失败 '+failures.length);
 });}
 async function commitBatchExport(){await action(async()=>{
  const entries:Record<string,Uint8Array>={};let succeeded=0;const failures:BatchFailure[]=[];
  for(const id of selection){
   const project=projects.find(p=>p.id===id);
   if(!project){failures.push({id,title:id,message:'项目已不在当前列表，请刷新核对。'});continue;}
   try{
    const result=await exportCloudProject(client,project.id);
    entries[project.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'-'+project.id.slice(0,8)+'-cloud.zip']=new Uint8Array(await result.blob.arrayBuffer());
    succeeded++;
   }catch(e){failures.push({id:project.id,title:project.title,message:workspaceMessage(e)});}
  }
  if(!alive.current)return;
  setBatchOpen(undefined);
  if(!succeeded){setBatchFailures(failures);setBatchMessage('批量导出全部失败，未产出下载包。');return;}
  triggerLocalDownload(createPackageZip(entries),'cloud-projects-batch.zip');
  await reload();
  if(!alive.current)return;
  setBatchFailures(failures);setBatchMessage('批量导出成功 '+succeeded+'，失败 '+failures.length+'；已触发浏览器下载，包内无密钥与执行授权。');
 });}
 async function switchView(next:'grid'|'list'){if(next===viewMode)return;setError('');try{
  const identity=sessionStore.getState();
  if(identity.status!=='authenticated')throw new Error('AUTH_REQUIRED');
  savePreferences({projectList:next==='list'});
  await sessionStore.saveDocument({expectedRevision:identity.document.revision,preferences:{...identity.document.preferences,projectList:next==='list'},lastVisitedPage:'/projects'});
  setViewMode(next);
 }catch(e){setError(workspaceMessage(e));}}
 async function openPurge(project:Project){
  setError('');setPurgeName('');
  let key: string=crypto.randomUUID();
  try{
   const identity=sessionStore.getState();
   if(identity.status==='authenticated'){
    const raw=localStorage.getItem('aiwork:purge-pending:'+identity.session.user.id+':'+project.id);
    if(raw){const saved=JSON.parse(raw) as {key?:unknown};if(typeof saved.key==='string'&&saved.key)key=saved.key;}
   }
  }catch{/* 持久化失败不阻断预检 */}
  setPurgeSingle({project,preview:undefined,failed:'',key});
  try{const preview=await client.purgePreview(project.id);if(alive.current)setPurgeSingle(current=>current&&current.project.id===project.id?{...current,preview}:current);}
  catch(e){if(alive.current)setPurgeSingle(current=>current&&current.project.id===project.id?{...current,failed:workspaceMessage(e)}:current);}
 }
 async function retryPurgePreview(){
  if(!purgeSingle)return;
  const target=purgeSingle;
  setError('');
  setPurgeSingle({...target,failed:''});
  try{const preview=await client.purgePreview(target.project.id);if(alive.current)setPurgeSingle(current=>current&&current.project.id===target.project.id?{...current,preview}:current);}
  catch(e){if(alive.current)setPurgeSingle(current=>current&&current.project.id===target.project.id?{...current,failed:workspaceMessage(e)}:current);}
 }
 function storePurgeBody(projectId:string,body:{title:string;expectedRevision:number;impactToken:string;confirmed:true;idempotencyKey:string}|undefined){  try{
   const identity=sessionStore.getState();
   if(identity.status!=='authenticated')return;
   const storageKey='aiwork:purge-pending:'+identity.session.user.id+':'+projectId;
   if(!body)localStorage.removeItem(storageKey);
   else localStorage.setItem(storageKey,JSON.stringify({key:body.idempotencyKey,body}));
  }catch{/* 忽略 */}
 }
 function clearPurgeKey(projectId:string){
  try{
   const identity=sessionStore.getState();
   if(identity.status==='authenticated')localStorage.removeItem('aiwork:purge-pending:'+identity.session.user.id+':'+projectId);
  }catch{/* 忽略 */}
 }
 async function commitPurge(){
  const target=purgeSingle;
  if(!target?.preview)return;
  const preview=target.preview;
  const body={title:purgeName,expectedRevision:preview.revision,impactToken:preview.impactToken,confirmed:true as const,idempotencyKey:target.key};
  storePurgeBody(target.project.id,body);
  await action(async()=>{
   await client.purgeProject(target.project.id,body);
   if(alive.current){clearPurgeKey(target.project.id);setPurgeSingle(undefined);setPurgeName('');await reload();}
  });
 }
 async function openPurgeBatch(ids:string[]){
  setError('');
  // 新批量只用当前列表中选中的项目；已消失行的残留选择与旧待办走独立恢复入口。
  const listed=ids.filter(id=>projects.some(p=>p.id===id));
  const savedItems:{projectId?:unknown;title?:unknown;revision?:unknown;impactToken?:unknown;preview?:unknown;key?:unknown;name?:unknown;done?:unknown}[]=[];
  try{
   const identity=sessionStore.getState();
   if(identity.status==='authenticated'){
    const raw=localStorage.getItem('aiwork:purge-batch-pending:'+identity.session.user.id);
    if(raw)for(const entry of JSON.parse(raw) as typeof savedItems)if(typeof entry.projectId==='string')savedItems.push(entry);
   }
  }catch{/* 忽略 */}
  const batch=listed.map(id=>{
   const project=projects.find(p=>p.id===id);
   const saved=savedItems.find(entry=>entry.projectId===id);
   const key=typeof saved?.key==='string'&&saved.key?saved.key:crypto.randomUUID();
   if(!project)return undefined;
   return {project,preview:undefined as PurgePreview|undefined,failed:'',key,name:'',done:false};
  }).filter((item):item is NonNullable<typeof item>=>!!item);
  // 新批量只含本次选择；打开时不写存储，避免占位值覆盖旧待办。预检成功后逐项合并写回。
  setPurgeBatch(batch);
  await Promise.all(listed.map(async id=>{
   try{const preview=await client.purgePreview(id);if(alive.current)setPurgeBatch(current=>current?.map(item=>item.project.id===id?{...item,preview}:item));}
   catch(e){if(alive.current)setPurgeBatch(current=>current?.map(item=>item.project.id===id?{...item,failed:workspaceMessage(e)}:item));}
  }));
 }
 async function retryBatchPreview(projectId:string){
  setError('');
  setPurgeBatch(current=>current?.map(item=>item.project.id===projectId?{...item,failed:''}:item));
  try{const preview=await client.purgePreview(projectId);if(alive.current)setPurgeBatch(current=>current?.map(item=>item.project.id===projectId?{...item,preview}:item));}
  catch(e){if(alive.current)setPurgeBatch(current=>current?.map(item=>item.project.id===projectId?{...item,failed:workspaceMessage(e)}:item));}
 }
 function prunePurgeBatchKeys(doneIds:string[]){
  try{
   const identity=sessionStore.getState();
   if(identity.status!=='authenticated')return;
   const storageKey='aiwork:purge-batch-pending:'+identity.session.user.id;
   const raw=localStorage.getItem(storageKey);
   if(!raw)return;
   const rest=(JSON.parse(raw) as {projectId?:unknown;key?:unknown}[]).filter(entry=>typeof entry.projectId==='string'&&!doneIds.includes(entry.projectId));
   if(rest.length)localStorage.setItem(storageKey,JSON.stringify(rest));
   else localStorage.removeItem(storageKey);
  }catch{/* 忽略 */}
 }
 function persistBatchItem(item:{project:{id:string;title:string};preview:PurgePreview;key:string;name:string},done:boolean){
  try{
   const identity=sessionStore.getState();
   if(identity.status!=='authenticated')return;
   const storageKey='aiwork:purge-batch-pending:'+identity.session.user.id;
   const raw=localStorage.getItem(storageKey);
   const list=raw?JSON.parse(raw) as {projectId?:unknown}[]:[];
   const entry={projectId:item.project.id,title:item.project.title,revision:item.preview.revision,impactToken:item.preview.impactToken,preview:item.preview,key:item.key,name:item.name,done};
   const next=list.filter(e=>e.projectId!==item.project.id);next.push(entry);
   localStorage.setItem(storageKey,JSON.stringify(next));
  }catch{/* 忽略 */}
 }
 async function commitPurgeBatch(){
  if(!purgeBatch)return;
  const batch=purgeBatch;
  await action(async()=>{
   const failed:BatchFailure[]=[];
   let succeeded=0;
   const doneIds:string[]=[];
   for(const item of batch){
    if(item.done||!item.preview||item.preview.blockingReasons.length||item.name!==item.preview.title)continue;
    persistBatchItem({project:item.project,preview:item.preview,key:item.key,name:item.name},false);
    try{await client.purgeProject(item.project.id,{title:item.name,expectedRevision:item.preview.revision,impactToken:item.preview.impactToken,confirmed:true,idempotencyKey:item.key});succeeded++;doneIds.push(item.project.id);}
    catch(e){failed.push({id:item.project.id,title:item.project.title,message:workspaceMessage(e)});continue;}
    if(alive.current)setPurgeBatch(current=>current?.map(row=>row.project.id===item.project.id?{...row,done:true}:row));
   }
   if(!alive.current)return;
   await reload();
   prunePurgeBatchKeys(doneIds);
   setBatchFailures(failed);
   const remaining=batch.filter(item=>!item.done).length-succeeded;
   if(!failed.length&&!remaining){setPurgeBatch(undefined);setBatchMessage('批量永久删除成功 '+succeeded+'；已删除项的任务、账务与审计收据保留。');}
   else setBatchMessage('批量永久删除成功 '+succeeded+'，失败 '+failed.length+'；成功项不再重复执行，失败项保留原请求可重试。');
  });
 }
 const visible=projects.filter(p=>(p.title+' '+p.description+' '+p.tags.join(' ')).toLowerCase().includes(query.toLowerCase())&&(filter==='all'||filter==='starred'&&p.starred||filter==='archived'&&p.archived||filter==='active'&&!p.archived)).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):b.updatedAt-a.updatedAt);
 const titleValid=!!title.trim()&&[...title].length<=60&&[...description].length<=500;
 const visibleIds=new Set(visible.map(p=>p.id)),hiddenSelectedCount=Array.from(selection).filter(id=>!visibleIds.has(id)).length;
 const toggleSelect=(id:string)=>setSelection(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
 const listBody=viewMode==='list'?<ProjectTable rows={visible} trashed={trashed} selection={selection} toggleSelect={toggleSelect} busy={busy} onRestore={project=>void action(()=>client.restoreProject(project.id,project.revision))} onExport={project=>void download(project)} onPurge={project=>void openPurge(project)}/>:<ul className={'cloud-project-list'+(preferences.projectList?' compact-project-list':'')}>{visible.map(p=><li className="card" key={p.id}>
   <h2><label><input data-interaction-id="cloud:project:select" aria-label={'选择项目'+p.title} type="checkbox" checked={selection.has(p.id)} onChange={()=>toggleSelect(p.id)}/></label>{trashed?p.title:<LocalLink data-interaction-id="cloud:project:open" href={'/projects/'+p.id+'/canvas'}>{p.title}</LocalLink>}</h2><p>{p.description}</p><p>{p.tags.join(' · ')}</p><small>修订 {p.revision} · {new Date(p.updatedAt).toLocaleString()}</small>
   <div className="actions"><Button data-interaction-id="cloud:project:export" disabled={busy} onClick={()=>download(p)}>导出完整项目包</Button>{trashed?<><Button data-interaction-id="cloud:project:restore" disabled={busy} onClick={()=>action(()=>client.restoreProject(p.id,p.revision))}>恢复项目</Button><Button data-interaction-id="cloud:project:purge" variant="danger" disabled={busy} onClick={()=>void openPurge(p)}>永久删除</Button></>:<>
    <Button data-interaction-id="cloud:project:rename" disabled={busy} onClick={()=>{setTarget(p);setTitle(p.title);setDescription(p.description);setTags(p.tags.join(', '));setOpen(true);}}>修改项目信息</Button>
    <Button data-interaction-id="cloud:project:copy" disabled={busy} onClick={()=>copy(p)}>复制项目</Button>
    <Button data-interaction-id="cloud:project:star" disabled={busy} onClick={()=>action(()=>client.patchProject(p.id,p.revision,{starred:!p.starred}))}>{p.starred?'取消星标':'星标'}</Button>
    <Button data-interaction-id="cloud:project:archive" disabled={busy} onClick={()=>action(()=>client.patchProject(p.id,p.revision,{archived:!p.archived}))}>{p.archived?'取消归档':'归档'}</Button>
    <Button data-interaction-id="cloud:project:trash" variant="danger" disabled={busy} onClick={()=>action(()=>client.trashProject(p.id,p.revision))}>移入回收站</Button>
   </>}</div>
  </li>)}</ul>;
 return <section className="card">
  <div className="actions"><h1>{trashed?'项目回收站':'项目'}</h1>{!trashed?<><Button data-interaction-id="cloud:project:new" variant="primary" onClick={()=>{setTarget(undefined);setTitle('');setDescription('');setTags('');setOpen(true);}}>新建项目</Button><Button data-interaction-id="cloud:project:template" onClick={()=>{setError('');setTemplateOpen(true);}}>使用原创模板</Button><Button data-interaction-id="cloud:project:import" onClick={()=>{setError('');setImportOpen(true);}}>导入云端项目包</Button></>:null}<Button data-interaction-id="cloud:project:reload" disabled={busy} onClick={()=>action(reload)}>重新加载项目</Button><Button data-interaction-id="cloud:project:view" aria-pressed={viewMode==='list'} onClick={()=>void switchView(viewMode==='list'?'grid':'list')}>{viewMode==='list'?'网格视图':'列表视图'}</Button></div>
  <div className="actions"><label>搜索项目<input data-interaction-id="cloud:project:search" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>排序<select data-interaction-id="cloud:project:sort" value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">最近更新</option><option value="title">名称</option></select></label><label>项目筛选<select data-interaction-id="cloud:project:filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部</option><option value="active">未归档</option><option value="starred">星标</option><option value="archived">已归档</option></select></label></div>
  {error?<p className="banner error" role="alert">{error}</p>:null}{batchMessage?<p role="status">{batchMessage}</p>:null}{batchFailures.length?<div className="banner warning"><h3>未完成的项目</h3><ul>{batchFailures.map(item=><li key={item.id}>{item.title}：{item.message}</li>)}</ul><Button data-interaction-id="cloud:project:batch-dismiss" onClick={()=>{setBatchFailures([]);setBatchMessage('');}}>关闭批量结果</Button></div>:null}
  {!trashed&&selection.size?<div className="banner actions"><strong>已选择 {selection.size} 项</strong>{hiddenSelectedCount?<small>包含筛选范围外 {hiddenSelectedCount} 项</small>:null}<Button data-interaction-id="cloud:project:batch-archive" disabled={busy} onClick={()=>{setBatchFailures([]);setBatchMessage('');setBatchOpen('archive');}}>批量归档</Button><Button data-interaction-id="cloud:project:batch-export" disabled={busy} onClick={()=>{setBatchFailures([]);setBatchMessage('');setBatchOpen('export');}}>批量导出所选项目</Button><Button data-interaction-id="cloud:project:selection-clear" onClick={()=>setSelection(new Set())}>清除选择</Button></div>:null}
  {trashed&&pendingPurge.length?<div className="banner actions"><strong>有 {pendingPurge.length} 项未完成的永久删除</strong><small>刷新或中断后可在此重试原动作，不会重复删除。</small>{pendingPurge.map(item=><span key={item.projectId}>{item.title}<Button data-interaction-id="cloud:project:purge-retry" disabled={busy} onClick={()=>void retryStoredPurge(item.projectId)}>重试原动作</Button><Button data-interaction-id="cloud:project:purge-abandon" disabled={busy} onClick={()=>abandonStoredPurge(item.projectId)}>放弃</Button></span>)}</div>:null}
  {trashed&&pendingBatchCount?<div className="banner actions"><strong>有 {pendingBatchCount} 项未完成的批量删除</strong><small>刷新后可恢复未知项并重试原请求。</small><Button data-interaction-id="cloud:project:purge-batch-restore" disabled={busy} onClick={()=>void restorePurgeBatch()}>恢复批量删除</Button></div>:null}
  {trashed&&selection.size?<div className="banner actions"><strong>已选择 {selection.size} 项</strong>{hiddenSelectedCount?<small>包含筛选范围外 {hiddenSelectedCount} 项</small>:null}<Button data-interaction-id="cloud:project:batch-purge" disabled={busy} onClick={()=>{setBatchFailures([]);setBatchMessage('');void openPurgeBatch(Array.from(selection));}}>批量永久删除</Button><Button data-interaction-id="cloud:project:selection-clear" onClick={()=>setSelection(new Set())}>清除选择</Button></div>:null}
  {loading?<p>正在读取云端项目…</p>:visible.length?listBody:<p>{query?'没有匹配的项目':trashed?'回收站没有项目':'还没有项目'}</p>}
  <Dialog open={open} title={target?'修改项目信息':'新建项目'} dismissible={!busy} onClose={()=>setOpen(false)} footer={<><Button data-interaction-id="cloud:project:cancel" disabled={busy} onClick={()=>setOpen(false)}>取消</Button><Button data-interaction-id="cloud:project:save" variant="primary" busy={busy} disabled={!titleValid} onClick={save}>{target?'保存项目信息':'创建项目'}</Button></>}>
   <label>项目名称<input data-interaction-id="cloud:project:title" value={title} onChange={e=>setTitle(e.target.value)}/></label><label>项目说明<textarea data-interaction-id="cloud:project:description" value={description} onChange={e=>setDescription(e.target.value)}/></label><label>项目标签（逗号分隔）<input data-interaction-id="cloud:project:tags" value={tags} onChange={e=>setTags(e.target.value)}/></label>{error?<p role="alert">{error}</p>:null}
  </Dialog>
  <Dialog open={importOpen} title="导入云端项目包" dismissible={!busy} onClose={()=>setImportOpen(false)} footer={<><Button data-interaction-id="cloud:project:import-cancel" disabled={busy} onClick={()=>setImportOpen(false)}>关闭</Button>{plan?<Button data-interaction-id="cloud:project:import-commit" variant="primary" busy={busy} onClick={commit}>确认导入当前账号</Button>:<Button data-interaction-id="cloud:project:import-inspect" disabled={!file} busy={busy} onClick={inspect}>校验并预览</Button>}</>}>
   <p>导入到当前账号，保留原包。校验和预览期间不会上传文件。</p>{plan?<><h2>{plan.data.project.title}</h2>{plan.legacy?<p data-interaction-id="cloud:project:legacy-note">旧离线包（v3 格式）已转换为云端格式；旧配置、会话和无类型连线未导入；{plan.legacy.isolated} 个不支持的旧节点已隔离。</p>:null}<p>{plan.data.graph.nodes.length} 个节点 · {plan.data.assets.length} 个素材 · {plan.data.history.receipts.length} 条画布历史</p><p>将创建一个新项目；执行授权不会导入。</p></>:<label>选择云端项目包<input data-interaction-id="cloud:project:import-file" type="file" accept=".zip" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]);setPlan(undefined);setError('');}}/></label>}{error?<p role="alert">{error}</p>:null}
  </Dialog>
  <Dialog open={templateOpen} title="使用原创模板" dismissible={!busy} onClose={()=>setTemplateOpen(false)} footer={<><Button data-interaction-id="cloud:project:template-cancel" disabled={busy} onClick={()=>setTemplateOpen(false)}>取消</Button><Button data-interaction-id="cloud:project:template-commit" variant="primary" busy={busy} onClick={createFromTemplate}>创建原创分镜草稿</Button></>}><p>原创静态结构：创作需求与分镜约束两个文本节点，无模型执行授权。将在当前账号创建新项目并进入画布。</p>{error?<p role="alert">{error}</p>:null}</Dialog>
  <Dialog open={batchOpen==='archive'} title="批量归档" dismissible={!busy} onClose={()=>setBatchOpen(undefined)} footer={<><Button data-interaction-id="cloud:project:batch-cancel" disabled={busy} onClick={()=>setBatchOpen(undefined)}>返回</Button><Button data-interaction-id="cloud:project:batch-archive-commit" variant="primary" busy={busy} onClick={commitBatchArchive}>归档 {selection.size} 项</Button></>}><p>已选择 {selection.size} 个项目逐项归档；每项用当前修订提交，失败项列出原因，已成功项保留。</p>{error?<p role="alert">{error}</p>:null}</Dialog>
  <Dialog open={batchOpen==='export'} title="批量导出项目包" dismissible={!busy} onClose={()=>setBatchOpen(undefined)} footer={<><Button data-interaction-id="cloud:project:batch-cancel" disabled={busy} onClick={()=>setBatchOpen(undefined)}>返回</Button><Button data-interaction-id="cloud:project:batch-export-commit" variant="primary" busy={busy} onClick={commitBatchExport}>导出 {selection.size} 项</Button></>}><p>已选择 {selection.size} 个项目：{Array.from(selection).map(id=>projects.find(p=>p.id===id)?.title??id).join('、')}。逐项导出完整包并合并一次下载；包内无密钥与执行授权，全部失败时不产出下载包。</p>{error?<p role="alert">{error}</p>:null}</Dialog>
  <Dialog open={!!purgeSingle} title="永久删除项目" dismissible={!busy} onClose={()=>setPurgeSingle(undefined)} footer={<><Button data-interaction-id="cloud:project:purge-cancel" disabled={busy} onClick={()=>setPurgeSingle(undefined)}>取消</Button>{purgeSingle?.preview?<Button data-interaction-id="cloud:project:purge-commit" variant="danger" busy={busy} disabled={!purgeName||purgeName!==purgeSingle.preview.title||purgeSingle.preview.blockingReasons.length>0} disabledReason={purgeSingle.preview.blockingReasons.length?'有未完成的任务，暂不可删除。':purgeName!==purgeSingle.preview.title?'输入完整项目名称才能确认。':undefined} onClick={commitPurge}>确认永久删除</Button>:null}</>}><p>将永久删除可编辑项目与画布（含撤销历史）；任务、账务、审计收据及共享素材保留。此操作不可撤销。</p>{!purgeSingle?.preview&&!purgeSingle?.failed?<p role="status">正在读取影响预检…</p>:null}{purgeSingle?.failed?<><p role="alert">{purgeSingle.failed}</p><Button data-interaction-id="cloud:project:purge-retry-preview" disabled={busy} onClick={()=>void retryPurgePreview()}>重试预检</Button></>:null}{purgeSingle?.preview?<><p>项目：{purgeSingle.preview.title} · 修订 {purgeSingle.preview.revision} · {purgeSingle.preview.nodeCount} 个节点 · {purgeSingle.preview.assetCount} 个素材引用 · {purgeSingle.preview.receiptCount} 条历史收据（保留）</p>{purgeSingle.preview.blockingReasons.length?<p role="alert">不可删除：{purgeSingle.preview.blockingReasons.join('、')}</p>:<label>输入完整项目名称确认<input data-interaction-id="cloud:project:purge-name" disabled={busy} value={purgeName} onChange={event=>setPurgeName(event.target.value)}/></label>}</>:null}{error?<p role="alert">{error}</p>:null}</Dialog>
  <Dialog open={!!purgeBatch} title="批量永久删除项目" dismissible={!busy} onClose={()=>setPurgeBatch(undefined)} footer={<><Button data-interaction-id="cloud:project:purge-cancel" disabled={busy} onClick={()=>setPurgeBatch(undefined)}>取消</Button><Button data-interaction-id="cloud:project:purge-batch-commit" variant="danger" busy={busy} onClick={commitPurgeBatch}>确认删除已确认项</Button></>}><p>每项单独预检并输入完整名称确认；仅提交已确认项。任务、账务、审计收据及共享素材保留，不可撤销。</p>{purgeBatch?.map(item=><article key={item.project.id} className="card"><h2>{item.project.title}</h2>{item.done?<p role="status">已删除；任务、账务与审计收据保留。</p>:!item.preview&&!item.failed?<p role="status">正在读取影响预检…</p>:null}{item.failed?<><p role="alert">{item.failed}</p><Button data-interaction-id="cloud:project:purge-batch-retry-preview" disabled={busy} onClick={()=>void retryBatchPreview(item.project.id)}>重试预检</Button></>:null}{!item.done&&item.preview?<><p>修订 {item.preview.revision} · {item.preview.nodeCount} 个节点 · {item.preview.receiptCount} 条收据（保留）</p>{item.preview.blockingReasons.length?<p role="alert">不可删除：{item.preview.blockingReasons.join('、')}</p>:<label>输入完整项目名称确认<input data-interaction-id="cloud:project:purge-batch-name" disabled={busy} value={item.name} onChange={event=>setPurgeBatch(current=>current?.map(row=>row.project.id===item.project.id?{...row,name:event.target.value}:row))}/></label>}</>:null}</article>)}{error?<p role="alert">{error}</p>:null}</Dialog>
 </section>;
}
