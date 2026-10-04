import {useEffect,useRef,useState} from 'react';
import {Button} from '../../ui/Button';
import {LocalLink} from '../../app/routes';
import {getActiveCore,subscribeActiveCore} from '../../adapters/core/current-connection';
import {fetchRunMedia,triggerBrowserDownload} from './media-delivery';
import {prepareTailFrame,type TailFrame} from './tail-frame';
import {TailFrameContinuationDialog} from './TailFrameContinuationDialog';
import type {Run} from '../../domain/run';
import type {Asset} from '../../domain/asset';
export function ResultPrimaryActions({run,asset,archived,revision,onCached}:{run:Run;asset?:Asset;archived:boolean;revision:number;onCached:()=>void}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[libraryId,setLibraryId]=useState(''),[frame,setFrame]=useState<TailFrame>(),[frameUrl,setFrameUrl]=useState(''),[tailOpen,setTailOpen]=useState(false),[downloadFailed,setDownloadFailed]=useState(false),[,refresh]=useState(0),pending=useRef(false),autoAttempt=useRef('');
 useEffect(()=>subscribeActiveCore(()=>refresh(v=>v+1)),[]);useEffect(()=>()=>{if(frameUrl)URL.revokeObjectURL(frameUrl);},[frameUrl]);const active=getActiveCore(),original=active?.client.binding.id===run.authBindingId&&active?.client.profile.id===run.connectionId&&active?.client.profile.originSnapshot===run.originSnapshot,available=!!asset||!!run.taskId&&!!original&&active?.capability.verification!=='unknown';
 async function act(kind:'preview'|'download'|'library'|'tail'){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');setMessage('');
  try{const result=await fetchRunMedia(run.id,kind==='download'?'download':'cache');onCached();
   if(kind==='download'){const delivery=await triggerBrowserDownload(result.assetId);setDownloadFailed(delivery.status!=='triggered');if(delivery.status!=='triggered')throw Error('browser_download_failed');setMessage('下载已开始。');}
   else if(kind==='library'){setLibraryId(result.assetId);setMessage('已加入素材库，可在其他项目复用。');}
   else if(kind==='tail'){const prepared=await prepareTailFrame(run.id);setFrame(prepared);setFrameUrl(URL.createObjectURL(prepared.file));setTailOpen(true);}
   else setMessage('');
  }catch{if(kind==='download')setDownloadFailed(true);setError(kind==='tail'?'尾帧提取失败，请检查视频文件后重试。':'视频加载或保存失败，请重试；不会重新生成。');}finally{pending.current=false;setBusy(false);}
 }
 useEffect(()=>{const attempt=active?.client.binding.id??'';if(!asset&&available&&attempt&&autoAttempt.current!==attempt){autoAttempt.current=attempt;void act('preview');}},[run.id,asset?.id,available,active?.client.binding.id]);
 return <><div className="result-primary-actions" aria-label="视频主要操作"><Button variant="primary" data-interaction-id={downloadFailed?'R-04':'R-03'} disabled={!available||busy} onClick={()=>void act('download')}>{downloadFailed?'重新下载':'下载'}</Button><Button data-interaction-id="result:add-library" disabled={!available||busy} onClick={()=>void act('library')}>加入素材库</Button><Button data-interaction-id="result:tail-frame" disabled={!available||archived||busy} disabledReason={archived?'归档项目不能创建续写草稿':undefined} onClick={()=>void act('tail')}>尾帧续写</Button>{libraryId?<LocalLink data-interaction-id="result:view-library" href={'/assets?asset='+encodeURIComponent(libraryId)}>查看素材</LocalLink>:null}</div>
 {busy&&!tailOpen?<p role="status">正在准备视频…</p>:null}{message?<p role="status">{message}</p>:null}{error?<p role="alert">{error}<Button data-interaction-id="R-12" disabled={busy||!available} onClick={()=>void act('preview')}>重新加载预览</Button></p>:null}{!available?<p className="muted">连接原视频服务后即可加载预览。<LocalLink data-interaction-id="result:connect-api" href="/settings/connections">连接视频 API</LocalLink></p>:null}
 {tailOpen&&frame?<TailFrameContinuationDialog frame={frame} frameUrl={frameUrl} revision={revision} onClose={()=>{setTailOpen(false);setFrame(undefined);setFrameUrl('');}}/>:null}</>;
}
