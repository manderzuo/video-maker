import {useEffect,useRef,useState} from 'react';
import type {Asset} from '../../domain/asset';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {probeMedia} from '../assets/media-probe';
import {createThumbnail} from '../assets/thumbnail-service';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {usePreferences} from '../settings/preferences-store';
import {LocalLink} from '../../app/routes';
const hash=async(blob:Blob)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function uploadCloudAsset(client:WorkspaceClient,file:File){
 const metadata=await probeMedia(file),thumbnail=await createThumbnail(file,metadata.mimeType),sha256=await hash(file);
 const reserved=await client.reserveAsset({...metadata,title:file.name,sha256,...(thumbnail?{thumbnail:{bytes:thumbnail.size,sha256:await hash(thumbnail),mimeType:thumbnail.type}}:{})});
 if(!('state' in reserved))return reserved;
 try{await client.uploadFile(reserved.id,file);if(thumbnail)await client.uploadFile(reserved.id,thumbnail,'thumbnail');return await client.completeAsset(reserved.id);}
 catch(error){try{await client.cancelUpload(reserved.id);}catch{/* Pending server files stay unpublished if cancellation cannot be confirmed. */}throw error;}
}
export function CloudAssetMedia({client,asset,mediaRef,onReady,onPause,onEnded}:{client:WorkspaceClient;asset:Asset;mediaRef?:(element:HTMLVideoElement|null)=>void;onReady?:()=>void;onPause?:()=>void;onEnded?:()=>void}){
 const preferences=usePreferences(),player=useRef<HTMLMediaElement|null>(null);
 useEffect(()=>{if(player.current)player.current.volume=preferences.volume;},[preferences.volume,asset.id]);
 const [variant,setVariant]=useState<'original'|'thumbnail'>(),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;setVariant(undefined);setFailed(false);if(asset.mediaType==='image')void client.readAssetFiles(asset.id).then(value=>{if(active)setVariant(value.thumbnail?'thumbnail':'original');}).catch(()=>{if(active)setFailed(true);});else void client.readAssetFiles(asset.id).then(()=>{if(active)setFailed(false);}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[client,asset.id,asset.mediaType]);
 const setVideo=(element:HTMLVideoElement|null)=>{player.current=element;if(mediaRef)mediaRef(element);};
 const url=client.contentUrl(asset.id);return asset.mediaType==='image'?failed?<p>预览暂时无法读取，请重新加载素材。</p>:variant?<img src={client.contentUrl(asset.id,variant)} alt={asset.title} loading="lazy" style={{maxWidth:'100%',maxHeight:240}} onError={()=>{if(variant==='thumbnail')setVariant('original');else setFailed(true);}}/>:<p>正在读取预览…</p>:asset.mediaType==='video'?failed?<p data-interaction-id="cloud:asset:media-unavailable">视频文件暂时无法读取，请重新加载素材；不会自动替换为其他文件。</p>:<video ref={setVideo} src={url} muted={preferences.muted} autoPlay={preferences.autoPlay} controls preload="metadata" style={{maxWidth:'100%',maxHeight:240}} onCanPlay={onReady} onPause={onPause} onEnded={onEnded}/>:asset.mediaType==='audio'?failed?<p data-interaction-id="cloud:asset:media-unavailable">音频文件暂时无法读取，请重新加载素材；不会自动替换为其他文件。</p>:<audio ref={element=>{player.current=element;}} src={url} muted={preferences.muted} autoPlay={preferences.autoPlay} controls preload="metadata"/>:null;
}
export function CloudAssetsPage({client,trashed=false}:{client:WorkspaceClient;trashed?:boolean}){
 const [assets,setAssets]=useState<Asset[]>([]),[files,setFiles]=useState<File[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [query,setQuery]=useState(''),[kind,setKind]=useState('all'),[target,setTarget]=useState<Asset>(),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[tags,setTags]=useState('');
 const [detail,setDetail]=useState<{asset:Asset;references:{projectId:string;projectTitle:string;nodeId?:string;nodeTitle?:string;source:string;current:boolean}[]}>();
 const detailRequest=useRef(0); const alive=useRef(true);
 const reload=async()=>{const rows=await client.listAssets(trashed);if(alive.current){setAssets(rows);setLoading(false);}};
 useEffect(()=>{let active=true;alive.current=true;setLoading(true);void client.listAssets(trashed).then(rows=>{if(active){setAssets(rows);setLoading(false);}}).catch(e=>{if(active){setError(workspaceMessage(e));setLoading(false);}});return()=>{active=false;alive.current=false;};},[client,trashed]);
 async function action(work:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');setMessage('');try{await work();if(alive.current)await reload();}catch(e){if(alive.current)setError(workspaceMessage(e));}finally{if(alive.current)setBusy(false);}}
 async function upload(){await action(async()=>{for(const file of files)await uploadCloudAsset(client,file);if(alive.current){setFiles([]);setMessage('素材已保存到云端');}});}
 async function saveMetadata(){if(!target)return;await action(async()=>{await client.patchAsset(target.id,target.metadataRevision??0,{title,description,tags:tags.split(',').map(s=>s.trim()).filter(Boolean)});if(alive.current)setTarget(undefined);});}
 async function openDetail(asset:Asset){setError('');const request=++detailRequest.current;try{const references=await client.assetReferences(asset.id);if(alive.current&&detailRequest.current===request)setDetail({asset,references});}catch(e){if(alive.current&&detailRequest.current===request)setError(workspaceMessage(e));}}
 const visible=assets.filter(asset=>(kind==='all'||asset.mediaType===kind)&&(asset.title+' '+(asset.description??'')+' '+(asset.tags??[]).join(' ')).toLowerCase().includes(query.toLowerCase()));
 return <section className="card"><div className="actions"><h1>{trashed?'素材回收站':'素材库'}</h1><Button data-interaction-id="cloud:asset:reload" disabled={busy} onClick={()=>action(reload)}>重新加载素材</Button></div>
  {!trashed?<div className="form-stack"><label>选择素材文件<input data-interaction-id="cloud:asset:files" type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,audio/*" multiple disabled={busy} onChange={e=>setFiles(Array.from(e.target.files??[]))}/></label><Button data-interaction-id="cloud:asset:upload" variant="primary" disabled={!files.length} busy={busy} onClick={upload}>上传到云端</Button></div>:null}
  <div className="actions"><label>搜索素材<input data-interaction-id="cloud:asset:search" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>素材类型<select data-interaction-id="cloud:asset:filter" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">全部</option><option value="image">图片</option><option value="video">视频</option><option value="audio">音频</option></select></label></div>
  {error?<p role="alert" className="banner error">{error}</p>:null}{message?<p role="status">{message}</p>:null}
  {loading?<p>正在读取云端素材…</p>:!visible.length?<p>{query?'没有匹配的素材':trashed?'回收站没有素材':'还没有素材'}</p>:<div className="cloud-assets-grid">{visible.map(asset=><article className="card" key={asset.id}>
   <h2>{asset.title}</h2>{!trashed?<CloudAssetMedia client={client} asset={asset}/>:null}<p>{asset.description}</p><p>{(asset.tags??[]).join(' · ')}</p><p>{asset.mimeType} · {asset.bytes} 字节</p>
   <div className="actions">{trashed?<Button data-interaction-id="cloud:asset:restore" disabled={busy} onClick={()=>action(()=>client.restoreAsset(asset.id,asset.metadataRevision??0))}>恢复素材</Button>:<>
    <a className="button" data-interaction-id="cloud:asset:download" href={client.contentUrl(asset.id)} download={asset.title}>下载原件</a>
     <Button data-interaction-id="cloud:asset:detail" disabled={busy} onClick={()=>void openDetail(asset)}>查看详情</Button>
    <Button data-interaction-id="cloud:asset:metadata" disabled={busy} onClick={()=>{setTarget(asset);setTitle(asset.title);setDescription(asset.description??'');setTags((asset.tags??[]).join(', '));setError('');}}>修改素材信息</Button>
    <Button data-interaction-id="cloud:asset:trash" disabled={busy} onClick={()=>action(()=>client.trashAsset(asset.id,asset.metadataRevision??0))}>移入回收站</Button>
   </>}</div>
  </article>)}</div>}
  <Dialog open={!!target} title="修改素材信息" dismissible={!busy} onClose={()=>setTarget(undefined)} footer={<><Button data-interaction-id="cloud:asset:cancel" disabled={busy} onClick={()=>setTarget(undefined)}>取消</Button><Button data-interaction-id="cloud:asset:save" variant="primary" busy={busy} disabled={!title.trim()||[...description].length>500} onClick={saveMetadata}>保存素材信息</Button></>}>
   <label>素材名称<input data-interaction-id="cloud:asset:title" value={title} onChange={e=>setTitle(e.target.value)}/></label><label>素材说明<textarea data-interaction-id="cloud:asset:description" value={description} onChange={e=>setDescription(e.target.value)}/></label><label>素材标签（逗号分隔）<input data-interaction-id="cloud:asset:tags" value={tags} onChange={e=>setTags(e.target.value)}/></label>{error?<p role="alert">{error}</p>:null}
  </Dialog>
  <Dialog open={!!detail} title="素材详情" onClose={()=>setDetail(undefined)} footer={<Button data-interaction-id="cloud:asset:detail-close" onClick={()=>setDetail(undefined)}>关闭</Button>}>{detail?<><p>素材：{detail.asset.title}</p><p>内容哈希：{detail.asset.sha256}</p><p>{detail.asset.mimeType} · {detail.asset.bytes} 字节{detail.asset.width?` · ${detail.asset.width}×${detail.asset.height}`:''}{detail.asset.durationSeconds?` · ${detail.asset.durationSeconds} 秒`:''}</p>{detail.asset.sourceRunId?<p>来源任务：{detail.asset.sourceRunId}</p>:null}<h3>使用位置</h3>{detail.references.length?detail.references.map(reference=><p key={reference.projectId+':'+(reference.nodeId??reference.source)}>项目{reference.projectTitle}{reference.current&&reference.nodeTitle?` · 节点${reference.nodeTitle}`:reference.current?' · 当前引用':' · 历史引用'} <LocalLink data-interaction-id="cloud:asset:detail-open" href={'/projects/'+encodeURIComponent(reference.projectId)+'/canvas'+(reference.current&&reference.nodeId?'?node='+encodeURIComponent(reference.nodeId):'')}>定位项目画布</LocalLink></p>):<p>暂无项目引用。</p>}</>:null}</Dialog>
 </section>;
}
