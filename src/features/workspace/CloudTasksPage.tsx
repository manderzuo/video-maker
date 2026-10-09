import {useEffect,useRef,useState} from 'react';
import type {CloudTask} from '../../domain/cloud-task';
import type {PromptDraft} from '../../domain/prompt';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {CloudPromptInputSnapshot} from './CloudPromptInputSnapshot';
export const cloudTaskStatus=(task:CloudTask)=>({persisted:'任务已保存，等待调用',sending:'模型调用中',response_received:'回复已保存，正在写入结果',succeeded:'已完成',failed_confirmed:'未发出调用',response_unknown:'调用结果未知'}[task.executionState]);
export function CloudTasksPage({client}:{client:WorkspaceClient}){
 const [tasks,setTasks]=useState<CloudTask[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[paused,setPaused]=useState(false),[query,setQuery]=useState(''),[details,setDetails]=useState<{task:CloudTask;input:PromptDraft}>();
 const alive=useRef(true),reading=useRef(false);
 async function reload(){if(reading.current)return;reading.current=true;try{const rows=await client.listTasks();if(alive.current){setTasks(rows);setError('');}}catch(e){if(alive.current)setError(workspaceMessage(e));}finally{reading.current=false;}}
 useEffect(()=>{alive.current=true;void reload();return()=>{alive.current=false;};},[client]);
 useEffect(()=>{if(paused)return;const timer=setInterval(()=>{void reload();},2000);return()=>clearInterval(timer);},[client,paused]);
 async function open(task:CloudTask){if(busy)return;setBusy(true);setError('');try{const current=await client.readTask(task.id),input=await client.draftRevision(current.draftId,current.sourceRevision);if(alive.current)setDetails({task:current,input});}catch(e){if(alive.current)setError(workspaceMessage(e));}finally{if(alive.current)setBusy(false);}}
 const visible=tasks.filter(task=>(task.model+' '+task.id+' '+cloudTaskStatus(task)).toLowerCase().includes(query.toLowerCase()));
 return <section className="card"><div className="actions"><h1>任务中心</h1><Button data-interaction-id="cloud:tasks:reload" disabled={busy} onClick={reload}>重新读取任务</Button><Button data-interaction-id="cloud:tasks:pause-read" onClick={()=>setPaused(value=>!value)}>{paused?'恢复状态查询':'暂停状态查询'}</Button></div><p>任务由服务器保存和执行。暂停状态查询或关闭页面后，已确认的模型调用仍可能继续。</p><label>搜索任务<input data-interaction-id="cloud:tasks:search" value={query} onChange={event=>setQuery(event.target.value)}/></label>{error?<p role="alert">{error}</p>:null}
  {visible.length?visible.map(task=><article key={task.id} className="card"><h2>提示词 AI 优化 · {cloudTaskStatus(task)}</h2><p>{task.model} · {new Date(task.createdAt).toLocaleString()}</p><p>{task.historical?'导入的只读任务历史 · 不会自动恢复调用':task.billingState==='pending_reconciliation'?'积分仍在核对，尚未确认最终扣费。':'供应商尚未提供最终账务信息。'}</p><Button data-interaction-id="cloud:tasks:details" disabled={busy} onClick={()=>open(task)}>查看任务详情</Button></article>):<p>暂无匹配任务</p>}
  <Dialog open={!!details} title="云端任务详情" onClose={()=>setDetails(undefined)}>{details?<><p>{cloudTaskStatus(details.task)}</p><p>模型：{details.task.model} · API：{details.task.apiBase}</p><p>输入修订 {details.task.sourceRevision} · 配置修订 {details.task.configRevision}</p><CloudPromptInputSnapshot input={details.input}/>{details.task.executionState==='response_unknown'?<p>请求可能已经执行。请先核对供应商记录，再决定是否明确发起新的调用。</p>:null}<Button data-interaction-id="cloud:tasks:details-reload" disabled={busy} onClick={()=>open(details.task)}>重新读取此任务</Button></>:null}</Dialog>
 </section>;
}
