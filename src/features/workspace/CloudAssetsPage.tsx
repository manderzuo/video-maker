import {useEffect,useState} from 'react';
import type {Asset} from '../../domain/asset';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {probeMedia} from '../assets/media-probe';
import {createThumbnail} from '../assets/thumbnail-service';
import {Button} from '../../ui/Button';
const hash=async(blob:Blob)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function uploadCloudAsset(client:WorkspaceClient,file:File){
 const metadata=await probeMedia(file),thumbnail=await createThumbnail(file,metadata.mimeType),sha256=await hash(file);
 const reserved=await client.reserveAsset({...metadata,title:file.name,sha256,...(thumbnail?{thumbnail:{bytes:thumbnail.size,sha256:await hash(thumbnail),mimeType:thumbnail.type}}:{})});
 if(!('state' in reserved))return reserved;
 try{await client.uploadFile(reserved.id,file);if(thumbnail)await client.uploadFile(reserved.id,thumbnail,'thumbnail');return await client.completeAsset(reserved.id);}
 catch(error){try{await client.cancelUpload(reserved.id);}catch{/* Pending server files stay unpublished if cancellation cannot be confirmed. */}throw error;}
}
export function CloudAssetMedia({client,asset}:{client:WorkspaceClient;asset:Asset}){
 const url=client.contentUrl(asset.id);return asset.mediaType==='image'?<img src={url} alt={asset.title} loading="lazy" style={{maxWidth:'100%',maxHeight:240}}/>:asset.mediaType==='video'?<video src={url} controls preload="metadata" style={{maxWidth:'100%',maxHeight:240}}/>:asset.mediaType==='audio'?<audio src={url} controls preload="metadata"/>:null;
}
export function CloudAssetsPage({client,trashed=false}:{client:WorkspaceClient;trashed?:boolean}){
 const [assets,setAssets]=useState<Asset[]>([]),[files,setFiles]=useState<File[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const reload=async()=>{setAssets(await client.listAssets(trashed));setLoading(false);};useEffect(()=>{let alive=true;setLoading(true);void client.listAssets(trashed).then(rows=>{if(alive){setAssets(rows);setLoading(false);}}).catch(e=>{if(alive){setError(workspaceMessage(e));setLoading(false);}});return()=>{alive=false;};},[client,trashed]);
 async function action(work:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');setMessage('');try{await work();await reload();}catch(e){setError(workspaceMessage(e));}finally{setBusy(false);}}
 async function upload(){await action(async()=>{for(const file of files)await uploadCloudAsset(client,file);setFiles([]);setMessage('素材已保存到云端');});}
 return <section className="card"><h1>{trashed?'素材回收站':'素材库'}</h1>{!trashed?<div className="form-stack"><label>选择素材文件<input data-interaction-id="cloud:asset:files" type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,audio/*" multiple disabled={busy} onChange={e=>setFiles(Array.from(e.target.files??[]))}/></label><Button data-interaction-id="cloud:asset:upload" variant="primary" disabled={!files.length} busy={busy} onClick={upload}>上传到云端</Button></div>:null}{error?<p role="alert" className="banner error">{error}</p>:null}{message?<p role="status">{message}</p>:null}{loading?<p>正在读取云端素材…</p>:!assets.length?<p>{trashed?'回收站没有素材':'还没有素材'}</p>:<div className="cloud-assets-grid">{assets.map(asset=><article className="card" key={asset.id}><h2>{asset.title}</h2>{!trashed?<CloudAssetMedia client={client} asset={asset}/>:null}<p>{asset.mimeType} · {asset.bytes} 字节</p><div className="actions">{trashed?<Button data-interaction-id="cloud:asset:restore" disabled={busy} onClick={()=>action(()=>client.restoreAsset(asset.id,asset.metadataRevision??0))}>恢复素材</Button>:<><a className="button" data-interaction-id="cloud:asset:download" href={client.contentUrl(asset.id)} download={asset.title}>下载原件</a><Button data-interaction-id="cloud:asset:trash" disabled={busy} onClick={()=>action(()=>client.trashAsset(asset.id,asset.metadataRevision??0))}>移入回收站</Button></>}</div></article>)}</div>}</section>;
}
