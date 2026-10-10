import {useEffect,useRef,useState} from 'react';
import type {PromptDraft,PromptLibraryEntry} from '../../domain/prompt';
import type {CloudRun} from '../../domain/cloud-video-run';
import type {Project} from '../../domain/project';
import {navigate,useRoute} from '../../app/routes';
import {sessionStore} from '../../infrastructure/api/session';
import {cloudTaskStatus} from './CloudTasksPage';
type WritingTask=Extract<CloudRun,{kind:'prompt-optimize'}>;
import {fillTemplate,templateNames} from '../../domain/prompt-template';
import {exportPrompts} from '../prompts/prompt-library';
import {triggerLocalDownload} from '../../ui/local-download';
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
 const route=useRoute();
 const [entries,setEntries]=useState<PromptLibraryEntry[]>([]),[query,setQuery]=useState(()=>new URLSearchParams(route.split('?')[1]??'').get('q')??''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [editor,setEditor]=useState<{entry?:PromptLibraryEntry;initial:EditorValues;key:string}>(),[values,setValues]=useState<EditorValues>(blank),[discard,setDiscard]=useState(false);
 const [history,setHistory]=useState<PromptLibraryEntry>(),[historical,setHistorical]=useState<PromptLibraryEntry>(),[revision,setRevision]=useState(0);
 const [using,setUsing]=useState<PromptLibraryEntry>(),[variables,setVariables]=useState<Record<string,string>>({}),[projects,setProjects]=useState<Project[]>([]),[target,setTarget]=useState('');
 const [replaceNodeId,setReplaceNodeId]=useState(''),[targetNodes,setTargetNodes]=useState<{id:string;title:string;text:string;referenceTokens:unknown[]}[]>([]);
 const [insertPending,setInsertPending]=useState(false);
 const [selected,setSelected]=useState<string[]>([]);
 const [view,setView]=useState<'library'|'writing'|'all'>(trashed?'library':'all'),[records,setRecords]=useState<{drafts:PromptDraft[];tasks:WritingTask[]}>(),[recordResult,setRecordResult]=useState<{title:string;body:string;readonly:boolean}>();
 const alive=useRef(true),frozen=useRef<{values:EditorValues;key:string}|undefined>(undefined),insert=useRef<{id:string;revision:number;operation:Parameters<WorkspaceClient['command']>[2];fingerprint:string}|undefined>(undefined);
 const dirty=!!editor&&JSON.stringify(values)!==JSON.stringify(editor.initial);
 useCloudDraftGuard(dirty,()=>setError('提示词有未保存输入，请先保存或明确放弃后再离开。'));
 const reload=async()=>{const [rows,drafts,tasks]=await Promise.all([client.listPrompts(trashed),trashed?Promise.resolve([]):client.listDrafts(),trashed?Promise.resolve([]):client.listTasks()]);if(alive.current){setEntries(rows);setRecords({drafts,tasks:tasks.filter((task):task is WritingTask=>task.kind==='prompt-optimize')});}};
 useEffect(()=>{let active=true;alive.current=true;void Promise.all([client.listPrompts(trashed),trashed?Promise.resolve([]):client.listDrafts(),trashed?Promise.resolve([]):client.listTasks()]).then(([rows,drafts,tasks])=>{if(active){setEntries(rows);setRecords({drafts,tasks:tasks.filter((task):task is WritingTask=>task.kind==='prompt-optimize')});}}).catch(e=>{if(active)setError(workspaceMessage(e));});return()=>{active=false;alive.current=false;};},[client,trashed]);
 // 从画布文字节点携带正文进入：一次性读取后即清除，不重复预填；仅接受当前账号的种子。
 useEffect(()=>{
  if(new URLSearchParams(route.split('?')[1]??'').get('seed')!=='1')return;
  try{
   const raw=sessionStorage.getItem('aiwork:prompt-seed');sessionStorage.removeItem('aiwork:prompt-seed');
   if(!raw)return;
   const identity=sessionStore.getState();
   if(identity.status!=='authenticated')return;
   const seed=JSON.parse(raw) as {userId?:unknown;title?:unknown;body?:unknown;source?:unknown};
   if(seed.userId!==identity.session.user.id)return;
   const initial:EditorValues={title:typeof seed.title==='string'?seed.title:'',body:typeof seed.body==='string'?seed.body:'',tags:'',variables:'',source:typeof seed.source==='string'?seed.source:'用户创作',license:'用户填写的来源与许可尚未核验'};
   setEditor({entry:undefined,initial,key:crypto.randomUUID()});setValues(initial);frozen.current=undefined;setError('');
  }catch{/* 损坏的种子忽略 */}
 },[]);
 async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setMessage('');try{await work();}catch(e){if(alive.current)setError(workspaceMessage(e));}finally{if(alive.current)setBusy(false);}}
 async function openWriting(){await action(async()=>{const [drafts,tasks]=await Promise.all([client.listDrafts(),client.listTasks()]);if(alive.current){setRecords({drafts,tasks:tasks.filter((task):task is WritingTask=>task.kind==='prompt-optimize')});setView('all');}});}
 async function openRecord(draftId:string,resultVersionId?:string){await action(async()=>{const draft=await client.readDraft(draftId),version=draft.resultVersions.find(item=>item.id===resultVersionId)??draft.resultVersions[draft.resultVersions.length-1];if(alive.current)setRecordResult(version?{title:draft.userRequest.slice(0,40)||'未命名写作草稿',body:version.finalPrompt,readonly:true}:undefined);});}
 function open(entry?:PromptLibraryEntry){const initial=entry?fields(entry):{...blank};setEditor({entry,initial,key:crypto.randomUUID()});setValues(initial);frozen.current=undefined;setError('');}
 function close(){if(dirty)setDiscard(true);else setEditor(undefined);}
 async function save(){if(!editor)return;await action(async()=>{
  const request=frozen.current??{values:structuredClone(values),key:editor.key};frozen.current=request;
  const input={...request.values,tags:split(request.values.tags),variables:split(request.values.variables),starred:editor.entry?.starred??false};
  try{if(editor.entry)await client.patchPrompt(editor.entry.id,editor.entry.revision,input);else await client.createPrompt(input,request.key);}catch(error){if(error instanceof ApiError&&error.status>0)frozen.current=undefined;throw error;}
  frozen.current=undefined;if(alive.current)setEditor(undefined);await reload();
 });}
 async function use(entry:PromptLibraryEntry){await action(async()=>{const rows=await client.listProjects();if(alive.current){setProjects(rows);setTarget(rows[0]?.id??'');setUsing(entry);setVariables({});setReplaceNodeId('');setTargetNodes([]);}});}
 function exportSelected(){setError('');try{const text=exportPrompts(entries.filter(entry=>selected.includes(entry.id)));triggerLocalDownload(new Blob([text],{type:'application/json'}),'AIWORK-prompts.json');setMessage('已触发浏览器下载：AIWORK-prompts.json');}catch{setError('提示词导出未完成；原条目保留，请检查浏览器下载权限后重试。');}}
 async function loadTargetNodes(){if(!using||!target)return;setReplaceNodeId('');setError('');try{const workspace=await client.readWorkspace(target);if(!alive.current)return;const nodes:{id:string;title:string;text:string;referenceTokens:unknown[]}[]=[];for(const node of workspace.graph.nodes)if(node.type==='text'&&!node.locked)nodes.push({id:node.id,title:node.title,text:node.data.text,referenceTokens:node.data.referenceTokens});setTargetNodes(nodes);}catch(e){if(alive.current){setTargetNodes([]);setError(workspaceMessage(e));}}}
 useEffect(()=>{if(using&&target)void loadTargetNodes();},[client,using?.id,target]);
 const filled=using?fillTemplate(using,variables):undefined;
 async function insertText(){if(!using||!filled?.ok||!target)return;await action(async()=>{
  const fingerprint=JSON.stringify({entry:using.id,target,node:replaceNodeId,value:filled.value});
  if(!insert.current||insert.current.fingerprint!==fingerprint){
   if(insert.current){insert.current=undefined;setInsertPending(false);throw new Error('目标或内容已变更，之前的冻结命令已失效，请重新确认。');}
   const workspace=await client.readWorkspace(target);
   const replace=replaceNodeId?workspace.graph.nodes.find(node=>node.id===replaceNodeId):undefined;
   if(replaceNodeId&&(!replace||replace.type!=='text'||replace.locked))throw new Error('目标文字节点已不可编辑，请重新读取目标项目。');
   const replaceText=replace&&replace.type==='text'?replace:undefined;
   const data=replaceText?{kind:'text',text:filled.value,referenceTokens:replaceText.data.referenceTokens,promptLibrarySource:{entryId:using.id,revision:using.revision,source:using.source,license:using.license}}:{kind:'text',text:filled.value,referenceTokens:[],promptLibrarySource:{entryId:using.id,revision:using.revision,source:using.source,license:using.license}};
   const operation:Parameters<WorkspaceClient['command']>[2]=replaceText?{type:'operations',operations:[{id:crypto.randomUUID(),type:'update_node',payload:{nodeId:replaceText.id,patch:{data}}}]}:{type:'operations',operations:[{id:crypto.randomUUID(),type:'add_node',payload:{node:{id:crypto.randomUUID(),type:'text',title:[...using.title].slice(0,60).join(''),x:64,y:64,locked:false,data}}}]};
   insert.current={id:crypto.randomUUID(),revision:workspace.graph.revision,operation,fingerprint};
   setInsertPending(true);
  }
  const receipt=await client.command(target,insert.current.revision,insert.current.operation,insert.current.id);if(alive.current){setMessage(replaceNodeId?'已替换目标文字节点，原节点其他输入与库条目保留。':'提示词已插入云端画布 · 修订 '+receipt.revision);setUsing(undefined);}insert.current=undefined;setInsertPending(false);
 });}
 function abandonInsert(){insert.current=undefined;setInsertPending(false);setMessage('已放弃本次提交；若服务端已接受，可在目标画布核对修订。');}
 const visible=entries.filter(entry=>(entry.title+' '+entry.body+' '+entry.tags.join(' ')).toLowerCase().includes(query.toLowerCase()));
 return <section className="card"><div className="actions"><h1>{trashed?'提示词回收站':'提示词库'}</h1>{!trashed?<Button data-interaction-id="cloud:prompt:new" variant="primary" onClick={()=>open()}>新建提示词</Button>:null}{!trashed?<><Button data-interaction-id="cloud:prompt:export" disabled={busy||!selected.length} disabledReason={selected.length?undefined:'先选择提示词。'} onClick={exportSelected}>导出所选提示词</Button></>:null}<Button data-interaction-id="cloud:prompt:reload" disabled={busy} onClick={()=>action(reload)}>重新加载提示词</Button></div>{!trashed?<div className="actions"><Button data-interaction-id="cloud:prompts:view-library" aria-pressed={view==='library'} onClick={()=>setView('library')}>已保存提示词</Button><Button data-interaction-id="cloud:prompts:view-writing" aria-pressed={view==='all'} onClick={()=>void openWriting()}>全部生成提示词</Button></div>:null}<label>搜索提示词<input data-interaction-id="cloud:prompt:search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  {error?<p role="alert" className="banner error">{error}</p>:null}{message?<p role="status">{message}</p>:null}
  {view!=='library'?<>{records?<><p data-interaction-id="cloud:prompts:writing-note">文字任务的原草稿、结果与状态在此查看；原草稿不可达时保留只读记录，不隐藏已有任务。原任务数据与账务记录保留。</p>{records.drafts.filter(draft=>(draft.userRequest+' '+draft.resultVersions.map(version=>version.finalPrompt).join(' ')).toLowerCase().includes(query.toLowerCase())).map(draft=>{const task=records.tasks.filter(item=>item.draftId===draft.id).sort((left,right)=>right.createdAt-left.createdAt)[0];return <article key={draft.id} className="card" data-interaction-id="cloud:prompts:writing-record"><h2>{draft.userRequest.slice(0,60)||'未命名写作草稿'}</h2><p>修订 {draft.revision} · 结果 {draft.resultVersions.length} 个 · {task?cloudTaskStatus(task):'尚无文字任务；可回到写作页做规则整理'}</p><p>{task?task.model+' · '+new Date(task.createdAt).toLocaleString():'写作草稿保存在当前账号下'}</p>{[...draft.resultVersions].reverse().map(version=><section key={version.id} aria-label="生成的提示词"><p>{version.origin==='ai'?'AI 优化':version.origin==='manual'?'人工修订':'规则整理'} · 输入修订 {version.sourceRevision}</p><pre>{version.finalPrompt}</pre></section>)}<div className="actions">{draft.resultVersions.length?<Button data-interaction-id="cloud:prompts:writing-result" disabled={busy} onClick={()=>void openRecord(draft.id)}>查看结果正文</Button>:null}<Button data-interaction-id="cloud:prompts:writing-open" disabled={busy} onClick={()=>navigate('/prompt-generator?draft='+encodeURIComponent(draft.id))}>打开写作草稿</Button></div></article>;})}{records.tasks.filter(task=>!records.drafts.some(draft=>draft.id===task.draftId)).map(task=><article key={task.id} className="card" data-interaction-id="cloud:prompts:writing-record-readonly"><h2>只读文字任务记录</h2><p>{cloudTaskStatus(task)} · {task.model} · {new Date(task.createdAt).toLocaleString()}</p><p>原写作草稿已不可达；任务、结果版本与账务记录保留供核对，不会自动重新调用。</p><p>草稿 {task.draftId}{task.resultVersionId?' · 结果版本 '+task.resultVersionId:''}</p>{task.resultVersionId?<Button data-interaction-id="cloud:prompts:writing-result" disabled={busy} onClick={()=>void openRecord(task.draftId,task.resultVersionId)}>尝试读取原结果</Button>:null}</article>)}{!records.drafts.length&&!records.tasks.length?<p>暂无写作记录</p>:null}</>:<p>正在读取写作记录…</p>}</>:null}{view!=='writing'?<>{visible.length?visible.map(entry=><article key={entry.id} className="card"><h2>{entry.title}</h2><pre>{entry.body}</pre><p>{entry.tags.join(' · ')}</p><p>来源：{entry.source} · 许可：{entry.license} · 修订 {entry.revision}</p><div className="actions">{!trashed?<label>选择<input data-interaction-id="cloud:prompt:select" type="checkbox" checked={selected.includes(entry.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,entry.id]:current.filter(id=>id!==entry.id))}/></label>:null}{trashed?<Button data-interaction-id="cloud:prompt:restore" disabled={busy} onClick={()=>action(async()=>{await client.restorePrompt(entry.id,entry.revision);await reload();})}>恢复提示词</Button>:<>
   <Button data-interaction-id="cloud:prompt:edit" disabled={busy} onClick={()=>open(entry)}>编辑提示词</Button><Button data-interaction-id="cloud:prompt:use" disabled={busy} onClick={()=>use(entry)}>填写变量并插入画布</Button><Button data-interaction-id="cloud:prompt:star" disabled={busy} onClick={()=>action(async()=>{await client.patchPrompt(entry.id,entry.revision,{starred:!entry.starred});await reload();})}>{entry.starred?'取消提示词星标':'星标提示词'}</Button><Button data-interaction-id="cloud:prompt:history" disabled={busy} onClick={()=>{setHistory(entry);setRevision(entry.revision);setHistorical(entry);}}>查看正文历史</Button><Button data-interaction-id="cloud:prompt:trash" disabled={busy} onClick={()=>action(async()=>{await client.trashPrompt(entry.id,entry.revision);await reload();})}>移入提示词回收站</Button>
  </>}</div></article>):<p>{trashed?'回收站没有提示词':'暂无匹配的提示词'}</p>}
</>:null}
  <Dialog open={!!recordResult} title="写作记录结果正文" onClose={()=>setRecordResult(undefined)}>
{recordResult?<><p>{recordResult.title} · 只读记录</p><label>结果正文<textarea aria-label="写作记录结果正文" data-interaction-id="cloud:prompts:record-body" readOnly value={recordResult.body}/></label></>:null}
</Dialog>
  <Dialog open={!!editor} title="编辑提示词" dismissible={!busy} onClose={close} footer={<><Button data-interaction-id="cloud:prompt:cancel" disabled={busy} onClick={close}>取消</Button><Button data-interaction-id="cloud:prompt:save" variant="primary" busy={busy} disabled={!values.title.trim()||!values.body.trim()} onClick={save}>保存提示词</Button></>}><fieldset disabled={busy||!!frozen.current}><legend>提示词内容</legend>{(['title','body','tags','variables','source','license'] as const).map(key=><label key={key}>{({title:'提示词名称',body:'提示词正文',tags:'提示词标签',variables:'模板变量',source:'提示词来源',license:'提示词许可'})[key]}{key==='body'?<textarea aria-label="提示词正文" data-interaction-id="cloud:prompt:body" value={values[key]} onChange={event=>setValues({...values,[key]:event.target.value})}/>:<input data-interaction-id={'cloud:prompt:'+key} value={values[key]} onChange={event=>setValues({...values,[key]:event.target.value})}/>}</label>)}</fieldset>{error?<p role="alert">{error}</p>:null}</Dialog>
  <Dialog open={discard} title="放弃未保存提示词输入" onClose={()=>setDiscard(false)} footer={<><Button data-interaction-id="cloud:prompt:keep" onClick={()=>setDiscard(false)}>继续编辑</Button><Button data-interaction-id="cloud:prompt:discard" variant="danger" onClick={()=>{setEditor(undefined);setDiscard(false);frozen.current=undefined;}}>确认放弃输入</Button></>}><p>关闭编辑会放弃本次未保存输入，云端版本保留。</p></Dialog>
  <Dialog open={!!history} title="提示词正文历史" onClose={()=>setHistory(undefined)}><label>历史修订<input data-interaction-id="cloud:prompt:revision" type="number" min={0} max={history?.revision} value={revision} onChange={event=>setRevision(Number(event.target.value))}/></label><Button data-interaction-id="cloud:prompt:read-revision" disabled={busy||!Number.isInteger(revision)||revision<0} onClick={()=>action(async()=>{if(history){const value=await client.promptRevision(history.id,revision);if(alive.current)setHistorical(value);}})}>读取历史正文</Button><pre>{historical?.body}</pre>{error?<p role="alert">{error}</p>:null}</Dialog>
  <Dialog open={!!using} title="填写提示词变量" dismissible={!busy} onClose={()=>setUsing(undefined)} footer={<><Button data-interaction-id="cloud:prompt:insert" variant="primary" busy={busy} disabled={!filled?.ok||!target} onClick={insertText}>{replaceNodeId?'替换选中文字节点':'插入云端画布'}</Button>{insertPending?<Button data-interaction-id="cloud:prompt:insert-abandon" disabled={busy} onClick={abandonInsert}>放弃本次提交</Button>:null}</>}>
   {using?templateNames(using).map(name=><label key={name}>{'变量 '+name}<input data-interaction-id="cloud:prompt:variable" disabled={busy||!!insert.current} value={variables[name]??''} onChange={event=>setVariables({...variables,[name]:event.target.value})}/></label>):null}<label>目标项目<select aria-label="目标项目" data-interaction-id="cloud:prompt:target" disabled={busy||!!insert.current||insertPending} value={target} onChange={event=>setTarget(event.target.value)}><option value="">请选择</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select></label>{using&&target?<><label>目标文字节点<select aria-label="目标文字节点" data-interaction-id="cloud:prompt:replace-node" disabled={busy||!!insert.current||insertPending} value={replaceNodeId} onChange={event=>setReplaceNodeId(event.target.value)}><option value="">新建文字节点</option>{targetNodes.map(node=><option key={node.id} value={node.id}>{node.title}</option>)}</select></label>{insertPending?<p>有未完成的提交，请先重试（确认按钮）或放弃；重读与重选已锁定。</p>:<Button data-interaction-id="cloud:prompt:reload-target" disabled={busy} onClick={()=>void loadTargetNodes()}>重新读取目标项目</Button>}{replaceNodeId&&targetNodes.find(node=>node.id===replaceNodeId)?<><p>原正文：{targetNodes.find(node=>node.id===replaceNodeId)!.text}</p><p>新正文：{filled?.ok?filled.value:''}</p><p>来源：{using.title} · {using.source} · {using.license}；只替换正文与来源记录，其他输入、任务与库条目保留。</p></>:null}</>:null}<pre aria-label="最终提示词">{filled?.ok?filled.value:''}</pre>{filled&&!filled.ok?filled.issues.map(issue=><p key={issue.code+issue.path}>{issue.message}</p>):null}{error?<p role="alert">{error}</p>:null}
  </Dialog>
 </section>;
}
