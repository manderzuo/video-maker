import {useEffect,useState} from 'react';
import type {Run} from '../../domain/run';
import {Dialog} from '../../ui/Dialog';
import {Button} from '../../ui/Button';
import {getActiveCore} from '../../adapters/core/current-connection';
import {recoverSubmission,readSavedSubmissionReply} from '../../application/runs/recover-submit';
export function UnknownSubmissionDialog({run,tabId,onClose,onRecovered}:{run:Run;tabId:string;onClose:()=>void;onRecovered:(run:Run)=>Promise<void>}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[journalTaskId,setJournalTaskId]=useState<string>();const active=getActiveCore(),original=!!active&&active.client.binding.id===run.authBindingId&&active.client.profile.id===run.connectionId&&active.client.binding.originSnapshot===run.originSnapshot,queryIdentity=run.taskId??journalTaskId;
 useEffect(()=>{let alive=true;void readSavedSubmissionReply(run).then(reply=>{if(alive&&reply?.ok)setJournalTaskId(reply.value.taskId);}).catch(()=>{if(alive)setMessage('原响应记录读取失败，请保留原请求核对。');});return()=>{alive=false;};},[run]);
 async function recover(action:'query_original'|'replay_original'){if(!active)return;setBusy(true);try{const result=await recoverSubmission(run.id,{action,...(action==='replay_original'?{confirmed:true as const}:{})},{...active,tabId});if(result.status==='manual_check')setMessage('没有可核验的原任务查询身份，请保留记录人工核对。');else await onRecovered(result.run);}catch{setMessage('原请求恢复尚未完成，请检查原服务授权或保留记录人工核对；未创建新任务。');}finally{setBusy(false);}}
 return <Dialog open title="任务未知结果" onClose={onClose} dismissible={!busy} footer={<><Button disabled={busy} onClick={onClose}>暂存待核对</Button><Button disabled={busy||!original||!queryIdentity} disabledReason={!original?'需要原服务和原授权':!queryIdentity?'尚无已保存的原任务ID，不编造查询接口':undefined} onClick={()=>recover('query_original')}>查询原任务</Button><Button disabled={busy||!original||active?.capability.videoIdempotencyReplay!==true} disabledReason={!original?'需要原服务和原授权':active?.capability.videoIdempotencyReplay!==true?'尚未核验此部署的幂等重放支持':undefined} onClick={()=>recover('replay_original')}>重放原请求</Button></>}>
 <p>原请求已经进入提交阶段，响应或保存结果不明；原任务可能仍在执行。此处不会创建新键、新素材或新收费尝试。</p><dl><dt>本地记录</dt><dd>{run.id}</dd><dt>原任务</dt><dd>{queryIdentity??'尚无可核验ID'}</dd><dt>原请求编号</dt><dd>{run.coreRequestId??'尚未保存'}</dd><dt>原幂等键</dt><dd className="break-word">{run.idempotencyKey}</dd><dt>原请求指纹</dt><dd className="break-word">{run.finalBodyHash??'尚未冻结请求'}</dd></dl><p>重放只在部署契约明确支持时开放，发送原字节和原键。停止查询、关闭本弹窗均不表示取消生成或退款。</p>{message?<p role="status">{message}</p>:null}
 </Dialog>;
}
