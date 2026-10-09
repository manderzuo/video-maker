import {useEffect,useState} from 'react';
import type {Project} from '../../domain/project';
import type {ReceiptSummary} from '../../domain/command-receipt';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {LocalLink} from '../../app/routes';
import {Button} from '../../ui/Button';
import {triggerLocalDownload} from '../../ui/local-download';
import {buildCloudDiagnostics} from './cloud-diagnostics';
const commandLabels:Record<ReceiptSummary['commandType'],string>={operations:'画布操作',undo:'撤销',redo:'重做',viewport:'视角'};
export function CloudActivityPage({client}:{client:WorkspaceClient}){
 const [rows,setRows]=useState<{project:Project;receipt:ReceiptSummary}[]>(),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function reload(){setError('');try{
  const projects=await client.listProjects();
  const per=await Promise.all(projects.map(async project=>({project,receipts:await client.listReceipts(project.id,10)})));
  const merged=per.flatMap(entry=>entry.receipts.map(receipt=>({project:entry.project,receipt}))).sort((a,b)=>b.receipt.createdAt-a.receipt.createdAt||b.receipt.revision-a.receipt.revision).slice(0,50);
  setRows(merged);
 }catch(e){setError(workspaceMessage(e));}}
 async function exportReport(){if(busy)return;setBusy(true);setError('');setMessage('');try{
  const [projects,runs,{configs}]=await Promise.all([client.listProjects(),client.listTasks(),client.modelConfigs()]);
  const per=await Promise.all(projects.map(async project=>({project,receipts:await client.listReceipts(project.id,10)})));
  const report=buildCloudDiagnostics({projects,receipts:per.flatMap(entry=>entry.receipts.map(receipt=>({project:entry.project,receipt}))),runs,configs});
  triggerLocalDownload(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),'aiwork-cloud-diagnostics.json');
  setMessage('已触发浏览器下载脱敏诊断报告；报告不含提示词全文、提交原文、密钥与媒体文件。');
 }catch(e){setError(workspaceMessage(e));}finally{setBusy(false);}}
 useEffect(()=>{let active=true;void reload().catch(()=>{if(active)setError('云端操作记录读取失败。');});return()=>{active=false;};},[client]);
 return <section className="card" aria-label="云端活动记录"><h1>云端活动记录</h1><p>只列出当前账号各项目的云端命令回执；按下述时间倒序，最多 50 条。完整画布历史仍在各项目内，可用撤销/重做查看。</p><div className="actions"><Button data-interaction-id="cloud:activity:reload" onClick={()=>void reload()}>重新读取</Button><Button data-interaction-id="cloud:activity:export" disabled={busy} busy={busy} onClick={()=>void exportReport()}>导出脱敏诊断</Button></div>{error?<p role="alert">{error}</p>:null}{message?<p role="status">{message}</p>:null}{rows===undefined?<p role="status">正在读取云端操作记录…</p>:rows.length?rows.map(({project,receipt})=><article key={receipt.id} className="card"><h2>{project.title}</h2><p>修订 {receipt.revision} · {commandLabels[receipt.commandType]} · {new Date(receipt.createdAt).toLocaleString()}</p><LocalLink data-interaction-id="cloud:activity:open" href={'/projects/'+encodeURIComponent(project.id)+'/canvas'}>打开项目画布</LocalLink></article>):<p>暂无云端操作记录；新建项目并保存画布后这里会列出。</p>}</section>;
}
