import type {Asset} from '../../../domain/asset';
import {useState} from 'react';
import {AssetPreview} from '../../assets/AssetPreview';
import {Button} from '../../../ui/Button';
import {Dialog} from '../../../ui/Dialog';
import {LocalLink} from '../../../app/routes';
export function AssetNode({assetId,asset}:{assetId:string;asset?:Asset}){
 const [open,setOpen]=useState(false),isVideo=asset?.mediaType==='video';
 return <div>
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
