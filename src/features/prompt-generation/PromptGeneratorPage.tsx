import {useEffect,useRef,useState} from 'react';
import {useRoute,navigate} from '../../app/routes';
import {ensurePromptDraft} from './workspace-service';
import type {PromptDraft} from '../../domain/prompt';
import {PromptWorkspace} from './PromptGeneratorPanel';
import {Button} from '../../ui/Button';
export function PromptGeneratorPage(){
 const route=useRoute(),params=new URLSearchParams(route.split('?')[1]??''),id=params.get('draftId')??undefined,type=params.get('type')==='image'?'image':'video';
 const [ready,setReady]=useState<PromptDraft>(),[error,setError]=useState('');const initial=useRef<{key:string;promise:Promise<PromptDraft>}|undefined>(undefined);
 const key=type+':'+(id??'')+':'+(params.get('projectId')??'')+':'+(params.get('nodeId')??'')+':'+(params.get('revision')??'');
 useEffect(()=>{let active=true;setReady(undefined);setError('');const query=new URLSearchParams(route.split('?')[1]??'');if(initial.current?.key!==key)initial.current={key,promise:ensurePromptDraft(type,id,{projectId:query.get('projectId')??undefined,nodeId:query.get('nodeId')??undefined,revision:query.has('revision')?Number(query.get('revision')):undefined})};void initial.current.promise.then(draft=>{if(!active)return;setReady(draft);if(!id)navigate('/prompt-generator?type='+type+'&draftId='+encodeURIComponent(draft.id));}).catch(()=>{if(active)setError('草稿读取或来源修订检查失败，请返回项目核对。');});return()=>{active=false;};},[key,type,id,route]);
 return <><div className="actions"><Button data-interaction-id="PG03" aria-pressed={type==='video'} onClick={()=>navigate('/prompt-generator?type=video')}>视频提示词</Button><Button aria-pressed={type==='image'} onClick={()=>navigate('/prompt-generator?type=image')}>图片提示词（暂未开放）</Button></div>{error?<p role="alert">{error}</p>:ready?<PromptWorkspace key={ready.id} draftId={ready.id}/>:<p role="status">正在准备本地草稿…</p>}</>;
}
