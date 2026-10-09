import {useEffect,useRef,useState} from 'react';
import type {Project} from '../../domain/project';
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
function ProjectTable({rows,trashed,selection,toggleSelect,busy,onRestore,onExport}:{rows:Project[];trashed:boolean;selection:Set<string>;toggleSelect:(id:string)=>void;busy:boolean;onRestore:(project:Project)=>void;onExport:(project:Project)=>void}){
 return <table className="cloud-project-table"><thead><tr><th>选择</th><th>项目</th><th>修订</th><th>更新</th><th>操作</th></tr></thead><tbody>{rows.map(row=>(<tr key={row.id}><td><input data-interaction-id="cloud:project:select" aria-label={'选择项目'+row.title} type="checkbox" checked={selection.has(row.id)} onChange={()=>toggleSelect(row.id)}/></td><td>{trashed?row.title:(<LocalLink data-interaction-id="cloud:project:open" href={'/projects/'+row.id+'/canvas'}>{row.title}</LocalLink>)}</td><td>{row.revision}</td><td>{new Date(row.updatedAt).toLocaleString()}</td><td>{trashed?(<><Button data-interaction-id="cloud:project:restore" disabled={busy} onClick={()=>onRestore(row)}>恢复项目</Button><Button data-interaction-id="cloud:project:export" disabled={busy} onClick={()=>onExport(row)}>导出完整项目包</Button></>):(<LocalLink data-interaction-id="cloud:project:open" href={'/projects/'+row.id+'/canvas'}>打开画布</LocalLink>)}</td></tr>))}</tbody></table>;
}
export function CloudProjectsPage({client,trashed=false}:{client:WorkspaceClient;trashed?:boolean}){
 const preferences=usePreferences();
 const [projects,setProjects]=useState<Project[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[sort,setSort]=useState<string>(preferences.projectSort),[filter,setFilter]=useState('all');
 useEffect(()=>setSort(preferences.projectSort),[preferences.projectSort]);
 const [open,setOpen]=useState(false),[target,setTarget]=useState<Project>(),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[tags,setTags]=useState(''),[busy,setBusy]=useState(false);
 const [importOpen,setImportOpen]=useState(false),[file,setFile]=useState<File>(),[plan,setPlan]=useState<CloudImportPlan>();
 const [selection,setSelection]=useState<Set<string>>(new Set()),[batchOpen,setBatchOpen]=useState<'archive'|'export'>(),[batchFailures,setBatchFailures]=useState<BatchFailure[]>([]),[templateOpen,setTemplateOpen]=useState(false),[batchMessage,setBatchMessage]=useState(''),[viewMode,setViewMode]=useState<'grid'|'list'>(preferences.projectList?'list':'grid');
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
 const visible=projects.filter(p=>(p.title+' '+p.description+' '+p.tags.join(' ')).toLowerCase().includes(query.toLowerCase())&&(filter==='all'||filter==='starred'&&p.starred||filter==='archived'&&p.archived||filter==='active'&&!p.archived)).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):b.updatedAt-a.updatedAt);
 const titleValid=!!title.trim()&&[...title].length<=60&&[...description].length<=500;
 const visibleIds=new Set(visible.map(p=>p.id)),hiddenSelectedCount=Array.from(selection).filter(id=>!visibleIds.has(id)).length;
 const toggleSelect=(id:string)=>setSelection(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
 const listBody=viewMode==='list'?<ProjectTable rows={visible} trashed={trashed} selection={selection} toggleSelect={toggleSelect} busy={busy} onRestore={project=>void action(()=>client.restoreProject(project.id,project.revision))} onExport={project=>void download(project)}/>:<ul className={'cloud-project-list'+(preferences.projectList?' compact-project-list':'')}>{visible.map(p=><li className="card" key={p.id}>
   <h2>{!trashed?<label><input data-interaction-id="cloud:project:select" aria-label={'选择项目'+p.title} type="checkbox" checked={selection.has(p.id)} onChange={()=>toggleSelect(p.id)}/></label>:null}{trashed?p.title:<LocalLink data-interaction-id="cloud:project:open" href={'/projects/'+p.id+'/canvas'}>{p.title}</LocalLink>}</h2><p>{p.description}</p><p>{p.tags.join(' · ')}</p><small>修订 {p.revision} · {new Date(p.updatedAt).toLocaleString()}</small>
   <div className="actions"><Button data-interaction-id="cloud:project:export" disabled={busy} onClick={()=>download(p)}>导出完整项目包</Button>{trashed?<Button data-interaction-id="cloud:project:restore" disabled={busy} onClick={()=>action(()=>client.restoreProject(p.id,p.revision))}>恢复项目</Button>:<>
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
 </section>;
}
