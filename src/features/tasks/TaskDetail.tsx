import {useState} from 'react';
import {Dialog} from '../../ui/Dialog';
import {Button} from '../../ui/Button';
import {navigate} from '../../app/routes';
import {getActiveCore} from '../../adapters/core/current-connection';
import {redact} from '../../security/redaction';
import {taskExecutionLabel,queryLabels,deliveryLabels,billingLabels,querySingleTask,type TaskListItem} from './task-filters';
import {pausePolling} from '../../application/runs/poll-video';
import {studioTabId} from '../projects/project-service';
import {UnknownSubmissionDialog} from '../canvas/UnknownSubmissionDialog';
import {RunMediaActions} from '../review/RunMediaActions';
export function TaskDetail({item,onClose,onChange}:{item:TaskListItem;onClose:()=>void;onChange:()=>Promise<void>}){
 const [message,setMessage]=useState(''),[unknown,setUnknown]=useState(false),active=getActiveCore(),original=active?.client.binding.id===item.authBindingId&&active?.client.profile.id===item.connectionId&&active?.client.profile.originSnapshot===item.originSnapshot,uncertain=['submit_unknown','submitting'].includes(item.executionState);
 const technical=redact({message:JSON.stringify(item.kind==='video'?item.record.inputSnapshot:JSON.parse(item.record.requestSnapshot)).slice(0,65536)}) as {message:string};
 async function copy(value:string|undefined){try{const safe=redact({message:value??''}) as {message:string};await navigator.clipboard.writeText(safe.message);setMessage('已复制原编号。');}catch{setMessage('复制失败，请从详情手动选择编号。');}}
 async function query(){try{await querySingleTask(item);await onChange();setMessage('已查询原任务，没有创建新任务。');}catch{setMessage('查询尚未完成，请核对原服务与授权；未重新提交。');}}
 return <>{!unknown?<Dialog open title="任务详情" onClose={onClose} width={960} footer={<Button onClick={onClose}>关闭</Button>}>
 <h3>{item.title}</h3><p>{taskExecutionLabel(item)} · {queryLabels[item.queryState]} · {deliveryLabels[item.deliveryState]} · {billingLabels[item.billingState]}</p><p>原项目：{item.projectTitle}{item.projectArchived?' · 项目已归档，任务追踪仍保留':''}</p><p>原服务：{item.connectionId} · 原授权绑定：{item.authBindingId}</p>
 <dl><dt>本地记录</dt><dd className="break-word">{item.id}</dd><dt>Core任务ID</dt><dd className="break-word">{item.taskId??'未提供；不会编造查询身份'}</dd><dt>Core请求ID</dt><dd className="break-word">{item.coreRequestId??'未提供'}</dd></dl>
 <div className="actions"><Button disabled={!item.taskId} onClick={()=>copy(item.taskId)}>复制任务ID</Button><Button disabled={!item.coreRequestId} onClick={()=>copy(item.coreRequestId)}>复制请求ID</Button><Button disabled={!item.nodeExists||item.kind!=='video'} disabledReason="原节点已删除或不可用，保留历史且不重建" onClick={()=>{if(item.kind==='video'){onClose();navigate('/projects/'+encodeURIComponent(item.record.projectId)+'/canvas?node='+encodeURIComponent(item.record.nodeId));}}}>定位原节点</Button>{item.kind==='prompt'?<Button disabled={!item.draftExists} disabledReason="原草稿已不可用，保留请求历史" onClick={()=>{if(item.kind==='prompt'){onClose();navigate('/prompt-generator?draftId='+encodeURIComponent(item.record.draftId));}}}>查看原草稿</Button>:null}</div>
 {item.kind==='video'?<div className="actions"><Button disabled={!original||!item.taskId||uncertain} disabledReason="需要原授权及已知任务ID；未知提交单独核对" onClick={query}>重新查询原任务</Button><Button disabled={item.executionState!=='running'&&item.executionState!=='accepted'||item.queryState==='paused_by_user'} onClick={async()=>{try{await pausePolling(item.id,{tabId:studioTabId});await onChange();setMessage('已停止本地查询，不代表取消或退款。');}catch{setMessage('停止查询尚未保存，请保留原记录。');}}}>停止本地查询</Button>{uncertain?<Button onClick={()=>setUnknown(true)}>核对未知提交</Button>:null}</div>:<p>文字请求不支持异步任务查询或自动重放；原响应不明时保留记录，另一次优化必须重新确认。</p>}
 {item.kind==='video'&&item.executionState==='succeeded'?<RunMediaActions key={item.id} run={item.record}/>:null}
 <details><summary>技术详情</summary><p>executionState: {item.executionState}<br/>queryState: {item.queryState}<br/>deliveryState: {item.deliveryState}<br/>billingState: {item.billingState}</p><p>停止查询、下载失败与收到内容都不等于退款或账务结算。</p><pre className="task-snapshot">{technical.message}</pre></details><p role="status">{message}</p>
 </Dialog>:item.kind==='video'?<UnknownSubmissionDialog run={item.record} tabId={studioTabId} onClose={onClose} onRecovered={async()=>{await onChange();onClose();}}/>:null}</>;
}
