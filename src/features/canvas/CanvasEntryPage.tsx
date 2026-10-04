import {useCallback,useEffect,useState} from 'react';
import type {Project} from '../../domain/project';
import {LocalLink,navigate} from '../../app/routes';
import {listProjects} from '../projects/project-service';
import {Button} from '../../ui/Button';

export function CanvasEntryPage(){
 const [projects,setProjects]=useState<Project[]>([]),[selectedId,setSelectedId]=useState('');
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const refresh=useCallback(async(isCurrent:()=>boolean=()=>true)=>{
  setLoading(true);setError('');
  try{
   const rows=(await listProjects()).filter(project=>project.trashedAt===null).sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
   if(!isCurrent())return;
   setProjects(rows);setSelectedId(current=>rows.some(project=>project.id===current)?current:'');
  }catch{if(isCurrent())setError('项目列表读取失败，本地数据未改动。请重试。');}
  finally{if(isCurrent())setLoading(false);}
 },[]);
 useEffect(()=>{let alive=true;void refresh(()=>alive);return()=>{alive=false;};},[refresh]);
 const selected=projects.find(project=>project.id===selectedId);
 return <section className="card" aria-labelledby="canvas-entry-heading">
  <h2 id="canvas-entry-heading">选择项目进入画布</h2>
  <p className="muted">选择一个项目继续创作，也可以新建项目从空白画布开始。</p>
  {loading?<p role="status">正在读取项目…</p>:error?<p role="alert">{error}</p>:projects.length===0?<p>还没有项目，创建后即可开始画布创作。</p>:<>
   <label htmlFor="canvas-entry-project">画布项目</label><select id="canvas-entry-project" data-interaction-id="canvas-entry:project" value={selectedId} onChange={event=>setSelectedId(event.target.value)}>
    <option value="">请选择项目</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title}{project.archived?' · 已归档':''}</option>)}
   </select>
   {selected?<p>{selected.description||'此项目暂无说明。'}</p>:null}
  </>}
  <div className="actions">
   <Button variant="primary" data-interaction-id="canvas-entry:open" disabled={loading||!!error||!selected} disabledReason="请先选择一个项目。" onClick={()=>{if(selected)navigate('/projects/'+encodeURIComponent(selected.id)+'/canvas');}}>进入画布</Button>
   <LocalLink data-interaction-id="canvas-entry:create" href="/projects?create=1">新建项目</LocalLink>
   <LocalLink data-interaction-id="canvas-entry:manage" href="/projects">管理项目</LocalLink>
   <Button data-interaction-id="canvas-entry:refresh" disabled={loading} onClick={()=>refresh()}>刷新项目列表</Button>
  </div>
 </section>;
}
