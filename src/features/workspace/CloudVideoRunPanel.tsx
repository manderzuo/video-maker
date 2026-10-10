import {canvasVideoSpecs} from '../../domain/canvas-video-spec';
import {useEffect,useRef,useState} from 'react';
import type {Graph} from '../../domain/graph';
import type {CloudVideoCapability,CloudVideoPreview,CloudVideoRecord} from '../../domain/cloud-video-run';
import type {GraphOperation} from '../../application/commands/registry';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {CloudVideoTaskDetail,cloudVideoStatus} from './CloudVideoTaskDetail';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {LocalLink} from '../../app/routes';
import {ApiError} from '../../infrastructure/api/client';
import {usePreferences} from '../settings/preferences-store';
import {CloudVideoInputEditor} from './CloudVideoInputEditor';
import {inspectVideoTextInputs} from './cloud-video-input';
export function CloudVideoRunPanel({client,graph,selected,saved,canEdit,stage,onResultInserted,preflightRequest}:{preflightRequest?:{id:string;nodeIds:string[]};client:WorkspaceClient;graph:Graph;selected:string[];saved:boolean;canEdit:boolean;stage:(operations:GraphOperation[])=>boolean;onResultInserted:()=>void}){
 const preferences=usePreferences(),[missingConfig,setMissingConfig]=useState(false);
 const [cap,setCap]=useState<CloudVideoCapability>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState<CloudVideoPreview>(),[fee,setFee]=useState(false),[unknown,setUnknown]=useState(false),[runs,setRuns]=useState<CloudVideoRecord[]>([]),[detail,setDetail]=useState<CloudVideoRecord>(),[choice,setChoice]=useState('');
 const alive=useRef(true),reading=useRef(false);
 const [previewInvalid,setPreviewInvalid]=useState(false),[confirmationUnknown,setConfirmationUnknown]=useState(false);
 const stalePreview=!!preview&&!confirmationUnknown&&(previewInvalid||graph.revision!==preview.graphRevision);
 useEffect(()=>{if(!preview||confirmationUnknown)return;const remaining=preview.expiresAt-Date.now();setPreviewInvalid(remaining<=0);const timer=setTimeout(()=>{setPreviewInvalid(true);setFee(false);setUnknown(false);},Math.max(0,remaining));return()=>clearTimeout(timer);},[preview?.id,confirmationUnknown]);
 useEffect(()=>{if(stalePreview){setFee(false);setUnknown(false);}},[stalePreview]);
 const specs=cap?canvasVideoSpecs(cap.videoSpecs):[];
 const nodes=graph.nodes.filter(node=>node.type==='video-generation'),picked=nodes.filter(node=>selected.includes(node.id)),nodeIds=picked.length?picked.map(node=>node.id):[choice||nodes[0]?.id].filter(Boolean);
 async function reload(){if(reading.current)return;reading.current=true;try{const rows=(await client.listTasks()).filter((run):run is CloudVideoRecord=>run.kind==='video'&&run.projectId===graph.projectId);if(alive.current){setRuns(rows);setDetail(current=>current?rows.find(run=>run.id===current.id)??current:current);}}catch(e){if(alive.current)setError(workspaceMessage(e));}finally{reading.current=false;}}
 useEffect(()=>{alive.current=true;void client.videoCapability().then(value=>{if(alive.current){setCap(value);setMissingConfig(false);}}).catch(e=>{if(alive.current){if(e instanceof ApiError&&e.code==='MODEL_CONFIG_REQUIRED')setMissingConfig(true);else setError(workspaceMessage(e));}});void reload();const timer=setInterval(()=>{void reload();},1500);return()=>{alive.current=false;clearInterval(timer);};},[client,graph.projectId]);
 async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await work();}catch(e){if(alive.current)setError(workspaceMessage(e));}finally{if(alive.current)setBusy(false);}}
 async function prepare(explicitIds?:string[]){
  const nodeIds=explicitIds??(picked.length?picked.map(node=>node.id):[choice||nodes[0]?.id].filter(Boolean));
  if(!nodeIds.length)return;
  if(nodes.some(node=>nodeIds.includes(node.id)&&!canvasVideoSpecs([node.data.draft]).length)){
   setError('请选择 5～15 秒、480P 或 720P 的已核验规格；原草稿与历史任务规格保留。');return;
  }
  if(!saved){setError('画布有未保存输入，请先保存到云端，拿到最新云端修订后再生成。');return;}
  const missingTitles=nodeIds.map(id=>{const node=nodes.find(n=>n.id===id);const checked=inspectVideoTextInputs(graph,id);return checked.missing?(node?.title||'未命名视频草稿'):null;}).filter(Boolean) as string[];
  if(missingTitles.length){setError('以下视频草稿缺少明确连接的提示词正文：'+missingTitles.join('、')+'。请在下方补正文并保存后再生成。');return;}
  await action(async()=>{
   // 保存成功后取最新修订再预检：先读回云端工作区确认修订一致，避免用过期修订提交。
   const fresh=await client.readWorkspace(graph.projectId);
   if(!alive.current)return;
   if(fresh.graph.revision!==graph.revision){setError('画布已有新修订（云端'+fresh.graph.revision+'，本页'+graph.revision+'），请重新加载后再生成。');return;}
   const config=await client.videoCapability(),value=await client.videoPreview(graph.projectId,fresh.graph.revision,config.configRevision,nodeIds);
   if(alive.current){setCap(config);setPreviewInvalid(false);setConfirmationUnknown(false);setPreview(value);setFee(false);setUnknown(false);}
  });
 }
 useEffect(()=>{if(preflightRequest)void prepare(preflightRequest.nodeIds);},[preflightRequest?.id]);
 async function confirm(){if(!preview)return;if(stalePreview||!confirmationUnknown&&Date.now()>=preview.expiresAt){setPreviewInvalid(true);setFee(false);setUnknown(false);return;}if(!fee||preview.priorUnknownRunIds.length&&!unknown)return;await action(async()=>{try{const created=await client.confirmVideo(graph.projectId,preview.id,unknown);if(alive.current){setRuns(rows=>[...created,...rows.filter(row=>!created.some(run=>run.id===row.id))]);setConfirmationUnknown(false);setPreview(undefined);}}catch(e){if(alive.current&&e instanceof ApiError){if(['PREVIEW_EXPIRED','CONFIG_CHANGED','VIDEO_MODEL_CHANGED'].includes(e.code)){setConfirmationUnknown(false);setPreviewInvalid(true);setFee(false);setUnknown(false);}else if(e.status===0||e.status>=500||e.code==='INVALID_RESPONSE')setConfirmationUnknown(true);}throw e;}});}
 return <section className="card"><h2>视频任务</h2><div className="video-task-list" aria-label="本项目视频任务" aria-live="polite">{runs.length?runs.map(run=><article key={run.id} data-execution-state={run.executionState}><p><strong>{graph.nodes.find(node=>node.id===run.nodeId)?.title??'视频任务'}</strong> · {cloudVideoStatus(run)} · {new Date(run.createdAt).toLocaleString()}</p><Button data-interaction-id="cloud:video:details" disabled={busy} onClick={()=>setDetail(run)}>查看视频任务</Button></article>):<p>尚无已确认的视频任务</p>}</div>{error?<p role="alert">{error}</p>:null}<details className="video-generation-settings" open><summary data-interaction-id="cloud:video:generation-settings">生成设置</summary><p>先保存画布，再检查本次文字、规格和参考素材。生成前需要确认费用。</p><div className="actions"><LocalLink data-interaction-id="cloud:video:open-results-page" href={'/projects/'+encodeURIComponent(graph.projectId)+'/results'}>打开视频结果页</LocalLink><LocalLink data-interaction-id="cloud:video:settings" href="/settings/connections">视频 API 设置</LocalLink></div>
  {preferences.showUnavailable||cap?.verified?<>{nodes.map(node=>{return <div key={node.id}><label>{node.title} · 生成规格<select aria-label={node.title+'生成规格'} data-interaction-id="cloud:video:spec" disabled={busy||!canEdit} value={JSON.stringify(node.data.draft)} onChange={event=>{const spec=specs.find(value=>JSON.stringify(value)===event.target.value);if(spec)stage([{id:crypto.randomUUID(),type:'update_node',payload:{nodeId:node.id,patch:{data:{...node.data,draft:spec,stale:true}}}}]);}}>{!specs.some(spec=>JSON.stringify(spec)===JSON.stringify(node.data.draft))?<option value={JSON.stringify(node.data.draft)}>当前规格：{node.data.draft.modelId} · {node.data.draft.durationSeconds??'未指定'} 秒 · {node.data.draft.ratio??'未指定'} · {node.data.draft.resolution??'未指定'}</option>:null}{specs.map(spec=><option key={JSON.stringify(spec)} value={JSON.stringify(spec)}>{spec.modelId} · {spec.durationSeconds} 秒 · {spec.ratio} · {spec.resolution??'默认分辨率'}</option>)}</select></label><CloudVideoInputEditor graph={graph} nodeId={node.id} canEdit={canEdit} stage={stage}/></div>;})}
  {!picked.length?<label>本次视频草稿<select aria-label="本次视频草稿" data-interaction-id="cloud:video:node" value={choice||nodes[0]?.id||''} disabled={busy} onChange={event=>setChoice(event.target.value)}>{nodes.length?nodes.map(node=><option key={node.id} value={node.id}>{node.title}</option>):<option value="">请先添加视频草稿</option>}</select></label>:<p>本次选择：{picked.map(node=>node.title).join('、')}</p>}
  <Button data-interaction-id="cloud:video:preview" disabled={busy||!saved||!nodeIds.length||!cap?.verified||!cap.videoSpecs.length} onClick={()=>void prepare()}>生成视频</Button></>:null}{missingConfig?<p>请先保存视频 API 配置，再选择已核验的生成规格。</p>:null}{!saved?<p>画布有未保存输入，请先保存到云端。</p>:null}{cap&&!cap.verified?<p>此 API 地址的视频规格尚未核验，当前不能提交生成。</p>:null}
</details>
  <Dialog open={!!preview} title="确认云端视频生成" dismissible={!busy} onClose={()=>setPreview(undefined)} footer={<><Button data-interaction-id="cloud:video:cancel" disabled={busy} onClick={()=>setPreview(undefined)}>取消</Button>{stalePreview?<Button data-interaction-id="cloud:video:refresh-preview" variant="primary" busy={busy} disabled={busy||!saved} onClick={()=>prepare(preview!.nodes.map(node=>node.nodeId))}>重新预览</Button>:<Button data-interaction-id="cloud:video:confirm" variant="primary" busy={busy} disabled={!fee||!!preview?.priorUnknownRunIds.length&&!unknown} onClick={confirm}>确认生成</Button>}</>}>
   <p>API：{preview?.apiBase} · 模型：{preview?.model}</p>{preview?.nodes.map(node=><article key={node.nodeId}><h3>{node.title}</h3><p>{node.inputSnapshot.spec.durationSeconds} 秒 · {node.inputSnapshot.spec.ratio} · {node.inputSnapshot.spec.resolution??'默认分辨率'}</p><pre aria-label="视频生成预览正文">{node.inputSnapshot.prompt}</pre><p>将上传的参考素材：{node.assets.length?node.assets.map(asset=>asset.title+'（'+asset.bytes+' 字节）').join('、'):'无'}</p></article>)}
   <label><input data-interaction-id="cloud:video:fee" type="checkbox" disabled={busy||stalePreview} checked={fee} onChange={event=>setFee(event.target.checked)}/>我确认所列视频生成可能收费</label>{preview?.priorUnknownRunIds.length?<><p>此前有 {preview.priorUnknownRunIds.length} 个提交结果未知，可能已经生成或扣费。</p><label><input data-interaction-id="cloud:video:unknown" type="checkbox" checked={unknown} disabled={busy||stalePreview} onChange={event=>setUnknown(event.target.checked)}/>我已核对未知任务，并确认再次生成的风险</label></>:null}{stalePreview?<p role="alert">确认单已失效，尚未提交本次生成。提示词、尾帧等参考素材和草稿保留；请点击“重新预览”，核对后重新确认费用。</p>:null}{confirmationUnknown?<p role="status">上次确认的结果尚未核实；再次点击确认将使用同一确认单读取或重试，不会创建新的确认单。</p>:null}{error?<p role="alert">{error}</p>:null}
  </Dialog>
  <Dialog open={!!detail} title="云端视频任务" onClose={()=>setDetail(undefined)}>{detail?<CloudVideoTaskDetail client={client} task={detail} canInsert={saved} onResultInserted={onResultInserted} onChanged={value=>{setDetail(value);setRuns(rows=>rows.map(row=>row.id===value.id?value:row));}}/>:null}</Dialog>
 </section>;
}
