import {useState} from 'react';
import type {Run} from '../../domain/run';
import type {Asset} from '../../domain/asset';
import {getActiveCore} from '../../adapters/core/current-connection';
import {getVideoWork,type VideoWork} from '../../adapters/core/video-works';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
export function WorkBranchDialog({run,asset}:{run?:Run;asset?:Asset}){
 const [open,setOpen]=useState(false),[work,setWork]=useState<VideoWork>(),[status,setStatus]=useState('');
 const active=getActiveCore(),valid=!!run&&!!asset&&asset.sourceRunId===run.id&&run.resultAssetId===asset.id,original=valid&&active?.client.binding.id===run.authBindingId&&active?.client.profile.id===run.connectionId&&active?.client.profile.originSnapshot===run.originSnapshot;
 const canRead=!!original&&!!active?.capability.workContext&&!!run?.workContext?.workId,spec=run?.executionSpec??run?.requestedSpec;
 async function query(){if(!canRead||!run?.workContext)return;setWork(undefined);try{setWork(await getVideoWork(run.workContext.workId,run));setStatus('已读取原授权下的版本身份和状态。');}catch{setStatus('作业不可读或能力未开放；没有改走普通生成。');}}
 return <><Button onClick={()=>{setStatus('');setWork(undefined);setOpen(true);}}>作业版本与续写</Button><Dialog open={open} title="作业版本与续写" onClose={()=>setOpen(false)} footer={<Button onClick={()=>setOpen(false)}>关闭</Button>}>
 <p>当前素材固定关联原任务 {run?.id??'待恢复'}。切换授权不会改写归属。</p>
 <p>本地记录规格：{spec?[spec.modelId,spec.durationSeconds===undefined?'时长未知':spec.durationSeconds+'秒',spec.ratio??'比例未知',spec.resolution??'分辨率未知'].join(' · '):'尚无记录'}。这份记录不能替代 Core 的父版本完整规格。</p>
 <Button disabled={!canRead} disabledReason="需要原授权、已核验作业能力和原任务作业身份" onClick={query}>读取作业版本</Button><p role="status">{status}</p>
 {work?<ul>{work.versions.map(v=><li key={v.versionId}>{v.versionId} · {v.state}{v.operationRequestId===run?.coreRequestId?' · 此素材的原版本':''}</li>)}</ul>:null}
 <p>改版和续写执行暂未开放：父版本完整规格与部署能力尚未核验。续写时长表示新增片段；原片保留，不自动拼接，也不保证严格首帧锁定。</p>
 <div className="actions"><Button disabled disabledReason="父版本完整规格与部署能力尚未核验">确认改版</Button><Button disabled disabledReason="父版本完整规格与部署能力尚未核验">确认续写</Button></div>
 </Dialog></>;
}
