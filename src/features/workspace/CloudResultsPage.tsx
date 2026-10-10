import {useEffect,useRef,useState} from 'react';
import type {Asset} from '../../domain/asset';
import type {CloudRun} from '../../domain/cloud-video-run';
import type {GraphOperation} from '../../application/commands/registry';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {navigate,useRoute,LocalLink} from '../../app/routes';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {CloudAssetMedia,uploadCloudAsset} from './CloudAssetsPage';
import {CloudVideoTaskDetail,cloudVideoStatus} from './CloudVideoTaskDetail';
import {extractFrameFile,frozenSnapshot,frozenSpec,placedNode,removePlacement,resultPlacement,revisionCopy,tailFrameBatch,unlinkResult,type VideoRecord} from './cloud-result-actions';
type Snapshot=Awaited<ReturnType<WorkspaceClient['readWorkspace']>>;
type ProjectResult={record:VideoRecord;asset?:Asset};
type Placement={nodeId:string;created:boolean};
const placementStorageKey='cloud-result-placements-v1';
type StoredPlacement={projectId:string;runId:string;nodeId:string;created:boolean};
function readStoredPlacements(projectId:string):Record<string,Placement>{
 try{
  if(typeof sessionStorage==='undefined')return {};
  const stored=JSON.parse(sessionStorage.getItem(placementStorageKey)??'[]') as StoredPlacement[];
  return Object.fromEntries(stored.filter(placement=>placement.projectId===projectId).map(placement=>[placement.runId,{nodeId:placement.nodeId,created:placement.created}]));
 }catch{return {};}
}
function writeStoredPlacements(projectId:string,placements:Record<string,Placement>){
 try{
  if(typeof sessionStorage==='undefined')return;
  const stored=(JSON.parse(sessionStorage.getItem(placementStorageKey)??'[]') as StoredPlacement[]).filter(placement=>placement.projectId!==projectId);
  for(const [runId,placement] of Object.entries(placements))stored.push({projectId,runId,nodeId:placement.nodeId,created:placement.created});
  sessionStorage.setItem(placementStorageKey,JSON.stringify(stored));
 }catch{/* Placement history is a convenience; graph state remains authoritative. */}
}
// Request frozen before the first send: the same key, base revision and
// operations are retried, so an unknown outcome can never duplicate work.
type FrozenRequest={key:string;baseRevision:number;operations:GraphOperation[];nodeIds:string[]};
type Phase='editing'|'sending'|'unknown'|'submitted';
type PendingKind='tail-frame'|'revision';
type PendingRequest={projectId:string;kind:PendingKind;recordId:string;key:string;baseRevision:number;operations:GraphOperation[];nodeIds:string[];prompt:string;time?:number;frameAssetId?:string;skipped?:string[];availability?:Record<string,boolean>;phase:'unknown'|'submitted';savedAt:number};
// Unknown or unconfirmed submissions survive cancel, close and refresh in this
// tab: reopening the same record restores the frozen request instead of
// creating a new key. Entries are keyed by account-owned project/record UUIDs,
// so another account in this tab can never match them; abandoning a pending
// request never cancels a server-side submission.
const pendingStorageKey='cloud-result-pending-v1';
function readPendingRequests(projectId:string):PendingRequest[]{
 try{
  if(typeof sessionStorage==='undefined')return [];
  const stored=JSON.parse(sessionStorage.getItem(pendingStorageKey)??'[]') as PendingRequest[];
  return stored.filter(entry=>entry.projectId===projectId&&entry.kind&&(entry.kind==='tail-frame'||entry.kind==='revision')&&typeof entry.key==='string');
 }catch{return [];}
}
function writePendingRequest(entry:PendingRequest){
 try{
  if(typeof sessionStorage==='undefined')return;
  const stored=(JSON.parse(sessionStorage.getItem(pendingStorageKey)??'[]') as PendingRequest[]).filter(candidate=>!(candidate.projectId===entry.projectId&&candidate.kind===entry.kind&&candidate.recordId===entry.recordId));
  stored.push(entry);
  sessionStorage.setItem(pendingStorageKey,JSON.stringify(stored));
 }catch{/* The dialog still holds the frozen request for this session. */}
}
function clearPendingRequest(projectId:string,kind:PendingKind,recordId:string){
 try{
  if(typeof sessionStorage==='undefined')return;
  const stored=(JSON.parse(sessionStorage.getItem(pendingStorageKey)??'[]') as PendingRequest[]).filter(candidate=>!(candidate.projectId===projectId&&candidate.kind===kind&&candidate.recordId===recordId));
  sessionStorage.setItem(pendingStorageKey,JSON.stringify(stored));
 }catch{/* Best effort; stale entries never match another account's records. */}
}
const videoRecords=(runs:CloudRun[],projectId:string)=>runs.filter((run):run is VideoRecord=>run.kind==='video'&&run.projectId===projectId&&run.executionState==='succeeded'&&!!run.resultAssetId);
const freeze=(operations:GraphOperation[],baseRevision:number):FrozenRequest=>({key:crypto.randomUUID(),baseRevision,operations,nodeIds:operations.flatMap(operation=>operation.type==='add_node'?[(operation.payload as {node:{id:string}}).node.id]:[])});
export function CloudResultsPage({client,projectId}:{client:WorkspaceClient;projectId:string}){
 const route=useRoute(),params=new URLSearchParams(route.split('?')[1]??''),highlight=params.get('runId')??undefined;
 const [snapshot,setSnapshot]=useState<Snapshot>(),[results,setResults]=useState<ProjectResult[]>([]),[media,setMedia]=useState<Asset[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [placements,setPlacements]=useState<Record<string,Placement>>(()=>readStoredPlacements(projectId)),[compare,setCompare]=useState<string[]>([]),[details,setDetails]=useState<VideoRecord>(),[pendingCount,setPendingCount]=useState(0);
 const [continuation,setContinuation]=useState<{result:ProjectResult;time:number;prompt:string;file?:File;preview?:string;frameAssetId?:string;request?:FrozenRequest;phase:Phase;error:string;message:string}>();
 const [revision,setRevision]=useState<{result:ProjectResult;prompt:string;skipped:string[];request?:FrozenRequest;phase:Phase;error:string;message:string;availability?:Record<string,boolean>}>();
 const alive=useRef(true),preview=useRef<string|undefined>(undefined),openedAction=useRef<string|undefined>(undefined);
 useEffect(()=>{
  const action=params.get('action'),key=highlight+':'+action;
  if(!highlight||!action||openedAction.current===key||!snapshot)return;
  const result=results.find(value=>value.record.id===highlight);
  if(!result)return;
  openedAction.current=key;
  if(action==='details')setDetails(result.record);
  else if(result.asset&&!result.asset.trashedAt){if(action==='tail-frame')openContinuation(result);else if(action==='revision')openRevision(result);}
 },[route,results,snapshot]);
 // The reference check needs every owned asset, not only the ones that produced a
 // result; otherwise still readable images would be reported as missing.
 const assets=new Map(media.map(asset=>[asset.id,asset] as const));
 async function reload(){const [workspace,runs,files]=await Promise.all([client.readWorkspace(projectId),client.listTasks(),client.listAssets()]);if(!alive.current)return;setSnapshot(workspace);setMedia(files);setResults(videoRecords(runs,projectId).map(record=>({record,asset:files.find(asset=>asset.id===record.resultAssetId)})));
  // Drop pending entries whose record no longer exists in this project; other
  // projects' entries are preserved untouched.
  const live=new Set(runs.map(run=>run.id));
  for(const entry of readPendingRequests(projectId))if(!live.has(entry.recordId))clearPendingRequest(projectId,entry.kind,entry.recordId);
  setPendingCount(readPendingRequests(projectId).length);}
 useEffect(()=>{alive.current=true;void reload().catch(e=>{if(alive.current)setError(workspaceMessage(e));});return()=>{alive.current=false;if(preview.current)URL.revokeObjectURL(preview.current);};},[client,projectId]);
 async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setMessage('');try{await work();}catch(e){if(alive.current)setError(workspaceMessage(e));}finally{if(alive.current)setBusy(false);}}
 // A committed command whose refresh failed is reported as committed, never as a
 // failed creation; the caller decides whether to retry the frozen request.
 async function commit(operations:GraphOperation[],key:string,baseRevision:number){await client.command(projectId,baseRevision,{type:'operations',operations},key);try{await reload();return 'refreshed' as const;}catch{return 'stale' as const;}}
 function choose(result:ProjectResult){void action(async()=>{if(!snapshot)return;const placed=resultPlacement(snapshot.graph,result.record,result.asset!);if(placed.reason){setError(placed.reason);return;}if(!placed.operations.length){setMessage('此结果已经关联到原画布');return;}const outcome=await commit(placed.operations,crypto.randomUUID(),snapshot.graph.revision);if(placed.placement)setPlacements(current=>{const next={...current,[result.record.id]:placed.placement!};writeStoredPlacements(projectId,next);return next;});setMessage(outcome==='refreshed'?(placed.placement?.created?'结果已放入画布并记录生成来源':'已复用画布中的结果节点并记录生成来源'):'结果已保存到画布，但重新读取失败；请点击重新读取结果。');});}
 function undo(result:ProjectResult){void action(async()=>{
  if(!snapshot||!result.asset)return;
  const known=placements[result.record.id],nodeId=known?.nodeId??placedNode(snapshot.graph,result.asset.id,result.record.id)?.id,created=known?.created??false;
  if(!nodeId){setMessage('此结果尚未放入画布');return;}
  const node=snapshot.graph.nodes.find(candidate=>candidate.id===nodeId);
  // 复用分支：已有的 asset 节点也可以承载本次新增的来源关联；校验只认
  // 同一素材的节点，绝不删除用户原节点与文件。
  const owned=node&&!node.locked&&((node.type==='result'&&node.data.assetId===result.asset.id&&node.data.runId===result.record.id)||(node.type==='asset'&&node.data.assetId===result.asset.id));
  const clearPlacement=()=>setPlacements(current=>{const next={...current};delete next[result.record.id];writeStoredPlacements(projectId,next);return next;});
  if(!owned){clearPlacement();setMessage('记录的放置与画布当前状态不一致，已清除本地记录；未删除任何节点。');return;}
  // 只有本次新建的 result 节点才允许移除；其他情况一律只解除关联。
  const removing=created&&node.type==='result';
  const operations=removing?removePlacement(snapshot.graph,nodeId):unlinkResult(snapshot.graph,nodeId);
  if(!operations.length){clearPlacement();setMessage(removing?'该结果节点已不在画布中，本地记录已清除。':'该生成来源关联已不在画布中，本地记录已清除；节点与文件保留。');return;}
  const outcome=await commit(operations,crypto.randomUUID(),snapshot.graph.revision);clearPlacement();
  setMessage(outcome==='refreshed'?(removing?'已移除本次放入的结果节点':'已解除生成来源关联；结果节点与文件保留'):'变更已提交，但重新读取失败；请点击重新读取结果。');
 });}
 function openContinuation(result:ProjectResult){
  const pending=readPendingRequests(projectId).find(entry=>entry.kind==='tail-frame'&&entry.recordId===result.record.id);
  if(pending&&result.asset){
   setContinuation({result,time:pending.time??1,prompt:pending.prompt,phase:pending.phase,frameAssetId:pending.frameAssetId,request:{key:pending.key,baseRevision:pending.baseRevision,operations:pending.operations,nodeIds:pending.nodeIds},error:'',message:'已恢复此前未确认的请求；请用同一请求重试，或重新读取结果确认。关闭弹窗不会取消服务端可能已提交的内容。'});
   if(pending.frameAssetId)void restoreFramePreview(pending.frameAssetId,result.record.id);
   return;
  }
  setContinuation({result,time:1,prompt:'',phase:'editing',error:'',message:''});
 }
 async function restoreFramePreview(frameAssetId:string,recordId:string){
  try{
   const blob=await client.downloadAsset(frameAssetId,'original',8*1024*1024);
   const file=new File([blob],'tail-frame.png',{type:blob.type||'image/png'});
   if(preview.current)URL.revokeObjectURL(preview.current);
   const url=URL.createObjectURL(file);preview.current=url;
   if(alive.current)setContinuation(value=>value&&value.result.record.id===recordId?{...value,file,preview:url}:value);
  }catch{/* 重试只用冻结的同一请求，不依赖本地预览文件。 */}
 }
 function discardContinuation(){
  if(!continuation?.request)return;
  clearPendingRequest(projectId,'tail-frame',continuation.result.record.id);
  setContinuation(undefined);setPendingCount(readPendingRequests(projectId).length);
  setMessage('已放弃本地未确认的续写请求；如服务端已提交，节点仍保留在画布中，请核对后再决定。');
 }
 async function extract(){if(!continuation)return;const current=continuation;setContinuation({...current,phase:'sending',error:'',message:''});try{
  if(!current.result.asset)throw new Error('result_asset_missing');
  const file=await extractFrameFile(client.contentUrl(current.result.asset.id),Math.max(0,current.time));
  if(preview.current)URL.revokeObjectURL(preview.current);
  const url=URL.createObjectURL(file);preview.current=url;
  if(alive.current)setContinuation(value=>value?{...value,phase:'editing',file,preview:url,frameAssetId:undefined,request:undefined,message:'尾帧已抽取；上传与保存前不会创建节点。'}:value);
 }catch(e){if(alive.current)setContinuation(value=>value?{...value,phase:'editing',error:e instanceof Error&&e.message==='frame_video_unreadable'?'无法读取该视频，未抽取尾帧；原文件保留。':workspaceMessage(e)}:value);}}
 async function saveContinuation(){if(!continuation||!snapshot||(!continuation.file&&!continuation.request))return;const current=continuation,file=current.file;
  if(current.phase!=='editing'&&current.request){await retryContinuation(current);return;}
  if(!current.prompt.trim()){setContinuation({...current,error:'请填写续写提示词；尾帧与输入会保留。'});return;}
  setContinuation({...current,phase:'sending',error:'',message:''});
  let frameAssetId=current.frameAssetId;
  try{
   if(!frameAssetId){
    if(!file){if(alive.current)setContinuation(value=>value?{...value,phase:'editing',error:'尾帧文件已不在本页，请重新抽取尾帧；原视频保留。'}:value);return;}
    frameAssetId=(await uploadCloudAsset(client,file)).id;
    if(alive.current)setContinuation(value=>value?{...value,frameAssetId}:value);
   }
  }
  catch{if(alive.current)setContinuation(value=>value?{...value,phase:'editing',error:'尾帧上传未完成；文件与输入保留，可重试上传。'}:value);return;}
  let request=current.request;
  try{
   if(!request){
    const frame=await client.readAsset(frameAssetId),batch=tailFrameBatch(snapshot.graph,current.result.record,current.result.asset!,frame,current.prompt.trim(),current.time);
    if(batch.reason){if(alive.current)setContinuation(value=>value?{...value,frameAssetId,phase:'editing',error:batch.reason!}:value);return;}
    request=freeze(batch.operations,snapshot.graph.revision);
   }
  }
  catch{if(alive.current)setContinuation(value=>value?{...value,frameAssetId,request:current.request,phase:'editing',error:'尾帧素材已上传并保留，但读取该素材失败；文件、预览、正文和上传的素材保留，可用同一素材重试。尚未提交图操作命令。'}:value);return;}
  if(alive.current)setContinuation(value=>value?{...value,frameAssetId,request,phase:'sending'}:value);
  if(request)await retryContinuation({result:current.result,time:current.time,prompt:current.prompt,file,preview:current.preview,frameAssetId,request,phase:'sending',error:'',message:''});
 }
 async function retryContinuation(current:{result:ProjectResult;time:number;prompt:string;file?:File;preview?:string;frameAssetId?:string;request?:FrozenRequest;phase:Phase;error:string;message:string}){
  const frozen=current.request;if(!frozen)return;
  const pending=():PendingRequest=>({projectId,kind:'tail-frame',recordId:current.result.record.id,key:frozen.key,baseRevision:frozen.baseRevision,operations:frozen.operations,nodeIds:frozen.nodeIds,prompt:current.prompt,time:current.time,frameAssetId:current.frameAssetId,phase:'unknown',savedAt:Date.now()});
  try{await client.command(projectId,frozen.baseRevision,{type:'operations',operations:frozen.operations},frozen.key);}
  catch{
   // The commit may have reached the server; the frozen request is kept so the
   // retry sends exactly the same key, revision and operations.
   writePendingRequest(pending());setPendingCount(readPendingRequests(projectId).length);
   if(alive.current)setContinuation(value=>value?{...value,phase:'unknown',error:'提交结果未知：本次请求已冻结。请用同一请求重试，或重新读取结果确认；不会重复创建。关闭弹窗后可重新打开继续处理。'}:value);
   return;
  }
  const applied=await settle(frozen,value=>setContinuation(state=>state?{...state,...value}:state));
  if(applied){clearPendingRequest(projectId,'tail-frame',current.result.record.id);setPendingCount(readPendingRequests(projectId).length);if(alive.current)setMessage('尾帧续写已保存为一个命令批次：帧素材、续写正文、视频草稿与关系');setContinuation(undefined);}
  else {writePendingRequest({...pending(),phase:'submitted'});setPendingCount(readPendingRequests(projectId).length);}
 }
 async function settle(frozen:FrozenRequest,apply:(patch:{phase:Phase;message:string;error:string})=>void){
  try{
   await reload();
   const present=await hasNodes(frozen.nodeIds);
   apply({phase:'submitted',message:present?'本次请求已保存；节点与素材未重复创建。':'本次请求已保存；正在读取最新结果。',error:''});
   return true;
  }catch{
   apply({phase:'submitted',message:'命令已提交成功，但重新读取失败；请点击重新读取结果确认，不会重复创建。',error:''});
   return false;
  }
 }
 async function hasNodes(ids:string[]){
  const workspace=await client.readWorkspace(projectId);
  return ids.some(id=>workspace.graph.nodes.some(node=>node.id===id));
 }
 async function resolveUnknown(frozen:FrozenRequest,close:(present:boolean)=>void){
  try{const present=await hasNodes(frozen.nodeIds);await reload();close(present);}
  catch(e){setError(workspaceMessage(e));}
 }
 function openRevision(result:ProjectResult){
  const pending=readPendingRequests(projectId).find(entry=>entry.kind==='revision'&&entry.recordId===result.record.id);
  if(pending){
   setRevision({result,prompt:pending.prompt,skipped:pending.skipped??[],request:{key:pending.key,baseRevision:pending.baseRevision,operations:pending.operations,nodeIds:pending.nodeIds},phase:pending.phase,availability:pending.availability,error:'',message:'已恢复此前未确认的请求；请用同一请求重试，或重新读取结果确认。关闭弹窗不会取消服务端可能已提交的内容。'});
   return;
  }
  setRevision({result,prompt:frozenSnapshot(result.record).prompt,skipped:[],phase:'editing',error:'',message:''});
  const references=frozenSnapshot(result.record).references;
  if(!references.length)return;
  // Availability is verified against the stored files, not only the library
  // listing: a reference whose bytes are gone is reported instead of silently
  // substituted, while readable ones are kept.
  void Promise.all(references.map(reference=>client.readAssetFiles(reference.assetId).then(()=>true).catch(()=>false))).then(flags=>{
   if(!alive.current)return;
   setRevision(current=>current&&current.result.record.id===result.record.id?{...current,availability:Object.fromEntries(references.map((reference,index)=>[reference.assetId,flags[index]]))}:current);
  });
 }
 function discardRevision(){
  if(!revision?.request)return;
  clearPendingRequest(projectId,'revision',revision.result.record.id);
  setRevision(undefined);setPendingCount(readPendingRequests(projectId).length);
  setMessage('已放弃本地未确认的修改请求；如服务端已提交，草稿仍保留在画布中，请核对后再决定。');
 }
 async function saveRevision(){if(!revision||!snapshot)return;const current=revision;
  if(current.phase!=='editing'&&current.request){await retryRevision(current);return;}
  if(!current.prompt.trim()){setRevision({...current,error:'请保留至少一行正文；原视频与快照不受影响。'});return;}
  const references=frozenSnapshot(current.result.record).references;
  if(references.length&&!current.availability){setRevision({...current,error:'正在确认引用素材是否可读，请稍候再保存。'});return;}
  const usable=new Map([...assets].filter(([id,asset])=>asset.trashedAt==null&&current.availability?.[id]!==false));
  setRevision({...current,phase:'sending',error:'',message:''});
  try{
   const copy=revisionCopy(snapshot.graph,current.result.record,current.result.asset!,current.prompt.trim(),usable),request=current.request??freeze(copy.operations,snapshot.graph.revision);
   setRevision({...current,skipped:copy.skipped,request,phase:'sending'});
   await retryRevision({...current,request,phase:'sending'});
  }catch(error){if(alive.current)setRevision(value=>value?{...value,phase:'editing',error:workspaceMessage(error)}:value);}
 }
 async function retryRevision(current:{result:ProjectResult;prompt:string;skipped:string[];request?:FrozenRequest;phase:Phase;availability?:Record<string,boolean>}){
  const frozen=current.request;if(!frozen)return;
  const pending=():PendingRequest=>({projectId,kind:'revision',recordId:current.result.record.id,key:frozen.key,baseRevision:frozen.baseRevision,operations:frozen.operations,nodeIds:frozen.nodeIds,prompt:current.prompt,skipped:current.skipped,availability:current.availability,phase:'unknown',savedAt:Date.now()});
  try{await client.command(projectId,frozen.baseRevision,{type:'operations',operations:frozen.operations},frozen.key);}
  catch{
   writePendingRequest(pending());setPendingCount(readPendingRequests(projectId).length);
   if(alive.current)setRevision(value=>value?{...value,phase:'unknown',error:'提交结果未知：本次请求已冻结。请用同一请求重试，或重新读取结果确认；不会重复创建草稿。关闭弹窗后可重新打开继续处理。'}:value);
   return;
  }
  const applied=await settle(frozen,value=>setRevision(state=>state?{...state,...value,skipped:state.skipped}:state));
  if(applied){clearPendingRequest(projectId,'revision',current.result.record.id);setPendingCount(readPendingRequests(projectId).length);if(alive.current)setMessage('已创建修改后的视频草稿；原视频、原快照与原任务保留。');setRevision(undefined);}
  else {writePendingRequest({...pending(),phase:'submitted'});setPendingCount(readPendingRequests(projectId).length);}
 }
 const frozenBusy=(phase:Phase)=>phase!=='editing';
 const download=(asset:Asset|undefined)=><a className="button" data-interaction-id="cloud:results:download" href={asset?client.contentUrl(asset.id):undefined} download={asset?.title}>下载视频</a>;
 return <section className="card">
  <div className="actions"><h1>视频结果</h1><Button data-interaction-id="cloud:results:reload" disabled={busy} onClick={()=>void action(reload)}>重新读取结果</Button><LocalLink data-interaction-id="cloud:results:canvas" href={'/projects/'+encodeURIComponent(projectId)+'/canvas'}>返回画布</LocalLink></div>
  <p>结果只读取当前账号的云端视频任务与素材；每项都能直接播放、下载、审片、比较，并作为后续节点的来源。</p>
  {error?<p role="alert" className="banner error">{error}</p>:null}{message?<p role="status">{message}</p>:null}
  {pendingCount>0?<p role="status" data-interaction-id="cloud:results:pending">有 {pendingCount} 个提交未确认的续写/修改请求；重新打开对应结果可继续处理，确认前不会重复创建。</p>:null}
  {compare.length?<div className="actions"><p data-interaction-id="cloud:results:compare-pick">已选择 {compare.length} 个版本</p><Button data-interaction-id="cloud:results:compare-open" disabled={compare.length!==2} onClick={()=>navigate('/projects/'+encodeURIComponent(projectId)+'/compare?runs='+compare.map(encodeURIComponent).join(','))}>打开 A/B 比较</Button></div>:null}
  {results.length?results.map(({record,asset})=>{const existing=snapshot&&asset?placedNode(snapshot.graph,asset.id,record.id):undefined;return <article key={record.id} className="card" data-interaction-id="cloud:results:item" data-run-id={record.id} data-highlighted={highlight===record.id||undefined}>
   <h2>{asset?.title??'结果视频'} · {cloudVideoStatus(record)}</h2>
   {highlight===record.id?<p data-interaction-id="cloud:results:highlighted">已定位到该结果版本</p>:null}
   <p>{frozenSpec(record).modelId} · {frozenSpec(record).durationSeconds??'未指定'} 秒 · {frozenSpec(record).ratio??'未指定'} · {new Date(record.createdAt).toLocaleString()}</p>
   {asset?<CloudAssetMedia client={client} asset={asset}/>:<p className="banner warning" data-interaction-id="cloud:results:missing">此任务的结果素材缺失或已删除；不会自动替换为其他文件。原任务与账务记录保留。</p>}
   <div className="actions">
    {download(asset)}
    <Button data-interaction-id="cloud:results:details" disabled={busy} onClick={()=>setDetails(record)}>查看任务详情</Button>
    <Button data-interaction-id="cloud:results:choose" disabled={busy||!asset} onClick={()=>choose({record,asset})}>选择此结果放入画布</Button>
    <Button data-interaction-id="cloud:results:undo" disabled={busy||!existing} onClick={()=>undo({record,asset})}>撤销选择</Button>
    <Button data-interaction-id="cloud:results:tail-frame" disabled={busy||!asset} onClick={()=>openContinuation({record,asset})}>尾帧续写</Button>
    <Button data-interaction-id="cloud:results:revision" disabled={busy||!asset} onClick={()=>openRevision({record,asset})}>修改后重新生成</Button>
    <label>加入比较<input data-interaction-id="cloud:results:compare" type="checkbox" checked={compare.includes(record.id)} onChange={event=>setCompare(current=>event.target.checked?[...new Set([...current,record.id])].slice(0,2):current.filter(id=>id!==record.id))}/></label>
   </div>
   {existing?<p data-interaction-id="cloud:results:linked">已在画布中：结果节点 {existing.id}（来源关系已记录）</p>:null}
  </article>;}):<p>当前项目还没有已完成的视频结果。</p>}
  <Dialog open={!!details} title="云端视频任务" onClose={()=>setDetails(undefined)}>{details?<><CloudVideoTaskDetail client={client} task={details} onChanged={()=>void reload()}/><Button data-interaction-id="cloud:results:details-close" onClick={()=>setDetails(undefined)}>关闭云端视频结果</Button></>:null}</Dialog>
  <Dialog open={!!continuation} title="尾帧续写" dismissible={continuation?.phase!=='sending'} onClose={()=>setContinuation(undefined)} footer={<>
   <Button data-interaction-id="cloud:results:tail-frame-cancel" disabled={continuation?.phase==='sending'} onClick={()=>setContinuation(undefined)}>取消</Button>
   {(continuation?.phase==='unknown'||continuation?.phase==='submitted')&&continuation.request?<Button data-interaction-id="cloud:results:tail-frame-discard" onClick={discardContinuation}>放弃未确认请求</Button>:null}
   {continuation?.request?<Button data-interaction-id="cloud:results:tail-frame-check" disabled={continuation.phase==='sending'} onClick={()=>void resolveUnknown(continuation.request!,present=>{if(present){clearPendingRequest(projectId,'tail-frame',continuation.result.record.id);setPendingCount(readPendingRequests(projectId).length);setContinuation(undefined);setMessage('此前的请求其实已保存；未重复创建。');}else setContinuation(current=>current?{...current,message:'未发现本次请求创建的节点；可用同一请求重试。'}:current);})}>重新读取结果确认</Button>:null}
   <Button data-interaction-id="cloud:results:tail-frame-save" variant="primary" busy={continuation?.phase==='sending'} disabled={(!continuation?.file&&!continuation?.request)||!continuation.prompt.trim()} onClick={saveContinuation}>{continuation?.request?(continuation.frameAssetId?'重试保存续写流程':'重试保存续写流程'):'上传尾帧并保存续写流程'}</Button>
  </>}>
   {continuation?<>
    <p>抽帧只读取当前账号的结果视频；上传后作为本账号素材引用，原视频与原任务不变。</p>
    <label>抽取时间（秒）<input data-interaction-id="cloud:results:tail-frame-time" type="number" min="0" step="0.1" disabled={frozenBusy(continuation.phase)} value={continuation.time} onChange={event=>setContinuation({...continuation,time:Number(event.target.value)})}/></label>
    <Button data-interaction-id="cloud:results:tail-frame-extract" disabled={frozenBusy(continuation.phase)} onClick={()=>void extract()}>抽取并预览尾帧</Button>
    {continuation.preview?<img data-interaction-id="cloud:results:tail-frame-preview" src={continuation.preview} alt="尾帧预览" style={{maxWidth:'100%',maxHeight:240}}/>:null}
    <label>续写提示词<textarea data-interaction-id="cloud:results:tail-frame-prompt" disabled={frozenBusy(continuation.phase)} value={continuation.prompt} onChange={event=>setContinuation({...continuation,prompt:event.target.value})}/></label>
    {continuation.message?<p role="status">{continuation.message}</p>:null}
    {continuation.error?<p role="alert">{continuation.error}</p>:null}
   </>:null}
  </Dialog>
  <Dialog open={!!revision} title="修改后重新生成" dismissible={revision?.phase!=='sending'} onClose={()=>setRevision(undefined)} footer={<>
   <Button data-interaction-id="cloud:results:revision-cancel" disabled={revision?.phase==='sending'} onClick={()=>setRevision(undefined)}>取消</Button>
   {(revision?.phase==='unknown'||revision?.phase==='submitted')&&revision.request?<Button data-interaction-id="cloud:results:revision-discard" onClick={discardRevision}>放弃未确认请求</Button>:null}
   {revision?.request?<Button data-interaction-id="cloud:results:revision-check" disabled={revision.phase==='sending'} onClick={()=>void resolveUnknown(revision.request!,present=>{if(present){clearPendingRequest(projectId,'revision',revision.result.record.id);setPendingCount(readPendingRequests(projectId).length);setRevision(undefined);setMessage('此前的请求其实已保存；未重复创建草稿。');}else setRevision(current=>current?{...current,message:'未发现本次请求创建的草稿；可用同一请求重试。'}:current);})}>重新读取结果确认</Button>:null}
   <Button data-interaction-id="cloud:results:revision-save" variant="primary" busy={revision?.phase==='sending'} disabled={!revision?.prompt.trim()||(revision&&frozenSnapshot(revision.result.record).references.length>0&&!revision.availability)} disabledReason={revision&&frozenSnapshot(revision.result.record).references.length>0&&!revision.availability?'正在确认引用素材是否可读，请稍候再保存。':undefined} onClick={saveRevision}>{revision?.request?'重试保存新草稿':'保存为新的视频草稿'}</Button>
  </>}>
   {revision?<>
    <p>从原任务冻结的输入快照复制正文、规格与仍可读的素材引用；原视频、原快照与原任务不变。</p>
    <p>规格：{frozenSpec(revision.result.record).modelId} · {frozenSpec(revision.result.record).durationSeconds??'未指定'} 秒 · {frozenSpec(revision.result.record).ratio??'未指定'}</p>
    <label>正文<textarea data-interaction-id="cloud:results:revision-prompt" disabled={frozenBusy(revision.phase)} value={revision.prompt} onChange={event=>setRevision({...revision,prompt:event.target.value})}/></label>
    <p data-interaction-id="cloud:results:revision-references">引用：{frozenSnapshot(revision.result.record).references.length?frozenSnapshot(revision.result.record).references.map(reference=>{const state=!revision.availability?'确认中':revision.availability[reference.assetId]&&assets.get(reference.assetId)?.trashedAt==null?'可读':'缺失或已删除';return reference.alias+'（'+state+'）';}).join('、'):'无'}</p>
    {revision.skipped.length?<p role="alert">以下引用不可读，未自动替换：{revision.skipped.join('、')}</p>:null}
    {revision.message?<p role="status">{revision.message}</p>:null}
    {revision.error?<p role="alert">{revision.error}</p>:null}
   </>:null}
  </Dialog>
 </section>;
}
