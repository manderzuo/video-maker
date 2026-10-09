import {useEffect,useRef,useState} from 'react';
import type {PromptLibraryEntry} from '../../domain/prompt';
import type {Project} from '../../domain/project';
import {fillTemplate,templateNames} from '../../domain/prompt-template';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {ApiError} from '../../infrastructure/api/client';
import {useCloudDraftGuard} from './use-cloud-draft-guard';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
type EditorValues={title:string;body:string;tags:string;variables:string;source:string;license:string};
const blank:EditorValues={title:'',body:'',tags:'',variables:'',source:'用户创作',license:'用户填写的来源与许可尚未核验'};
const fields=(entry:PromptLibraryEntry):EditorValues=>({title:entry.title,body:entry.body,tags:entry.tags.join(', '),variables:entry.variables.join(', '),source:entry.source,license:entry.license});
const split=(value:string)=>value.split(/[,，]/).map(item=>item.trim()).filter(Boolean);
export function CloudPromptsPage({client,trashed=false}:{client:WorkspaceClient;trashed?:boolean}){
 const [entries,setEntries]=useState<PromptLibraryEntry[]>([]),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [editor,setEditor]=useState<{entry?:PromptLibraryEntry;initial:EditorValues;key:string}>(),[values,setValues]=useState<EditorValues>(blank),[discard,setDiscard]=useState(false);
 const [history,setHistory]=useState<PromptLibraryEntry>(),[historical,setHistorical]=useState<PromptLibraryEntry>(),[revision,setRevision]=useState(0);
 const [using,setUsing]=useState<PromptLibraryEntry>(),[variables,setVariables]=useState<Record<string,string>>({}),[projects,setProjects]=useState<Project[]>([]),[target,setTarget]=useState('');
 const alive=useRef(true),frozen=useRef<{values:EditorValues;key:string}|undefined>(undefined),insert=useRef<{id:string;revision:number;operation:Parameters<WorkspaceClient['command']>[2]}|undefined>(undefined);
 const dirty=!!editor&&JSON.stringify(values)!==JSON.stringify(editor.initial);
 useCloudDraftGuard(dirty,()=>setError('提示词有未保存输入，请先保存或明确放弃后再离开。'));
 const reload=async()=>{const rows=await client.listPrompts(trashed);if(alive.current)setEntries(rows);};
 useEffect(()=>{let active=true;alive.current=true;void client.listPrompts(trashed).then(rows=>{if(active)setEntries(rows);}).catch(e=>{if(active)setError(workspaceMessage(e));});return()=>{active=false;alive.current=false;};},[client,trashed]);
 async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setMessage('');try{await work();}catch(e){if(alive.current)setError(workspaceMessage(e));}finally{if(alive.current)setBusy(false);}}
 function open(entry?:PromptLibraryEntry){const initial=entry?fields(entry):{...blank};setEditor({entry,initial,key:crypto.randomUUID()});setValues(initial);frozen.current=undefined;setError('');}
 function close(){if(dirty)setDiscard(true);else setEditor(undefined);}
 async function save(){if(!editor)return;await action(async()=>{
  const request=frozen.current??{values:structuredClone(values),key:editor.key};frozen.current=request;
  const input={...request.values,tags:split(request.values.tags),variables:split(request.values.variables),starred:editor.entry?.starred??false};
  try{if(editor.entry)await client.patchPrompt(editor.entry.id,editor.entry.revision,input);else await client.createPrompt(input,request.key);}catch(error){if(error instanceof ApiError&&error.status>0)frozen.current=undefined;throw error;}
  frozen.current=undefined;if(alive.current)setEditor(undefined);await reload();
 });}
 async function use(entry:PromptLibraryEntry){await action(async()=>{const rows=await client.listProjects();if(alive.current){setProjects(rows);setTarget(rows[0]?.id??'');setUsing(entry);setVariables({});insert.current=undefined;}});}
 const filled=using?fillTemplate(using,variables):undefined;
 async function insertText(){if(!using||!filled?.ok||!target)return;await action(async()=>{
  if(!insert.current){const workspace=await client.readWorkspace(target);insert.current={id:crypto.randomUUID(),revision:workspace.graph.revision,operation:{type:'operations',operations:[{id:crypto.randomUUID(),type:'add_node',payload:{node:{id:crypto.randomUUID(),type:'text',title:[...using.title].slice(0,60).join(''),x:64,y:64,locked:false,data:{kind:'text',text:filled.value,referenceTokens:[],promptLibrarySource:{entryId:using.id,revision:using.revision,source:using.source,license:using.license}}}}}]}};}
  const receipt=await client.command(target,insert.current.revision,insert.current.operation,insert.current.id);if(alive.current){setMessage('提示词已插入云端画布 · 修订 '+receipt.revision);setUsing(undefined);}insert.current=undefined;
 });}
 const visible=entries.filter(entry=>(entry.title+' '+entry.body+' '+entry.tags.join(' ')).toLowerCase().includes(query.toLowerCase()));
 return <section className="card"><div className="actions"><h1>{trashed?'提示词回收站':'提示词库'}</h1>{!trashed?<Button data-interaction-id="cloud:prompt:new" variant="primary" onClick={()=>open()}>新建提示词</Button>:null}<Button data-interaction-id="cloud:prompt:reload" disabled={busy} onClick={()=>action(reload)}>重新加载提示词</Button></div><label>搜索提示词<input data-interaction-id="cloud:prompt:search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  {error?<p role="alert" className="banner error">{error}</p>:null}{message?<p role="status">{message}</p>:null}
  {visible.length?visible.map(entry=><article key={entry.id} className="card"><h2>{entry.title}</h2><pre>{entry.body}</pre><p>{entry.tags.join(' · ')}</p><p>来源：{entry.source} · 许可：{entry.license} · 修订 {entry.revision}</p><div className="actions">{trashed?<Button data-interaction-id="cloud:prompt:restore" disabled={busy} onClick={()=>action(async()=>{await client.restorePrompt(entry.id,entry.revision);await reload();})}>恢复提示词</Button>:<>
   <Button data-interaction-id="cloud:prompt:edit" disabled={busy} onClick={()=>open(entry)}>编辑提示词</Button><Button data-interaction-id="cloud:prompt:use" disabled={busy} onClick={()=>use(entry)}>填写变量并插入画布</Button><Button data-interaction-id="cloud:prompt:star" disabled={busy} onClick={()=>action(async()=>{await client.patchPrompt(entry.id,entry.revision,{starred:!entry.starred});await reload();})}>{entry.starred?'取消提示词星标':'星标提示词'}</Button><Button data-interaction-id="cloud:prompt:history" disabled={busy} onClick={()=>{setHistory(entry);setRevision(entry.revision);setHistorical(entry);}}>查看正文历史</Button><Button data-interaction-id="cloud:prompt:trash" disabled={busy} onClick={()=>action(async()=>{await client.trashPrompt(entry.id,entry.revision);await reload();})}>移入提示词回收站</Button>
  </>}</div></article>):<p>{trashed?'回收站没有提示词':'暂无匹配的提示词'}</p>}
  <Dialog open={!!editor} title="编辑提示词" dismissible={!busy} onClose={close} footer={<><Button data-interaction-id="cloud:prompt:cancel" disabled={busy} onClick={close}>取消</Button><Button data-interaction-id="cloud:prompt:save" variant="primary" busy={busy} disabled={!values.title.trim()||!values.body.trim()} onClick={save}>保存提示词</Button></>}><fieldset disabled={busy||!!frozen.current}><legend>提示词内容</legend>{(['title','body','tags','variables','source','license'] as const).map(key=><label key={key}>{({title:'提示词名称',body:'提示词正文',tags:'提示词标签',variables:'模板变量',source:'提示词来源',license:'提示词许可'})[key]}{key==='body'?<textarea aria-label="提示词正文" data-interaction-id="cloud:prompt:body" value={values[key]} onChange={event=>setValues({...values,[key]:event.target.value})}/>:<input data-interaction-id={'cloud:prompt:'+key} value={values[key]} onChange={event=>setValues({...values,[key]:event.target.value})}/>}</label>)}</fieldset>{error?<p role="alert">{error}</p>:null}</Dialog>
  <Dialog open={discard} title="放弃未保存提示词输入" onClose={()=>setDiscard(false)} footer={<><Button data-interaction-id="cloud:prompt:keep" onClick={()=>setDiscard(false)}>继续编辑</Button><Button data-interaction-id="cloud:prompt:discard" variant="danger" onClick={()=>{setEditor(undefined);setDiscard(false);frozen.current=undefined;}}>确认放弃输入</Button></>}><p>关闭编辑会放弃本次未保存输入，云端版本保留。</p></Dialog>
  <Dialog open={!!history} title="提示词正文历史" onClose={()=>setHistory(undefined)}><label>历史修订<input data-interaction-id="cloud:prompt:revision" type="number" min={0} max={history?.revision} value={revision} onChange={event=>setRevision(Number(event.target.value))}/></label><Button data-interaction-id="cloud:prompt:read-revision" disabled={busy||!Number.isInteger(revision)||revision<0} onClick={()=>action(async()=>{if(history){const value=await client.promptRevision(history.id,revision);if(alive.current)setHistorical(value);}})}>读取历史正文</Button><pre>{historical?.body}</pre>{error?<p role="alert">{error}</p>:null}</Dialog>
  <Dialog open={!!using} title="填写提示词变量" dismissible={!busy} onClose={()=>setUsing(undefined)} footer={<Button data-interaction-id="cloud:prompt:insert" variant="primary" busy={busy} disabled={!filled?.ok||!target} onClick={insertText}>插入云端画布</Button>}>
   {using?templateNames(using).map(name=><label key={name}>{'变量 '+name}<input data-interaction-id="cloud:prompt:variable" disabled={busy||!!insert.current} value={variables[name]??''} onChange={event=>setVariables({...variables,[name]:event.target.value})}/></label>):null}<label>目标项目<select aria-label="目标项目" data-interaction-id="cloud:prompt:target" disabled={busy||!!insert.current} value={target} onChange={event=>setTarget(event.target.value)}><option value="">请选择</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select></label><pre aria-label="最终提示词">{filled?.ok?filled.value:''}</pre>{filled&&!filled.ok?filled.issues.map(issue=><p key={issue.code+issue.path}>{issue.message}</p>):null}{error?<p role="alert">{error}</p>:null}
  </Dialog>
 </section>;
}
