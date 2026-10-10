import {canvasVideoSpecs} from '../../domain/canvas-video-spec';
import {useEffect,useRef,useState} from 'react';
import type {Graph} from '../../domain/graph';
import type {CloudVideoPreview,CloudVideoRecord} from '../../domain/cloud-video-run';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {CloudVideoTaskDetail,cloudVideoStatus} from './CloudVideoTaskDetail';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {ApiError} from '../../infrastructure/api/client';
import {inspectVideoTextInputs} from './cloud-video-input';
export function CloudVideoRunPanel({client,graph,saved,onResultInserted,preflightRequest,onError}:{preflightRequest?:{id:string;nodeIds:string[]};client:WorkspaceClient;graph:Graph;saved:boolean;onResultInserted:()=>void;onError:(message:string)=>void}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState<CloudVideoPreview>(),[runs,setRuns]=useState<CloudVideoRecord[]>([]),[detail,setDetail]=useState<CloudVideoRecord>();
 const alive=useRef(true),reading=useRef(false),working=useRef(false);
 const [previewInvalid,setPreviewInvalid]=useState(false),[confirmationUnknown,setConfirmationUnknown]=useState(false);
 const stalePreview=!!preview&&!confirmationUnknown&&(previewInvalid||graph.revision!==preview.graphRevision);
 useEffect(()=>{if(!preview||confirmationUnknown)return;const remaining=preview.expiresAt-Date.now();setPreviewInvalid(remaining<=0);const timer=setTimeout(()=>setPreviewInvalid(true),Math.max(0,remaining));return()=>clearTimeout(timer);},[preview?.id,confirmationUnknown]);
 const nodes=graph.nodes.filter(node=>node.type==='video-generation');
 function reportError(message:string){setError(message);onError(message);}
 async function reload(){if(reading.current)return;reading.current=true;try{const rows=(await client.listTasks()).filter((run):run is CloudVideoRecord=>run.kind==='video'&&run.projectId===graph.projectId);if(alive.current){setRuns(rows);setDetail(current=>current?rows.find(run=>run.id===current.id)??current:current);}}catch(e){if(alive.current)setError(workspaceMessage(e));}finally{reading.current=false;}}
 useEffect(()=>{alive.current=true;void reload();const timer=setInterval(()=>{void reload();},1500);return()=>{alive.current=false;clearInterval(timer);};},[client,graph.projectId]);
 async function action(work:()=>Promise<void>){if(working.current)return;working.current=true;setBusy(true);reportError('');try{await work();}catch(e){if(alive.current)reportError(workspaceMessage(e));}finally{working.current=false;if(alive.current)setBusy(false);}}
 async function readPreview(nodeIds:string[]){
  if(!nodeIds.length)return;
  if(nodes.some(node=>nodeIds.includes(node.id)&&!canvasVideoSpecs([node.data.draft]).length)){
   reportError('请选择 5～15 秒、480P 或 720P 的已核验规格；原草稿与历史任务规格保留。');return;
  }
  if(!saved){reportError('画布有未保存输入，请先保存到云端，拿到最新云端修订后再生成。');return;}
  const missingTitles=nodeIds.map(id=>{const node=nodes.find(n=>n.id===id);const checked=inspectVideoTextInputs(graph,id);return checked.missing?(node?.title||'未命名视频草稿'):null;}).filter(Boolean) as string[];
  if(missingTitles.length){reportError('以下视频草稿缺少明确连接的提示词正文：'+missingTitles.join('、')+'。请在画布中连接文字节点并保存后再生成。');return;}
  // 保存成功后读回最新修订；过期确认刷新时仍使用同一组目标节点。
  const fresh=await client.readWorkspace(graph.projectId);
  if(!alive.current)return;
  if(fresh.graph.revision!==graph.revision){reportError('画布已有新修订（云端'+fresh.graph.revision+'，本页'+graph.revision+'），请重新加载后再生成。');return;}
  const config=await client.videoCapability(),value=await client.videoPreview(graph.projectId,fresh.graph.revision,config.configRevision,nodeIds);
  if(alive.current){setPreviewInvalid(false);setConfirmationUnknown(false);setPreview(value);return value;}
 }
 async function prepare(nodeIds:string[]){await action(async()=>{await readPreview(nodeIds);});}
 useEffect(()=>{if(preflightRequest)void prepare(preflightRequest.nodeIds);},[preflightRequest?.id]);
 async function confirm(){
  if(!preview)return;
  await action(async()=>{
   let approval=preview;
   if(!confirmationUnknown&&(stalePreview||Date.now()>=approval.expiresAt)){
    const fresh=await readPreview(approval.nodes.map(node=>node.nodeId));if(!fresh)return;
    // 新出现的未知任务必须让用户看到再次生成风险后再确认。
    if(fresh.priorUnknownRunIds.some(id=>!approval.priorUnknownRunIds.includes(id)))return;
    approval=fresh;
   }
   try{
    const created=await client.confirmVideo(graph.projectId,approval.id,approval.priorUnknownRunIds.length>0);
    if(alive.current){setRuns(rows=>[...created,...rows.filter(row=>!created.some(run=>run.id===row.id))]);setConfirmationUnknown(false);setPreview(undefined);}
   }catch(e){
    if(alive.current&&e instanceof ApiError){if(['PREVIEW_EXPIRED','CONFIG_CHANGED','VIDEO_MODEL_CHANGED'].includes(e.code)){setConfirmationUnknown(false);setPreviewInvalid(true);}else if(e.status===0||e.status>=500||e.code==='INVALID_RESPONSE')setConfirmationUnknown(true);}
    throw e;
   }
  });
 }
 return <section className="card"><h2>视频任务</h2><div className="video-task-list" aria-label="本项目视频任务" aria-live="polite">{runs.length?runs.map(run=><article key={run.id} data-execution-state={run.executionState}><p><strong>{graph.nodes.find(node=>node.id===run.nodeId)?.title??'视频任务'}</strong> · {cloudVideoStatus(run)} · {new Date(run.createdAt).toLocaleString()}</p><Button data-interaction-id="cloud:video:details" disabled={busy} onClick={()=>setDetail(run)}>查看视频任务</Button></article>):<p>尚无已确认的视频任务</p>}</div>{error?<p role="alert">{error}</p>:null}
  <Dialog open={!!preview} title="确认云端视频生成" width={480} dismissible={!busy} onClose={()=>setPreview(undefined)} footer={<><Button data-interaction-id="cloud:video:cancel" disabled={busy} onClick={()=>setPreview(undefined)}>取消</Button><Button data-interaction-id="cloud:video:confirm" variant="primary" busy={busy} disabled={busy||!saved} onClick={confirm}>确认</Button></>}>
   <p>{confirmationUnknown?'上次提交结果尚未核实，是否确认重试同一任务？':preview?.priorUnknownRunIds.length?'此前有 '+preview.priorUnknownRunIds.length+' 个任务结果未知，可能已经生成或扣费。是否确认再次生成？':'是否确认生成视频（可能产生费用）？'}</p>{error?<p role="alert">{error}</p>:null}
  </Dialog>
  <Dialog open={!!detail} title="云端视频任务" onClose={()=>setDetail(undefined)}>{detail?<CloudVideoTaskDetail client={client} task={detail} canInsert={saved} onResultInserted={onResultInserted} onChanged={value=>{setDetail(value);setRuns(rows=>rows.map(row=>row.id===value.id?value:row));}}/>:null}</Dialog>
 </section>;
}
