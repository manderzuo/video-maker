import {useEffect,useRef,useState} from 'react';
import type {Asset} from '../../domain/asset';
import type {CloudVideoRecord} from '../../domain/cloud-video-run';
import {videoFailureDetails} from '../../domain/video-failure';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {CloudAssetMedia} from './CloudAssetsPage';
import {Button} from '../../ui/Button';
export function cloudVideoStatus(task:CloudVideoRecord){return ({draft:'草稿',preflight_blocked:'预检未通过',awaiting_confirmation:'等待确认',persisted:'任务已保存，等待提交',uploading:'正在上传明确选择的参考素材',submitting:'正在提交生成',submit_unknown:'提交结果未知',accepted:'已接收，等待生成',running:'正在生成',succeeded:'生成已完成',failed_confirmed:'生成未完成'})[task.executionState];}
export function CloudVideoTaskDetail({client,task,onChanged,canInsert=true,onResultInserted}:{client:WorkspaceClient;task:CloudVideoRecord;onChanged:(task:CloudVideoRecord)=>void;canInsert?:boolean;onResultInserted?:()=>void}){
 const [asset,setAsset]=useState<Asset>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');const alive=useRef(true);
 useEffect(()=>{let active=true;alive.current=true;setAsset(undefined);if(task.resultAssetId)void client.readAsset(task.resultAssetId).then(value=>{if(active)setAsset(value);}).catch(e=>{if(active)setError(workspaceMessage(e));});return()=>{active=false;alive.current=false;};},[client,task.resultAssetId]);
 const historical='historical' in task&&task.historical,details=videoFailureDetails(task.failure,task.billingState),spec=task.executionSpec??task.inputSnapshot.spec;
 async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setMessage('');try{await work();}catch(e){if(alive.current)setError(workspaceMessage(e));}finally{if(alive.current)setBusy(false);}}
 async function control(mode:'pause'|'resume'|'withdraw'){if(historical)return;await action(async()=>{const current=await client.controlVideo(task.id,task.recordRevision,mode);if(alive.current)onChanged(current);});}
 async function insert(){if(!asset||!canInsert)return;await action(async()=>{
  const workspace=await client.readWorkspace(task.projectId);if(workspace.graph.nodes.some(node=>node.type==='result'&&node.data.runId===task.id&&node.data.assetId===asset.id)){setMessage('此结果已经在原画布中');return;}
  const source=workspace.graph.nodes.find(node=>node.id===task.nodeId),id=crypto.randomUUID(),operations=[{id:crypto.randomUUID(),type:'add_node' as const,payload:{node:{id,type:'result',title:asset.title,x:(source?.x??0)+400,y:source?.y??80,locked:false,data:{kind:'result',assetId:asset.id,runId:task.id}}}},...(source?.type==='video-generation'?[{id:crypto.randomUUID(),type:'add_edge' as const,payload:{edge:{id:crypto.randomUUID(),sourceId:source.id,targetId:id,port:'video',order:0,relation:'result'}}}]:[])];
  await client.command(task.projectId,workspace.graph.revision,{type:'operations',operations});if(alive.current){setMessage('视频结果已添加到原画布');onResultInserted?.();}
 });}
 return <section><p>{cloudVideoStatus(task)}</p><p>模型：{spec.modelId} · {spec.durationSeconds??'未指定'} 秒 · {spec.ratio??'未指定'} · {spec.resolution??'未指定'}</p><p>{historical?'导入的只读任务历史':'任务由服务器执行，关闭页面后仍保留记录。'}</p>
  {task.failure?<p role="status">{details.message}</p>:null}{details.upstreamCode?<p>错误码：{details.upstreamCode}。</p>:null}<p>{details.billingMessage}</p>
  {task.executionState==='submit_unknown'?<p>原请求可能已经执行。请先核对供应商记录；此任务不会自动再次生成。</p>:null}
  {task.issueCode==='UPLOAD_UNKNOWN'?<p>参考素材上传结果未知，尚未发送视频生成请求。</p>:task.issueCode==='SECRET_UNAVAILABLE'?<p>原密钥版本暂不可用，请恢复后查询原任务。</p>:task.issueCode==='RESULT_SAVE_PENDING'?<p>生成已完成，文件保存尚未完成。查询原任务会继续尝试保存结果。</p>:null}
  <h3>已确认的输入</h3><pre aria-label="视频任务输入">{task.inputSnapshot.prompt}</pre><p>参考素材：{task.inputSnapshot.references.length?task.inputSnapshot.references.map(ref=>ref.alias).join('、'):'无'}</p>
  {asset?<><h3>云端视频结果</h3><CloudAssetMedia client={client} asset={asset}/><Button data-interaction-id="cloud:video:insert-result" disabled={busy||!canInsert} onClick={insert}>添加结果到原画布</Button></>:null}
  {!historical?'taskId' in task&&task.taskId?<div className="actions"><p>{task.queryState==='paused_by_user'?'原任务查询已暂停':task.queryState==='auth_required'?'查询需要恢复原授权':'查询使用提交时保存的原授权'}</p><Button data-interaction-id="cloud:video:pause" disabled={busy||task.queryState==='paused_by_user'} onClick={()=>control('pause')}>暂停原任务查询</Button><Button data-interaction-id="cloud:video:resume" disabled={busy} onClick={()=>control('resume')}>恢复原任务查询</Button></div>:task.executionState==='persisted'?<Button data-interaction-id="cloud:video:withdraw" disabled={busy} onClick={()=>control('withdraw')}>撤回尚未提交的任务</Button>:null:null}
  {error?<p role="alert">{error}</p>:null}{message?<p role="status">{message}</p>:null}
 </section>;
}
