import {useEffect,useRef,useState} from 'react';
import type {Project} from '../../domain/project';
import {activityLabel,activityStateLabel,type Activity} from '../../domain/activity';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {LocalLink} from '../../app/routes';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {triggerLocalDownload} from '../../ui/local-download';
import {buildCloudDiagnostics} from './cloud-diagnostics';

export function CloudActivityPage({client}:{client:WorkspaceClient}){
 const [rows,setRows]=useState<Activity[]>([]),[projects,setProjects]=useState<Project[]>([]),[projectId,setProjectId]=useState(''),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [kind,setKind]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[detail,setDetail]=useState<Activity>(),[message,setMessage]=useState('');
 const generation=useRef(0),alive=useRef(true),reading=useRef(false);
 useEffect(()=>{alive.current=true;void Promise.all([client.listProjects(),client.listProjects(true)]).then(([active,trashed])=>{if(alive.current)setProjects([...active,...trashed]);}).catch(e=>{if(alive.current)setError(workspaceMessage(e));});return()=>{alive.current=false;generation.current++;};},[client]);
 async function reload(next?:string){
  const request=next?generation.current:++generation.current;if(next&&reading.current)return;reading.current=true;setBusy(true);setError('');
  try{const value=await client.listActivity({...(!projectId||projectId==='unassigned'?{}:{projectId}),...(projectId==='unassigned'?{unassigned:true}:{}),...(next?{cursor:next}:{})});if(alive.current&&request===generation.current){setRows(current=>next?[...current,...value.items.filter(item=>!current.some(row=>row.id===item.id))]:value.items);setCursor(value.nextCursor);}}
  catch(e){if(alive.current&&request===generation.current)setError(workspaceMessage(e));}
  finally{if(alive.current&&request===generation.current){reading.current=false;setBusy(false);}}
 }
 useEffect(()=>{setRows([]);setCursor(null);void reload();},[client,projectId]);
 async function exportReport(){if(busy)return;setBusy(true);setError('');try{const [projects,runs,{configs}]=await Promise.all([client.listProjects(),client.listTasks(),client.modelConfigs()]);const per=await Promise.all(projects.map(async project=>({project,receipts:await client.listReceipts(project.id,100)})));const report=buildCloudDiagnostics({projects,receipts:per.flatMap(entry=>entry.receipts.map(receipt=>({project:entry.project,receipt}))),runs,configs});triggerLocalDownload(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),'aiwork-cloud-diagnostics.json');setMessage('已触发浏览器下载脱敏诊断报告');}catch(e){if(alive.current)setError(workspaceMessage(e));}finally{if(alive.current)setBusy(false);}}
 const fromTime=from?new Date(from+'T00:00:00').getTime():undefined,toTime=to?new Date(to+'T23:59:59.999').getTime():undefined;
 const filtered=rows.filter(row=>(!kind||activityLabel(row)===kind)&&(fromTime===undefined||row.createdAt>=fromTime)&&(toTime===undefined||row.createdAt<=toTime));
 const labels=[...new Set(rows.map(activityLabel))];
 return <section className="card" aria-label="云端活动记录"><h1>活动</h1><div className="actions">
 <label>按项目分类<select aria-label="按项目分类" data-interaction-id="cloud:activity:filter-project" value={projectId} onChange={event=>setProjectId(event.target.value)}><option value="">全部项目</option><option value="unassigned">账号与公共素材操作</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title}{project.trashedAt!==null?'（回收站）':''}</option>)}</select></label>
 <label>操作类型<select data-interaction-id="cloud:activity:filter-kind" value={kind} onChange={event=>setKind(event.target.value)}><option value="">全部操作</option>{labels.map(label=><option key={label}>{label}</option>)}</select></label>
 <label>从日期<input data-interaction-id="cloud:activity:filter-from" type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label><label>到日期<input data-interaction-id="cloud:activity:filter-to" type="date" value={to} onChange={event=>setTo(event.target.value)}/></label>
 <Button data-interaction-id="cloud:activity:filter-clear" onClick={()=>{setProjectId('');setKind('');setFrom('');setTo('');}}>清除活动筛选</Button><Button data-interaction-id="cloud:activity:reload" disabled={busy} onClick={()=>void reload()}>重新读取</Button><Button data-interaction-id="cloud:activity:export" disabled={busy} onClick={()=>void exportReport()}>导出脱敏诊断</Button></div>
 <p>记录云端保存、编辑、上传、模型确认与失败操作；历史画布回执保留。记录不含密钥、提示词正文或媒体文件。</p>
 <p role="status">已加载 {rows.length} 条操作，当前显示 {filtered.length} 条{cursor?'；还有更早记录':''}。</p>{error?<p role="alert">{error}</p>:null}{message?<p role="status">{message}</p>:null}
 {filtered.map(row=><article key={row.id} className="card" data-interaction-id="cloud:activity:record"><h2>{activityLabel(row)}</h2><p>{row.projectTitle??'账号与公共素材'} · {activityStateLabel(row)} · {new Date(row.createdAt).toLocaleString()}{row.historical?' · 历史记录':''}</p><div className="actions"><Button data-interaction-id="cloud:activity:detail" onClick={()=>setDetail(row)}>查看操作详情</Button>{row.projectId?<LocalLink data-interaction-id="cloud:activity:open" href={'/projects/'+encodeURIComponent(row.projectId)+'/canvas'}>打开项目画布</LocalLink>:null}</div></article>)}
 {!busy&&!filtered.length?<p>暂无符合分类的操作记录。</p>:null}{cursor?<Button data-interaction-id="cloud:activity:more" busy={busy} onClick={()=>void reload(cursor)}>加载更早的操作</Button>:null}
 <Dialog open={!!detail} title="操作详情" onClose={()=>setDetail(undefined)}>{detail?<><p>{activityLabel(detail)} · {detail.projectTitle??'账号与公共素材'}</p><p>{new Date(detail.createdAt).toLocaleString()} · {activityStateLabel(detail)}</p><p>记录 {detail.id}</p>{detail.projectId?<LocalLink data-interaction-id="cloud:activity:detail-open" href={'/projects/'+encodeURIComponent(detail.projectId)+'/canvas'}>打开项目画布</LocalLink>:null}</>:null}</Dialog>
 </section>;
}
