import type {Asset} from '../../../domain/asset';
import {useState} from 'react';
import {AssetPreview,useLocalAsset} from '../../assets/AssetPreview';
import {Button} from '../../../ui/Button';
import {Dialog} from '../../../ui/Dialog';
import {LocalLink} from '../../../app/routes';
function NodeAssetPreview({assetId,image}:{assetId:string;image:boolean}){
 const {asset,url,missing,error}=useLocalAsset(assetId,0,image);
 if(!url)return <small>{missing?'本地文件缺失':error??'预览加载中…'}</small>;
 return <div className="canvas-asset-preview">{asset?.mediaType==='image'?<img src={url} alt={asset.title}/>:asset?.mediaType==='video'?<video src={url} aria-label={asset.title+' 预览'} preload="metadata" muted playsInline/>:null}</div>;
}
export function AssetNode({assetId,asset}:{assetId:string;asset?:Asset}){
 const [open,setOpen]=useState(false),isVideo=asset?.mediaType==='video';
 return <div>
  {asset&&['image','video'].includes(asset.mediaType)?<NodeAssetPreview assetId={assetId} image={asset.mediaType==='image'}/>:null}
  <p>{asset?.title??'素材缺失'}</p><small>素材 {assetId}</small>
  <p>{asset?`${asset.mediaType} · ${asset.bytes} 字节`:'请在素材库修复关联。'}</p>
  <Button data-interaction-id="ui:AssetNode:Button:1add113221bb" variant={isVideo?'primary':'secondary'} disabled={!asset} onClick={()=>setOpen(true)}>
   {isVideo?<><span aria-hidden="true">▶ </span>播放视频</>:'预览素材'}
  </Button>
  <LocalLink data-interaction-id="ui:AssetNode:LocalLink:a9dc8e97d702" href={'/assets?asset='+encodeURIComponent(assetId)}>素材详情与恢复</LocalLink>
  <Dialog open={open} title={isVideo?'视频播放':'素材预览'} onClose={()=>setOpen(false)}>
   {open?<div className={isVideo?'review-media':undefined}><AssetPreview assetId={assetId} playVideoOnOpen={isVideo} compact={isVideo}/></div>:null}
  </Dialog>
 </div>;
}
