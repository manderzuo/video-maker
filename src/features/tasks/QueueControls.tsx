import {useEffect,useState} from 'react';
import {Button} from '../../ui/Button';
import type {CanvasNode} from '../../domain/graph';
import {runSchema,type Run} from '../../domain/run';
import {videoNumber} from './video-number';
import type {RunQueue} from '../../application/runs/queue';
import type {PollSummary} from '../../application/runs/poll-video';
import {withDatabase,transact,requestResult} from '../../infrastructure/storage/database';
import {QueueRunProgress,executionProgress} from './QueueRunProgress';
const states={draft:'待确认',ready:'准备就绪',active:'正在准备与提交',paused:'已暂停',waiting_confirmation:'等待输入确认',blocked:'依赖受阻',completed:'提交阶段已结束'};
const items={waiting_confirmation:'待确认输入',ready:'待提交',preparing:'正在准备',accepted:'已提交',blocked:'受阻',submit_unknown:'提交结果不明',withdrawn:'本地已撤回'};
export function QueueControls({queue,nodes,runs,canWrite,canResume=canWrite,onPause,onResume,onConcurrency}:{queue:RunQueue;nodes:CanvasNode[];runs:Run[];canWrite:boolean;canResume?:boolean;onPause:()=>Promise<void>;onResume:()=>void;onConcurrency:(value:number)=>Promise<void>}){
 const [live,setLive]=useState<{runs:Run[];summaries:PollSummary[];now:number}>({runs:[],summaries:[],now:Date.now()});
 const itemStamp=JSON.stringify(queue.items.map(i=>[i.nodeId,i.runId,i.status])),runStamp=JSON.stringify(runs.map(r=>[r.id,r.updatedAt,r.executionState,r.queryState]));
 useEffect(()=>{
  let alive=true,busy=false;const ids=queue.items.flatMap(i=>i.runId?[i.runId]:[]);
  async function refresh(){if(busy)return;busy=true;try{
   const data=await withDatabase(undefined,db=>transact(db,['runs','diagnostics'],'readonly',async tx=>({runs:(await Promise.all(ids.map(id=>requestResult(tx.objectStore('runs').get(id))))).flatMap(raw=>{const parsed=runSchema.safeParse(raw);return parsed.success&&parsed.data.projectId===queue.projectId?[parsed.data]:[];}),summaries:(await Promise.all(ids.map(id=>requestResult<PollSummary|undefined>(tx.objectStore('diagnostics').get('poll-summary:'+id))))).filter((r):r is PollSummary=>!!r&&ids.includes(r.runId))})));
   if(alive)setLive({...data,now:Date.now()});if(data.runs.length===ids.length&&data.runs.every(r=>['succeeded','failed_confirmed'].includes(r.executionState))&&queue.state!=='active'&&timer)clearInterval(timer);
  }catch{/* Keep the last observation; this reader never submits or queries Core. */}finally{busy=false;}}
  const timer=setInterval(()=>void refresh(),1000);void refresh();return()=>{alive=false;if(timer)clearInterval(timer);};
 },[queue.queueId,queue.projectId,queue.state,itemStamp,runStamp]);
 const pending=queue.items.filter(i=>!['accepted','submit_unknown','withdrawn'].includes(i.status));
 const findRun=(id:string|undefined,nodeId:string)=>{const stored=live.runs.find(r=>r.id===id&&r.nodeId===nodeId),current=runs.find(r=>r.id===id&&r.nodeId===nodeId);return stored&&(!current||stored.updatedAt>=current.updatedAt)?stored:current;};
 const currentRuns=queue.items.flatMap(i=>{const r=findRun(i.runId,i.nodeId);return r?[r]:[];}),executing=currentRuns.some(r=>['accepted','running','uploading','submitting'].includes(r.executionState)),failed=currentRuns.some(r=>r.executionState==='failed_confirmed');
 const headline=executing?'视频正在执行':queue.state==='completed'?failed?'视频生成失败':currentRuns.length&&currentRuns.every(r=>r.executionState==='succeeded')?'视频生成完成':'提交阶段已结束':states[queue.state];
 return <section aria-label="执行队列" className="queue-controls"><strong aria-live="polite">执行进度 · {headline}</strong><label>本地准备并行<select data-interaction-id="ui:QueueControls:select:310167e217d8" aria-label="本地准备并行" value={queue.preparationConcurrency} disabled={!canWrite||!['paused','ready','draft'].includes(queue.state)} onChange={event=>void onConcurrency(Number(event.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label><p>本地队列负责提交，下面持续显示生成状态。暂停待提交项不会取消已发出的任务。</p><ul>{queue.items.map(item=>{
  const run=findRun(item.runId,item.nodeId),tracked=run&&item.status==='accepted';
  return <li key={item.nodeId}><span title={'节点ID：'+item.nodeId}>{nodes.find(node=>node.id===item.nodeId)?.title??'历史视频节点'} · {tracked?executionProgress(run):items[item.status]}</span>{run?<small title={'任务ID：'+run.id}> · {videoNumber(run)}</small>:null}{tracked?<QueueRunProgress run={run} summary={live.summaries.find(s=>s.runId===run.id)} now={live.now}/>:null}{item.errorCode==='upstream_failed'?' · 原上游任务失败':item.requiresVisibleOutputs.length?' · 先查看并明确引用上游结果':''}</li>;
 })}</ul><Button data-interaction-id="C-17" disabled={!canWrite||!['ready','active'].includes(queue.state)} onClick={onPause}>暂停待提交项</Button><Button data-interaction-id="C-18" disabled={!canWrite||!canResume||queue.state!=='paused'||!pending.length||queue.items.some(i=>i.status==='submit_unknown')} disabledReason="待提交项需要重新确认；结果不明的请求请先核对原记录。" onClick={onResume}>重新确认待提交项</Button></section>;
}
