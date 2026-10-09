import {useEffect,useState} from 'react';
import type {Project} from '../../domain/project';
import type {ReceiptSummary} from '../../domain/command-receipt';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {LocalLink} from '../../app/routes';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {triggerLocalDownload} from '../../ui/local-download';
import {buildCloudDiagnostics} from './cloud-diagnostics';
const commandLabels:Record<ReceiptSummary['commandType'],string>={operations:'画布操作',undo:'撤销',redo:'重做',viewport:'视角'};
const hiddenKey='aiwork:activity:hidden';
function readHidden():string[]{try{const raw=localStorage.getItem(hiddenKey);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed.filter(id=>typeof id==='string'):[];}catch{return [];}}
export function CloudActivityPage({client}:{client:WorkspaceClient}){
 const [rows,setRows]=useState<{project:Project;receipt:ReceiptSummary}[]>(),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [query,setQuery]=useState(''),[kind,setKind]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[hidden,setHidden]=useState<string[]>(()=>readHidden()),[detail,setDetail]=useState<{project:Project;receipt:ReceiptSummary}>();
 async function reload(){setError('');try{
  const projects=await client.listProjects();
  const per=await Promise.all(projects.map(async project=>({project,receipts:await client.listReceipts(project.id,10)})));
  const merged=per.flatMap(entry=>entry.receipts.map(receipt=>({project:entry.project,receipt}))).sort((a,b)=>b.receipt.createdAt-a.receipt.createdAt||b.receipt.revision-a.receipt.revision).slice(0,50);
  setRows(merged);
 }catch(e){setError(workspaceMessage(e));}}
 function hide(id:string){setHidden(current=>{const next=[...current,id];try{localStorage.setItem(hiddenKey,JSON.stringify(next));}catch{/* 仅本地显示状态，失败不影响记录 */}return next;});}
 function showAll(){setHidden([]);try{localStorage.removeItem(hiddenKey);}catch{/* 同上 */}}
 async function exportReport(){if(busy)return;setBusy(true);setError('');setMessage('');try{
  const [projects,runs,{configs}]=await Promise.all([client.listProjects(),client.listTasks(),client.modelConfigs()]);
  const per=await Promise.all(projects.map(async project=>({project,receipts:await client.listReceipts(project.id,10)})));
  const report=buildCloudDiagnostics({projects,receipts:per.flatMap(entry=>entry.receipts.map(receipt=>({project:entry.project,receipt}))),runs,configs});
  triggerLocalDownload(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),'aiwork-cloud-diagnostics.json');
  setMessage('已触发浏览器下载脱敏诊断报告；报告不含提示词全文、提交原文、密钥与媒体文件。');
 }catch(e){setError(workspaceMessage(e));}finally{setBusy(false);}}
 useEffect(()=>{let active=true;void reload().catch(()=>{if(active)setError('云端操作记录读取失败。');});return()=>{active=false;};},[client]);
 const fromTime=from?new Date(from+'T00:00:00').getTime():undefined,toTime=to?new Date(to+'T23:59:59.999').getTime():undefined;
 const filtered=(rows??[]).filter(({project,receipt})=>!hidden.includes(receipt.id)&&(!query||project.title.toLowerCase().includes(query.toLowerCase()))&&(!kind||receipt.commandType===kind)&&(fromTime===undefined||receipt.createdAt>=fromTime)&&(toTime===undefined||receipt.createdAt<=toTime));
 const clearFilter=()=>{setQuery('');setKind('');setFrom('');setTo('');};
 return <section className="card" aria-label="云端活动记录"><h1>云端活动记录</h1><p>只列出当前账号各项目的云端命令回执；按下述时间倒序，最多 50 条。完整画布历史仍在各项目内，可用撤销/重做查看。隐藏仅影响本地显示，云端记录保留、不可删除。</p><div className="actions"><label>按项目标题筛选<input data-interaction-id="cloud:activity:filter-project" value={query} onChange={event=>setQuery(event.target.value)}/></label><label>命令类型<select data-interaction-id="cloud:activity:filter-kind" value={kind} onChange={event=>setKind(event.target.value)}><option value="">全部类型</option>{(['operations','undo','redo','viewport'] as const).map(type=><option key={type} value={type}>{commandLabels[type]}</option>)}</select></label><label>从日期<input data-interaction-id="cloud:activity:filter-from" type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label><label>到日期<input data-interaction-id="cloud:activity:filter-to" type="date" value={to} onChange={event=>setTo(event.target.value)}/></label></div><div className="actions"><Button data-interaction-id="cloud:activity:filter-clear" onClick={clearFilter}>清除活动筛选</Button><Button data-interaction-id="cloud:activity:hidden-clear" disabled={!hidden.length} onClick={showAll}>恢复隐藏显示{hidden.length?'（'+hidden.length+' 条）':''}</Button><Button data-interaction-id="cloud:activity:reload" onClick={()=>void reload()}>重新读取</Button><Button data-interaction-id="cloud:activity:export" disabled={busy} busy={busy} onClick={()=>void exportReport()}>导出脱敏诊断</Button></div><p role="status">共 {rows?.length??0} 条回执，当前显示 {filtered.length} 条{hidden.length?'，已隐藏 '+hidden.length+' 条本地显示':''}。</p>{error?<p role="alert">{error}</p>:null}{message?<p role="status">{message}</p>:null}{rows===undefined?<p role="status">正在读取云端操作记录…</p>:filtered.length?filtered.map(({project,receipt})=><article key={receipt.id} className="card"><h2>{project.title}</h2><p>修订 {receipt.revision} · {commandLabels[receipt.commandType]} · {new Date(receipt.createdAt).toLocaleString()}</p><div className="actions"><Button data-interaction-id="cloud:activity:detail" onClick={()=>setDetail({project,receipt})}>查看回执详情</Button><Button data-interaction-id="cloud:activity:hide" onClick={()=>hide(receipt.id)}>隐藏</Button></div><LocalLink data-interaction-id="cloud:activity:open" href={'/projects/'+encodeURIComponent(project.id)+'/canvas'}>打开项目画布</LocalLink></article>):<p>没有符合筛选的回执；可以清除筛选或恢复隐藏查看其他记录。云端记录保留，未被删除。</p>}
 <Dialog open={!!detail} title="回执详情" onClose={()=>setDetail(undefined)} footer={<Button data-interaction-id="cloud:activity:detail-close" onClick={()=>setDetail(undefined)}>关闭</Button>}>{detail?<><p>项目：{detail.project.title}</p><p>修订 {detail.receipt.revision} · {commandLabels[detail.receipt.commandType]}</p><p>{new Date(detail.receipt.createdAt).toLocaleString()} · 回执 {detail.receipt.id}</p><LocalLink data-interaction-id="cloud:activity:detail-open" href={'/projects/'+encodeURIComponent(detail.project.id)+'/canvas'}>打开项目画布</LocalLink></>:null}</Dialog></section>;
}
