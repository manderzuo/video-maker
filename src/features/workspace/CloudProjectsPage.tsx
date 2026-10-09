import {useEffect,useRef,useState} from 'react';
import type {Project} from '../../domain/project';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {exportCloudProject,inspectCloudProject,importCloudProject,type CloudImportPlan} from './cloud-project-package';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {LocalLink} from '../../app/routes';
import {usePreferences} from '../settings/preferences-store';
export function CloudProjectsPage({client,trashed=false}:{client:WorkspaceClient;trashed?:boolean}){
 const preferences=usePreferences();
 const [projects,setProjects]=useState<Project[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[sort,setSort]=useState<string>(preferences.projectSort),[filter,setFilter]=useState('all');
 useEffect(()=>setSort(preferences.projectSort),[preferences.projectSort]);
 const [open,setOpen]=useState(false),[target,setTarget]=useState<Project>(),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[tags,setTags]=useState(''),[busy,setBusy]=useState(false);
 const [importOpen,setImportOpen]=useState(false),[file,setFile]=useState<File>(),[plan,setPlan]=useState<CloudImportPlan>();
 const copies=useRef(new Map<string,{key:string;revision:number}>()),alive=useRef(true);
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
 const visible=projects.filter(p=>(p.title+' '+p.description+' '+p.tags.join(' ')).toLowerCase().includes(query.toLowerCase())&&(filter==='all'||filter==='starred'&&p.starred||filter==='archived'&&p.archived||filter==='active'&&!p.archived)).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):b.updatedAt-a.updatedAt);
 const titleValid=!!title.trim()&&[...title].length<=60&&[...description].length<=500;
 return <section className="card">
  <div className="actions"><h1>{trashed?'项目回收站':'项目'}</h1>{!trashed?<><Button data-interaction-id="cloud:project:new" variant="primary" onClick={()=>{setTarget(undefined);setTitle('');setDescription('');setTags('');setOpen(true);}}>新建项目</Button><Button data-interaction-id="cloud:project:import" onClick={()=>{setError('');setImportOpen(true);}}>导入云端项目包</Button></>:null}<Button data-interaction-id="cloud:project:reload" disabled={busy} onClick={()=>action(reload)}>重新加载项目</Button></div>
  <div className="actions"><label>搜索项目<input data-interaction-id="cloud:project:search" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>排序<select data-interaction-id="cloud:project:sort" value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">最近更新</option><option value="title">名称</option></select></label><label>项目筛选<select data-interaction-id="cloud:project:filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部</option><option value="active">未归档</option><option value="starred">星标</option><option value="archived">已归档</option></select></label></div>
  {error?<p className="banner error" role="alert">{error}</p>:null}
  {loading?<p>正在读取云端项目…</p>:visible.length?<ul className={'cloud-project-list'+(preferences.projectList?' compact-project-list':'')}>{visible.map(p=><li className="card" key={p.id}>
   <h2>{trashed?p.title:<LocalLink data-interaction-id="cloud:project:open" href={'/projects/'+p.id+'/canvas'}>{p.title}</LocalLink>}</h2><p>{p.description}</p><p>{p.tags.join(' · ')}</p><small>修订 {p.revision} · {new Date(p.updatedAt).toLocaleString()}</small>
   <div className="actions"><Button data-interaction-id="cloud:project:export" disabled={busy} onClick={()=>download(p)}>导出完整项目包</Button>{trashed?<Button data-interaction-id="cloud:project:restore" disabled={busy} onClick={()=>action(()=>client.restoreProject(p.id,p.revision))}>恢复项目</Button>:<>
    <Button data-interaction-id="cloud:project:rename" disabled={busy} onClick={()=>{setTarget(p);setTitle(p.title);setDescription(p.description);setTags(p.tags.join(', '));setOpen(true);}}>修改项目信息</Button>
    <Button data-interaction-id="cloud:project:copy" disabled={busy} onClick={()=>copy(p)}>复制项目</Button>
    <Button data-interaction-id="cloud:project:star" disabled={busy} onClick={()=>action(()=>client.patchProject(p.id,p.revision,{starred:!p.starred}))}>{p.starred?'取消星标':'星标'}</Button>
    <Button data-interaction-id="cloud:project:archive" disabled={busy} onClick={()=>action(()=>client.patchProject(p.id,p.revision,{archived:!p.archived}))}>{p.archived?'取消归档':'归档'}</Button>
    <Button data-interaction-id="cloud:project:trash" variant="danger" disabled={busy} onClick={()=>action(()=>client.trashProject(p.id,p.revision))}>移入回收站</Button>
   </>}</div>
  </li>)}</ul>:<p>{query?'没有匹配的项目':trashed?'回收站没有项目':'还没有项目'}</p>}
  <Dialog open={open} title={target?'修改项目信息':'新建项目'} dismissible={!busy} onClose={()=>setOpen(false)} footer={<><Button data-interaction-id="cloud:project:cancel" disabled={busy} onClick={()=>setOpen(false)}>取消</Button><Button data-interaction-id="cloud:project:save" variant="primary" busy={busy} disabled={!titleValid} onClick={save}>{target?'保存项目信息':'创建项目'}</Button></>}>
   <label>项目名称<input data-interaction-id="cloud:project:title" value={title} onChange={e=>setTitle(e.target.value)}/></label><label>项目说明<textarea data-interaction-id="cloud:project:description" value={description} onChange={e=>setDescription(e.target.value)}/></label><label>项目标签（逗号分隔）<input data-interaction-id="cloud:project:tags" value={tags} onChange={e=>setTags(e.target.value)}/></label>{error?<p role="alert">{error}</p>:null}
  </Dialog>
  <Dialog open={importOpen} title="导入云端项目包" dismissible={!busy} onClose={()=>setImportOpen(false)} footer={<><Button data-interaction-id="cloud:project:import-cancel" disabled={busy} onClick={()=>setImportOpen(false)}>关闭</Button>{plan?<Button data-interaction-id="cloud:project:import-commit" variant="primary" busy={busy} onClick={commit}>确认导入当前账号</Button>:<Button data-interaction-id="cloud:project:import-inspect" disabled={!file} busy={busy} onClick={inspect}>校验并预览</Button>}</>}>
   <p>导入到当前账号，保留原包。校验和预览期间不会上传文件。</p>{plan?<><h2>{plan.data.project.title}</h2>{plan.legacy?<p data-interaction-id="cloud:project:legacy-note">旧离线包（infinite-canvas v3）已转换为云端格式；旧配置、会话和无类型连线未导入；{plan.legacy.isolated} 个不支持的旧节点已隔离。</p>:null}<p>{plan.data.graph.nodes.length} 个节点 · {plan.data.assets.length} 个素材 · {plan.data.history.receipts.length} 条画布历史</p><p>将创建一个新项目；执行授权不会导入。</p></>:<label>选择云端项目包<input data-interaction-id="cloud:project:import-file" type="file" accept=".zip" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]);setPlan(undefined);setError('');}}/></label>}{error?<p role="alert">{error}</p>:null}
  </Dialog>
 </section>;
}
