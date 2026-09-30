import {useEffect,useState} from 'react';
import type {Run} from '../../domain/run';
import {getActiveCore,subscribeActiveCore} from '../../adapters/core/current-connection';
import {fetchRunMedia,triggerBrowserDownload} from './media-delivery';
import {Button} from '../../ui/Button';
import {AssetPreview} from '../assets/AssetPreview';
export function RunMediaActions({run,showPreview=true,onCached}:{run:Run;showPreview?:boolean;onCached?:()=>void}){
 const [assetId,setAssetId]=useState(run.resultAssetId),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[,refresh]=useState(0);
 useEffect(()=>subscribeActiveCore(()=>refresh(v=>v+1)),[]);const active=getActiveCore(),original=active?.client.binding.id===run.authBindingId&&active?.client.profile.id===run.connectionId&&active?.client.profile.originSnapshot===run.originSnapshot,available=run.executionState==='succeeded'&&!!run.taskId&&(!!assetId||!!original&&active?.capability.verification!=='unknown');
 async function act(download:boolean){setBusy(true);try{const result=await fetchRunMedia(run.id,download?'download':'cache');setAssetId(result.assetId);onCached?.();if(download){const triggered=await triggerBrowserDownload(result.assetId);setStatus(triggered.status==='triggered'?'已触发浏览器下载；实际保存位置由浏览器决定。':'浏览器下载未触发，请重试下载；不会重新生成。');}else setStatus('已缓存到当前浏览器，可离线预览；账务状态没有改变。');}catch(error){const code=error instanceof Error?error.message:'';setStatus(code==='redirect_blocked'?'未核验的下载跳转已阻止；不会重新生成。':code==='media_cache_budget_exceeded'?'媒体超过当前自动缓存预算（默认200MiB）；请检查本地空间与缓存设置，未重新生成。':code==='original_authorization_required'?'请使用原任务的服务与授权获取内容。':'结果获取或本地保存失败；原生成状态保留，可重试内容下载。');}finally{setBusy(false);}}
 return <section aria-label="结果内容与下载"><div className="actions"><Button disabled={!available||busy} disabledReason="需要生成完成、原授权或可用本地缓存" onClick={()=>act(false)}>获取并缓存结果</Button><Button disabled={!available||busy} disabledReason="需要生成完成、原授权或可用本地缓存" onClick={()=>act(true)}>下载结果</Button></div><p role="status">{status}</p>{showPreview&&assetId?<AssetPreview key={assetId} assetId={assetId}/>:null}<small>下载失败只重试内容获取，不重新生成；不宣称文件已写入本机目录。</small></section>;
}
