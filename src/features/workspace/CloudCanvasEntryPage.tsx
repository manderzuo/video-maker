import {useEffect,useState} from 'react';
import type {Project} from '../../domain/project';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {LocalLink} from '../../app/routes';
export function CloudCanvasEntryPage({client}:{client:WorkspaceClient}){
 const [projects,setProjects]=useState<Project[]>(),[error,setError]=useState('');
 useEffect(()=>{let active=true;void client.listProjects().then(rows=>{if(active)setProjects(rows);}).catch(e=>{if(active)setError(workspaceMessage(e));});return()=>{active=false;};},[client]);
 return <section><div className="page-header"><div><h1>创作画布</h1><p className="muted">选择项目继续创作，画布保存在当前账号。</p></div><LocalLink data-interaction-id="restore:cloudcanvasentrypage:1" className="button" href="/projects?create=1">新建项目</LocalLink></div>{error?<p role="alert">{error}</p>:projects===undefined?<p role="status">正在读取项目…</p>:projects.length?<div className="cloud-assets-grid">{projects.map(project=><article className="card" key={project.id}><h2><LocalLink data-interaction-id="restore:cloudcanvasentrypage:2" href={'/projects/'+project.id+'/canvas'}>{project.title}</LocalLink></h2><p>{project.description}</p><LocalLink data-interaction-id="restore:cloudcanvasentrypage:3" className="button" href={'/projects/'+project.id+'/canvas'}>继续创作</LocalLink></article>)}</div>:<section className="card empty-state"><h2>从一个项目开始</h2><p>先创建项目，再在画布中添加文本、素材和视频草稿。</p><LocalLink data-interaction-id="restore:cloudcanvasentrypage:4" className="button" href="/projects?create=1">创建项目</LocalLink></section>}</section>;
}
