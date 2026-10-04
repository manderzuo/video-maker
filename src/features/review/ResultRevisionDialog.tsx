import {useRef,useState} from 'react';
import type {Run} from '../../domain/run';
import {localText} from '../../domain/common';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {navigate} from '../../app/routes';
import {createResultRevision,revisionInput} from './result-revision';
export function ResultRevisionDialog({run,revision,onClose}:{run:Run;revision:number;onClose:()=>void}){
 const frozen=revisionInput(run),[prompt,setPrompt]=useState(()=>frozen.success?frozen.data.prompt:''),[error,setError]=useState(''),[busy,setBusy]=useState(false),pending=useRef(false);
 const spec=run.executionSpec??run.requestedSpec??(frozen.success?frozen.data.spec:undefined);
 async function create(){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{const next=await createResultRevision({run,baseRevision:revision,prompt,commandId:crypto.randomUUID()});if(next.receipt.status!=='applied'&&next.receipt.status!=='replayed')throw Error(next.receipt.errorCode);onClose();navigate('/projects/'+encodeURIComponent(run.projectId)+'/canvas?node='+encodeURIComponent(next.videoId));}catch{setError('修改草稿未保存，请检查原参考素材、画布版本、写权或本地空间。原视频与任务保留。');}finally{pending.current=false;setBusy(false);}}
 return <Dialog open title="修改并重新生成" width={720} dismissible={!busy} onClose={onClose} footer={<><Button data-interaction-id="result:revision-cancel" disabled={busy} onClick={onClose}>取消</Button><Button variant="primary" data-interaction-id="result:revision-create" busy={busy} disabled={busy||!frozen.success||!prompt.trim()||!localText.safeParse(prompt).success} onClick={create}>确认修改并进入画布</Button></>}>
  <p>载入这版视频的原提示词和参考素材，修改后创建新草稿。原视频保留；到画布点击生成视频并确认，才会发起新的生成。</p>
  <label>修改后的提示词<textarea aria-label="修改后的提示词" data-interaction-id="result:revision-prompt" rows={8} value={prompt} onChange={event=>setPrompt(event.target.value)} disabled={busy}/></label>
  <p className="muted">沿用规格：{spec?[spec.modelId,spec.durationSeconds+'秒',spec.ratio,spec.resolution].filter(Boolean).join(' · '):'原规格不可用'}。进入画布后可调整参数或使用AI润色。</p>
  <p className="muted">这是按修改后的输入重新生成新版本。原片局部修补与 Core 原片改版尚未开放。</p>{error?<p role="alert">{error}</p>:null}
 </Dialog>;
}
