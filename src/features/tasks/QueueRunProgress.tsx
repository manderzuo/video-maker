import type {Run} from '../../domain/run';
import type {PollSummary} from '../../application/runs/poll-video';
import {videoFailureMessage} from '../../domain/video-failure';
export function executionProgress(run:Run){
 const states:Record<string,string>={draft:'待确认',preflight_blocked:'输入待修复',awaiting_confirmation:'待确认',persisted:'准备提交',uploading:'上传参考素材',submitting:'正在提交',submit_unknown:'提交结果待核对',accepted:'已提交 · 排队中',running:'生成中',succeeded:'生成完成',failed_confirmed:'生成失败'};
 return states[run.executionState]??'状态待核对';
}
export function QueueRunProgress({run,summary,now}:{run:Run;summary?:PollSummary;now:number}){
 const terminal=['succeeded','failed_confirmed'].includes(run.executionState),end=terminal?run.executionFinishedAt:now,seconds=end===undefined?undefined:Math.max(0,Math.floor((end-run.createdAt)/1000)),duration=seconds===undefined?'':seconds>=60?`${Math.floor(seconds/60)}分${seconds%60}秒`:`${seconds}秒`;
 return <div className={'queue-run-progress '+(terminal?run.executionState:'active')}>
  <div role="progressbar" aria-label="视频执行进度" aria-valuetext={executionProgress(run)} {...(run.executionState==='succeeded'?{'aria-valuenow':100,'aria-valuemin':0,'aria-valuemax':100}:{})}><span/></div>
  <small>{terminal&&end===undefined?'耗时未记录':`${terminal?'耗时':'已等待'} ${duration}`} · {summary?.at?'最近同步 '+new Date(summary.at).toLocaleTimeString():'等待首次生成回执'}</small>
  {terminal&&['reserved','pending_reconciliation'].includes(run.billingState)?<p role="status">视频已结束 · 正在核对实际扣费和预冻结。</p>:null}
  {run.queryState==='auth_required'?<p role="status">连接中断 · 需要恢复原授权，远端任务可能仍在执行。</p>:run.queryState==='paused_by_user'?<p role="status">已停止查询 · 不代表取消生成。</p>:run.queryState==='interrupted'?<p role="status">状态查询暂时中断 · 保留原任务，正在等待恢复。</p>:!terminal?<p>自动跟踪服务状态；服务未提供百分比进度。</p>:null}
  {run.executionState==='failed_confirmed'?<p role="alert">{videoFailureMessage(summary?.errorCode)}</p>:null}
 </div>;
}
