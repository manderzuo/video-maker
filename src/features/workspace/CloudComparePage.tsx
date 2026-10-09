import {useEffect,useRef,useState} from 'react';
import type {Asset} from '../../domain/asset';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {useRoute,LocalLink} from '../../app/routes';
import {Button} from '../../ui/Button';
import {CloudAssetMedia} from './CloudAssetsPage';
import {cloudVideoStatus} from './CloudVideoTaskDetail';
import {frozenSpec,type VideoRecord} from './cloud-result-actions';
type Slot='left'|'right';
export function CloudComparePage({client,projectId}:{client:WorkspaceClient;projectId:string}){
 const route=useRoute(),params=new URLSearchParams(route.split('?')[1]??''),ids=(params.get('runs')??'').split(',').filter(Boolean);
 const [records,setRecords]=useState<(VideoRecord|undefined)[]>(),[assets,setAssets]=useState<Asset[]>(),[error,setError]=useState(''),[message,setMessage]=useState(''),[playing,setPlaying]=useState(false),[swapped,setSwapped]=useState(false),[ready,setReady]=useState({left:false,right:false});
 const media=useRef<Record<Slot,HTMLVideoElement|null>>({left:null,right:null});
 useEffect(()=>{let active=true;void Promise.all([client.listTasks(),client.listAssets()]).then(([runs,media])=>{if(!active)return;setRecords(ids.map(id=>runs.find((run):run is VideoRecord=>run.kind==='video'&&run.id===id&&run.projectId===projectId&&run.executionState==='succeeded')));setAssets(media);}).catch(e=>{if(active)setError(workspaceMessage(e));});return()=>{active=false;};},[client,projectId,route]);
 useEffect(()=>()=>{media.current.left?.pause();media.current.right?.pause();},[]);
 function pause(){media.current.left?.pause();media.current.right?.pause();setPlaying(false);}
 async function synchronize(){const left=media.current.left,right=media.current.right;if(!left||!right||left.readyState<2||right.readyState<2)return;if(playing){pause();return;}const time=Math.min(left.currentTime,right.currentTime);left.currentTime=time;right.currentTime=time;try{await Promise.all([left.play(),right.play()]);setPlaying(true);setMessage('正在按共同时间近似播放；不是帧级同步。');}catch{pause();setMessage('一侧播放失败，双方已暂停；原文件保留。');}}
 if(ids.length!==2||new Set(ids).size!==2)return <section className="card"><p role="alert">请选择且仅选择两个不同的已完成视频版本。</p><LocalLink data-interaction-id="cloud:compare:results" href={'/projects/'+encodeURIComponent(projectId)+'/results'}>返回视频结果</LocalLink></section>;
 if(error)return <section className="card"><p role="alert">{error}</p></section>;
 if(!records)return <section className="card"><p role="status">正在读取两个云端版本…</p></section>;
 const ordered=swapped?[...records].reverse():records;
 if(ordered.some(record=>!record))return <section className="card"><p role="alert">所选版本不存在、尚未完成或不属于当前账号；原任务历史保留。</p><LocalLink data-interaction-id="cloud:compare:results" href={'/projects/'+encodeURIComponent(projectId)+'/results'}>返回视频结果</LocalLink></section>;
 return <section className="card" aria-label="两版本比较">
  <LocalLink data-interaction-id="cloud:compare:results" href={'/projects/'+encodeURIComponent(projectId)+'/results?runId='+encodeURIComponent(ordered[0]!.id)}>返回视频结果</LocalLink>
  <p>两个版本都来自当前账号的云端结果；按共同时间近似同步，不是帧级同步。</p>
  <div className="actions"><Button data-interaction-id="cloud:compare:sync" disabled={!ready.left||!ready.right} onClick={()=>void synchronize()}>{playing?'同步暂停':'同步播放'}</Button><Button data-interaction-id="cloud:compare:swap" onClick={()=>{pause();setReady({left:false,right:false});setSwapped(value=>!value);}}>交换 A/B</Button><Button data-interaction-id="cloud:compare:restart" onClick={()=>{for(const element of [media.current.left,media.current.right])if(element)element.currentTime=0;setMessage('两侧已回到起点。');}}>回到起点</Button></div>
  {message?<p role="status">{message}</p>:null}
  <div className="review-comparison">{ordered.map((record,index)=>{const slot:Slot=index===0?'left':'right',asset=(assets??[]).find(candidate=>candidate.id===record!.resultAssetId);return <article className="card" data-interaction-id={'cloud:compare:'+slot} data-run-id={record!.id} key={slot}>
   <h3>{(index===0?'A':'B')} · {cloudVideoStatus(record!)}</h3>
   <p>{frozenSpec(record!).modelId} · {frozenSpec(record!).durationSeconds??'未指定'} 秒 · {frozenSpec(record!).ratio??'未指定'}</p>
   {asset?<CloudAssetMedia client={client} asset={asset} mediaRef={element=>{media.current[slot]=element;}} onReady={()=>setReady(value=>({...value,[slot]:true}))} onPause={()=>pause()} onEnded={()=>{pause();setMessage('短片已结束，两侧已暂停；比较不是帧级同步。');}}/>:<p role="alert" data-interaction-id="cloud:compare:missing">{index===0?'A':'B'} 版本的结果素材缺失或已删除；不会自动替换为其他文件。</p>}
  </article>;})}</div>
 </section>;
}
