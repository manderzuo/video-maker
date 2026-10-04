import {useEffect,useRef,useState} from 'react';
import {getPromptTextConnection,subscribeTextConnection} from '../../adapters/text/current-text';
import {subscribeSessionCredentials,hasSessionCredential} from '../../security/credential-session';
import {isTextOnlyModel} from '../../application/prompts/text-model-policy';
import {validatePromptTextResult} from '../../domain/prompt-engine/validate-result';
import {localText} from '../../domain/common';
import type {PromptDraft,PromptResultVersion} from '../../domain/prompt';
import {compileInput} from '../prompt-generation/workspace-service';
import {AIOptimizeDialog} from '../prompt-generation/AIOptimizeDialog';
import type {ApprovedPromptInput} from '../../application/prompts/optimize-text';
import {prepareTailPolish,completeTailPolish,type TailPolishPreparation} from './tail-frame-polish';
import {createTailFrameDraft,type TailFrame} from './tail-frame';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {navigate} from '../../app/routes';

export function TailFrameContinuationDialog({frame,frameUrl,revision,onClose}:{frame:TailFrame;frameUrl:string;revision:number;onClose:()=>void}){
 const [idea,setIdea]=useState(''),[output,setOutput]=useState(''),[result,setResult]=useState<{candidate:PromptResultVersion;source:PromptDraft;issues:string[]}>(),[error,setError]=useState(''),[polishing,setPolishing]=useState(false),[creating,setCreating]=useState(false),[review,setReview]=useState<TailPolishPreparation>(),[,refresh]=useState(0);
 const pending=useRef(false),controller=useRef<AbortController|undefined>(undefined),alive=useRef(true),requestVersion=useRef(0);
 useEffect(()=>{alive.current=true;const stopText=subscribeTextConnection(()=>refresh(v=>v+1)),stopKey=subscribeSessionCredentials(()=>refresh(v=>v+1));return()=>{alive.current=false;requestVersion.current++;controller.current?.abort();stopText();stopKey();};},[]);
 const active=getPromptTextConnection(),model=active?.capability.textModels.find(id=>isTextOnlyModel(id,active.capability)),canPolish=!!active&&!!model&&hasSessionCredential(active.client.binding.id);
 const issues=result?[...result.issues,...validatePromptTextResult({...result.candidate,finalPrompt:output},compileInput(result.source)).map(issue=>issue.message)]:[];
 const text=result?output:idea,validText=!!text.trim()&&localText.safeParse(text).success;
 function close(){if(creating)return;requestVersion.current++;controller.current?.abort();onClose();}
 async function finish(prepared:TailPolishPreparation,decision:ApprovedPromptInput['decision']){
  const version=++requestVersion.current,abort=new AbortController();controller.current=abort;setReview(undefined);setPolishing(true);
  try{const current=getPromptTextConnection();if(current?.client.binding.id!==prepared.connection.client.binding.id||current.client.profile.id!==prepared.connection.client.profile.id)throw Error('tail_text_connection_changed');const next=await completeTailPolish(prepared,decision,abort.signal);if(!alive.current||version!==requestVersion.current||abort.signal.aborted)return;if(next.candidate){setResult({candidate:next.candidate,source:prepared.draft,issues:next.issues});setOutput(next.candidate.finalPrompt);setError('');}else setError(next.error??'没有取得可用润色结果。');}
  catch{if(alive.current&&version===requestVersion.current)setError('文字请求或保存未完成，请保留原记录后核对；没有自动重发。');}
  finally{if(alive.current&&version===requestVersion.current)setPolishing(false);if(controller.current===abort)controller.current=undefined;}
 }
 async function polish(){
  if(pending.current||!active||!canPolish)return;pending.current=true;setPolishing(true);setError('');
  const version=requestVersion.current;
  try{const prepared=await prepareTailPolish({run:frame.sourceRun,revision,prompt:idea},active);if(!alive.current||version!==requestVersion.current)return;if(prepared.preview.priorUnknownRunIds.length)setReview(prepared);else await finish(prepared,{confirmed:true,acknowledgeTextFee:true});}
  catch{if(alive.current&&version===requestVersion.current)setError('润色准备失败，请检查文字连接、输入和本地存储；下一段内容已保留。');}
  finally{pending.current=false;if(alive.current)setPolishing(false);}
 }
 async function create(){
  if(creating||polishing||pending.current||!validText||issues.length)return;setCreating(true);setError('');
  try{const {receipt,videoId}=await createTailFrameDraft({projectId:frame.sourceRun.projectId,baseRevision:revision,frame,prompt:text,commandId:crypto.randomUUID()});if(receipt.status!=='applied'&&receipt.status!=='replayed')throw Error(receipt.errorCode);onClose();navigate('/projects/'+encodeURIComponent(frame.sourceRun.projectId)+'/canvas?node='+encodeURIComponent(videoId));}
  catch{if(alive.current)setError('续写草稿未保存，请检查画布版本、写权或本地空间后重试。原视频保留。');}finally{if(alive.current)setCreating(false);}
 }
 return <><Dialog open title="尾帧续写" width={720} dismissible={!creating} onClose={close} footer={<><Button data-interaction-id="result:cancel-tail" disabled={creating} onClick={close}>取消</Button><Button variant="primary" data-interaction-id="result:create-tail-draft" disabled={creating||polishing||!validText||!!issues.length} busy={creating} onClick={()=>void create()}>{result?'确认并进入画布':'创建续写草稿'}</Button></>}>
  <img className="result-tail-frame" src={frameUrl} alt="提取的尾帧"/><p>从原视频的尾帧输出连线，生成下一段视频；执行使用提取的尾帧图片参考。原视频保留，不自动拼接；不保证严格首帧锁定。</p>
  <label>下一段内容<textarea aria-label="下一段内容" data-interaction-id="result:tail-prompt" rows={3} value={idea} onChange={event=>{setIdea(event.target.value);setResult(undefined);setOutput('');setError('');}} placeholder="描述接下来发生的动作与镜头…" disabled={polishing||creating}/></label>
  <div className="actions"><Button data-interaction-id="result:tail-polish" busy={polishing} disabled={creating||!canPolish||!idea.trim()||!localText.safeParse(idea).success} disabledReason={!canPolish?'请先在本标签页启用文字 API；刷新后需重新输入 Key。':undefined} onClick={()=>void polish()}>AI润色</Button>{!canPolish?<Button data-interaction-id="result:tail-connect-text" disabled={creating} onClick={()=>{close();navigate('/settings/connections#text-api');}}>连接文字 API</Button>:null}</div>
  <small>AI润色使用设置中的文字模型，仅发送文字，不上传尾帧，可能产生文字调用费用。</small>{polishing?<p role="status">正在润色下一段内容…</p>:null}
  {result?<section className="tail-polish-result" aria-label="AI润色结果"><h3>润色结果</h3><label>润色结果<textarea aria-label="润色结果" data-interaction-id="result:tail-polish-output" rows={7} value={output} onChange={event=>setOutput(event.target.value)} disabled={creating||polishing}/></label><p className="muted">可以直接修改正文，确认后用当前内容创建画布草稿。</p>{result.candidate.warnings.map((warning,index)=><p className="muted" key={index}>{warning}</p>)}{issues.map((issue,index)=><p role="alert" key={index}>{issue}</p>)}</section>:null}
  <p className="muted">草稿默认沿用本段视频规格，进入画布后可调整；生成视频时另行确认提交。</p>{error?<p role="alert">{error}</p>:null}
 </Dialog>{review?<AIOptimizeDialog preview={review.preview} onClose={()=>setReview(undefined)} onConfirm={async input=>{if(pending.current)return;pending.current=true;try{await finish(review,input.decision);}finally{pending.current=false;}}}/>:null}</>;
}
