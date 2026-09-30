import type {Asset} from '../../../domain/asset';
export function AssetNode({assetId,asset}:{assetId:string;asset?:Asset}){return <div><p>{asset?.title??'素材缺失'}</p><small>素材 {assetId}</small><p>{asset?`${asset.mediaType} · ${asset.bytes} 字节`:'请在素材库修复关联。'}</p></div>;}
