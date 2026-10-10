import {canvasVideoSpecs} from '../../domain/canvas-video-spec';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {CanvasNode} from '../../domain/graph';
import type {Asset} from '../../domain/asset';
import type {CloudVideoRecord} from '../../domain/cloud-video-run';
import type {CloudVideoCapability} from '../../domain/cloud-video-run';
import type {CapabilityProfile} from '../../domain/connection';
import type {GraphOperation} from '../../application/commands/registry';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {createCloudCanvasModel} from './cloud-canvas-model';
import {uploadCloudAsset} from './CloudAssetsPage';
import {CloudAssetPicker} from './CloudAssetPicker';
import {CloudCanvasSurface} from './CloudCanvasSurface';
import {CanvasToolbar} from '../canvas/CanvasToolbar';
import {nodeBounds} from '../canvas/geometry';
import {moveOperations} from '../canvas/group-layout';
import {createBranch} from '../canvas/branch-command';
import {NodeMenu,type NodeMenuHandle} from '../canvas/NodeMenu';
import {cloudNodeDeletion} from './cloud-node-deletion';
import {resultLink} from './cloud-result-actions';
import {inspectVideoTextInputs} from './cloud-video-input';
import {localWritingVideoDraft} from '../settings/default-models';
import {exportCloudProject} from './cloud-project-package';
import {triggerLocalDownload} from '../../ui/local-download';
import {ArrangePreview} from '../canvas/ArrangePreview';
import type {PositionPatch} from '../canvas/group-layout';
import {Button} from '../../ui/Button';
import {LocalLink,addNavigationGuard,navigate,useRoute} from '../../app/routes';
import {sessionStore} from '../../infrastructure/api/session';
import {Dialog} from '../../ui/Dialog';
import {CloudVideoRunPanel} from './CloudVideoRunPanel';
import {CloudPromptGeneratorPage} from './CloudPromptGeneratorPage';
import {usePreferences} from '../settings/preferences-store';
const op=(type:GraphOperation['type'],payload:Record<string,unknown>):GraphOperation=>({id:crypto.randomUUID(),type,payload});
export function CloudCanvasPage({client,projectId}:{client:WorkspaceClient;projectId:string}){
 const preferences=usePreferences(),[videoSpecs,setVideoSpecs]=useState<CloudVideoCapability['videoSpecs']>([]),[capability,setCapability]=useState<CapabilityProfile>({contractVersion:'cloud-account-capability',verification:'unknown',textModels:[],videoModels:[],videoAliases:[],videoSpecs:[],workContext:false,continuation:false,imageGeneration:false,audioGeneration:false,cancelVideo:false,backup:false});
 const [model]=useState(()=>createCloudCanvasModel(projectId,client,{autosaveMs:1500})),state=useSyncExternalStore(model.subscribe,model.getState),graph=state.graph;
 const [assets,setAssets]=useState<Asset[]>([]),[runs,setRuns]=useState<CloudVideoRecord[]>([]),[selected,setSelected]=useState<string[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[tool,setTool]=useState<'select'|'pan'>('select'),[background,setBackground]=useState('dots'),[minimap,setMinimap]=useState(false),[addOpen,setAddOpen]=useState(false),[modelName,setModelName]=useState(''),[discardOpen,setDiscardOpen]=useState(false),[patches,setPatches]=useState<PositionPatch[]|null>(null);
 const stageRef=useRef<HTMLDivElement>(null),nodeMenu=useRef<NodeMenuHandle>(null);
 const [sideCollapsed,setSideCollapsed]=useState(false);
 const [flowSource,setFlowSource]=useState<string>(),[preflightRequest,setPreflightRequest]=useState<{id:string;nodeIds:string[]}>();
 type WritingRequest=Parameters<WorkspaceClient['createDraft']>[0];
 const writing=useRef<{key:string;busy:boolean;fingerprint:string;nodeId?:string;request?:WritingRequest}|undefined>(undefined);
 const [writingPending,setWritingPending]=useState(false),[writingDraft,setWritingDraft]=useState<{id?:string;ai:boolean}>(),[invalidCount,setInvalidCount]=useState(0),[draftReset,setDraftReset]=useState(0);
 const invalidInputs=useRef(new Set<string>()),composing=useRef(false),writingAI=useRef(false),writingDirty=useRef(false);
 function textValidity(nodeId:string,valid:boolean){if(valid)invalidInputs.current.delete(nodeId);else invalidInputs.current.add(nodeId);setInvalidCount(invalidInputs.current.size);model.setComposing(composing.current||invalidInputs.current.size>0);}
 function save(){if(invalidInputs.current.size){setError('部分文本超过64KiB，输入保留在本页；请修正后保存或明确放弃。');return;}void model.save();}
 function writingKeyFor(userId:string){return 'aiwork:writing-pending:'+userId+':'+projectId;}
 function storeWriting(value:{key:string;fingerprint:string;nodeId:string;request:WritingRequest}|undefined){
  const identity=sessionStore.getState();
  if(identity.status!=='authenticated')return;
  const storageKey=writingKeyFor(identity.session.user.id);
  try{
   if(!value)localStorage.removeItem(storageKey);
   else localStorage.setItem(storageKey,JSON.stringify({userId:identity.session.user.id,projectId,nodeId:value.nodeId,key:value.key,fingerprint:value.fingerprint,request:value.request}));
  }catch{/* 持久化失败不阻断提交 */}
 }
 // 未决动作随页面恢复：仅同用户同项目同节点才沿用旧身份；归属不一致则丢弃本用户本项目键（不动其他用户或项目）。
 useEffect(()=>{
  try{
   const identity=sessionStore.getState();
   if(identity.status!=='authenticated')return;
   const storageKey=writingKeyFor(identity.session.user.id);
   const raw=localStorage.getItem(storageKey);
   if(!raw)return;
   const saved=JSON.parse(raw) as {userId?:unknown;projectId?:unknown;nodeId?:unknown;key?:unknown;fingerprint?:unknown;request?:unknown};
   if(saved.userId!==identity.session.user.id||saved.projectId!==projectId||typeof saved.nodeId!=='string'||typeof saved.key!=='string'||!saved.key||typeof saved.fingerprint!=='string'||!saved.request||typeof saved.request!=='object'||typeof (saved.request as {userRequest?:unknown}).userRequest!=='string'){localStorage.removeItem(storageKey);return;}
   writing.current={key:saved.key,busy:false,fingerprint:saved.fingerprint,nodeId:saved.nodeId,request:saved.request as WritingRequest};
   setWritingPending(true);
  }catch{/* 损坏的冻结忽略 */}
 },[]);
 const busy=state.status==='saving'||state.status==='loading',canEdit=!busy&&state.status!=='failed';
 useEffect(()=>{void model.load();void client.listAssets().then(setAssets).catch(e=>setError(workspaceMessage(e)));return()=>model.dispose();},[client,model]);
 const route=useRoute(),focusedNode=useRef<string|undefined>(undefined);
 useEffect(()=>{if(route.split('?')[0].endsWith('/agent'))navigate('/projects/'+projectId+'/canvas');},[route,projectId]);
 // 按目标 node 变化定位：同项目内连续点击不同搜索结果也会跟随。有未保存
 // 输入时不动选中与视角， autosave 完成后状态变化会重新评估。
 useEffect(()=>{if(!graph)return;const nodeId=new URLSearchParams(route.split('?')[1]??'').get('node');if(!nodeId||!graph.nodes.some(node=>node.id===nodeId)||focusedNode.current===nodeId)return;if(model.getState().status!=='saved')return;focusedNode.current=nodeId;setSelected([nodeId]);fit([nodeId]);},[client,graph,route,state.status]);
 useEffect(()=>{let active=true;void client.videoCapability().then(value=>{if(active){setVideoSpecs(canvasVideoSpecs(value.videoSpecs));setModelName(current=>current||value.model);setCapability({contractVersion:'cloud-account-capability',verification:value.verified?'reviewed':'unknown',textModels:[],videoModels:[...new Set([...value.videoSpecs.map(spec=>spec.modelId),value.model])],videoAliases:[],videoSpecs:value.videoSpecs,workContext:false,continuation:false,imageGeneration:false,audioGeneration:false,cancelVideo:false,backup:false,...(value.limits?{limits:value.limits}:{})});}}).catch(()=>{});return()=>{active=false;};},[client]);
 useEffect(()=>{let active=true;void client.modelConfigs().then(({configs})=>{if(active)setCapability(current=>({...current,textModels:configs.filter(config=>config.channel==='text').map(config=>config.model)}));}).catch(()=>{});return()=>{active=false;};},[client]);
 useEffect(()=>{let active=true;async function load(){try{const rows=await client.listTasks();if(active){const videos=rows.filter((run):run is CloudVideoRecord=>run.kind==='video'&&run.projectId===projectId);setRuns(videos);const current=model.getState().graph;if(videos.some(run=>run.executionState==='succeeded'&&run.deliveryState==='available_for_preview'&&!current?.nodes.some(node=>node.type==='result'&&node.data.runId===run.id))){await model.refreshResults();const files=await client.listAssets();if(active)setAssets(files);}}}catch{/* Lineage badges refresh on next save. */}}void load();const timer=setInterval(()=>{void load();},4000);return()=>{active=false;clearInterval(timer);};},[client,projectId,model]);
 useEffect(()=>{const before=(event:BeforeUnloadEvent)=>{if((model.getState().status!=='saved'||invalidInputs.current.size>0)){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',before);const remove=addNavigationGuard(()=>{if(model.getState().status==='saved'&&!invalidInputs.current.size)return true;setError('画布有未保存的输入，请先保存或明确放弃后再离开。');return false;});return()=>{window.removeEventListener('beforeunload',before);remove();};},[model]);
 function pruneInvalidInputs(){const ids=new Set(model.getState().graph?.nodes.map(node=>node.id));for(const id of invalidInputs.current)if(!ids.has(id))invalidInputs.current.delete(id);setInvalidCount(invalidInputs.current.size);model.setComposing(composing.current||invalidInputs.current.size>0);}
 function stage(operations:GraphOperation[]): void{setError('');try{model.stage(operations);pruneInvalidInputs();}catch{setError('此修改暂未应用，请先重试保存或核对当前画布。');}}
 function tryStage(operations:GraphOperation[]): boolean{setError('');try{model.stage(operations);pruneInvalidInputs();return true;}catch{setError('此修改暂未应用，请先重试保存或核对当前画布。');return false;}}
 async function commitOps(operations:GraphOperation[]): Promise<boolean>{
  setError('');
  try{model.stage(operations);pruneInvalidInputs();}catch{setError('此修改暂未应用，请先重试保存或核对当前画布。');return false;}
  await model.save();
  for(let attempt=0;attempt<50&&model.getState().status==='saving';attempt++)await new Promise(resolve=>setTimeout(resolve,100));
  const ok=model.getState().status==='saved';
  if(!ok)setError('保存未完成 · 输入已保留，可重试保存。');
  return ok;
 }
 function add(type:'text'|'video-generation'|'asset',asset?:Asset){
  const id=crypto.randomUUID(),base={id,title:type==='text'?'文字':type==='asset'?asset!.title:'视频草稿',x:64+((graph?.nodes.length??0)%3)*380,y:64+Math.floor((graph?.nodes.length??0)/3)*440,locked:false};
  const available=videoSpecs.filter(spec=>spec.modelId===modelName.trim()),preferred=available.find(spec=>(preferences.defaultDuration===null||spec.durationSeconds===preferences.defaultDuration)&&(!preferences.defaultRatio||spec.ratio===preferences.defaultRatio));
  const node:CanvasNode=type==='text'?{...base,type,data:{kind:'text',text:'',referenceTokens:[]}}:type==='asset'?{...base,type,data:{kind:'asset',assetId:asset!.id}}:{...base,type,data:{kind:'video-generation',draft:preferred??available[0]??{modelId:modelName.trim()},inputBindings:[],stale:true}};
  stage([op('add_node',{node})]);setSelected([id]);setAddOpen(false);
 }
 function fit(ids?:string[]){if(!graph||!stageRef.current)return;const nodes=ids?graph.nodes.filter(n=>ids.includes(n.id)):graph.nodes;if(!nodes.length)return;const bounds=nodeBounds(nodes,graph),size=stageRef.current.getBoundingClientRect(),scale=Math.max(.25,Math.min(2,(size.width-80)/(bounds.right-bounds.left),(size.height-80)/(bounds.bottom-bounds.top)));model.viewport({x:40-bounds.left*scale,y:40-bounds.top*scale,scale});}
 async function files(values:File[]){try{const added:Asset[]=[];for(const file of values)added.push(await uploadCloudAsset(client,file));setAssets(await client.listAssets());for(const asset of added)add('asset',asset);}catch(e){setError(workspaceMessage(e));}}
 function nodeText(nodeId:string){const node=model.getState().graph?.nodes.find(n=>n.id===nodeId);return node&&['text','video-generation'].includes(node.type)&&!node.locked?node:undefined;}
 async function saveNodePrompt(nodeId:string){
  setError('');
  const identity=sessionStore.getState();
  if(identity.status!=='authenticated')return;
  const before=model.getState(),node=before.graph?.nodes.find(n=>n.id===nodeId);
  if(invalidInputs.current.size||!node||node.type!=='text'||node.locked||!before.graph){setError('所选文字节点已不可用。');return;}
  await model.save();
  for(let attempt=0;attempt<50&&model.getState().status==='saving';attempt++)await new Promise(resolve=>setTimeout(resolve,100));
  const state=model.getState();
  if(state.status!=='saved'||!state.graph){setError('画布尚未保存成功，未携带正文；输入已保留。');return;}
  const fresh=state.graph.nodes.find(n=>n.id===nodeId);
  if(!fresh||fresh.type!=='text'||fresh.locked){setError('所选文字节点已不可用。');return;}
  try{sessionStorage.setItem('aiwork:prompt-seed',JSON.stringify({userId:identity.session.user.id,title:fresh.title,body:fresh.data.text,source:'画布项目 '+projectId+' / 节点 '+fresh.id+' / 修订 '+state.graph.revision}));}catch{setError('浏览器存储不可用，无法携带正文。');return;}
  navigate('/prompts?seed=1');
 }
 async function openNodeWriting(nodeId:string,ai=false){
  setError('');
  if(writing.current?.busy)return;
  if(invalidInputs.current.size||writingDirty.current){setError('请先保存或修正当前文字与写作输入，原输入已保留。');return;}
  writingAI.current=ai;
  if(!nodeText(nodeId)){setError('所选文字节点已不可用。');return;}
  const prev=writing.current;
  writing.current={key:prev?.key??'',busy:true,fingerprint:prev?.fingerprint??'',nodeId:prev?.nodeId,request:prev?.request};
  await model.save();
  for(let attempt=0;attempt<50&&model.getState().status==='saving';attempt++)await new Promise(resolve=>setTimeout(resolve,100));
  const current=model.getState();
  if(current.status!=='saved'||!current.graph){const heldSave=writing.current;if(heldSave)heldSave.busy=false;setError('画布尚未保存成功，未创建写作草稿；输入与未决动作已保留。');return;}
  const fresh=current.graph.nodes.find(n=>n.id===nodeId);
  if(!fresh||!['text','video-generation'].includes(fresh.type)||fresh.locked){const heldNode=writing.current;if(heldNode)heldNode.busy=false;setError('所选文字节点已不可用；未决动作已保留。');return;}
  const text=fresh.type==='text'?fresh.data.text:fresh.type==='video-generation'?inspectVideoTextInputs(current.graph,fresh.id).sources.map(source=>source.text).join('\n\n'):'';
  const requestedSpec=fresh.type==='video-generation'?{...fresh.data.draft}:{};
  const fingerprint=JSON.stringify({nodeId,revision:current.graph.revision,text,requestedSpec});
  const held=writing.current;
  let key: string,request: WritingRequest;
  if(held?.key&&held.nodeId===nodeId&&held.fingerprint===fingerprint&&held.request){
   key=held.key;request=held.request;
  }else if(held?.key){
   // 有未决旧动作（他节点或内容已变）：阻止新提交，保留旧身份；用户重试原动作或明确放弃后才可继续。
   held.busy=false;
   setError('有未完成的写作打开，请先重试原动作（将使用原输入发送）或点击“放弃本次写作打开”。');
   return;
  }else{
   key=crypto.randomUUID();
   request={type:'video',userRequest:text,sceneId:'text',requestedSpec,audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',sourceProjectId:projectId,sourceNodeId:nodeId,sourceRevision:current.graph.revision};
  }
  writing.current={key,busy:true,fingerprint,nodeId,request};
  storeWriting({key,fingerprint,nodeId,request});
  setWritingPending(true);
  try{
   const value=await client.createDraft(request,key);
   writing.current=undefined;
   storeWriting(undefined);
   setWritingPending(false);
   setWritingDraft({id:value.id,ai:writingAI.current});
  }catch(e){const heldNow=writing.current;if(heldNow)heldNow.busy=false;setError(workspaceMessage(e));}
 }
 function abandonWriting(){writing.current=undefined;storeWriting(undefined);setWritingPending(false);setError('');}
 async function retryWriting(){
  const held=writing.current;
  if(!held?.key||!held.request)return;
  setError('');
  held.busy=true;
  try{
   const value=await client.createDraft(held.request,held.key);
   writing.current=undefined;
   storeWriting(undefined);
   setWritingPending(false);
   setWritingDraft({id:value.id,ai:writingAI.current});
  }catch(e){held.busy=false;setError(workspaceMessage(e));}
 }
 async function saveBeforeAction(){if(invalidInputs.current.size){setError('部分文字超过64KiB，请修正后保存，输入已保留。');return undefined;}await model.save();for(let attempt=0;attempt<50&&model.getState().status==='saving';attempt++)await new Promise(resolve=>setTimeout(resolve,100));const fresh=model.getState();if(fresh.status!=='saved'||!fresh.graph){setError('画布尚未保存成功，输入已保留；请重试保存。');return undefined;}return fresh.graph;}
 async function generate(ids:string[]){const fresh=await saveBeforeAction();if(!fresh)return;const targets=ids.filter(id=>fresh.nodes.some(node=>node.id===id&&node.type==='video-generation'&&!node.locked));if(!targets.length){setError('请选择一个可编辑的视频草稿节点。');return;}setSelected(targets);setPreflightRequest({id:crypto.randomUUID(),nodeIds:targets});}
 async function openResultAction(node:Extract<CanvasNode,{type:'result'}>,action:'details'|'tail-frame'|'revision'){
  const fresh=await saveBeforeAction();if(!fresh)return;
  const target=fresh.nodes.find(value=>value.id===node.id);
  if(target?.type!=='result'||target.data.assetId!==node.data.assetId||target.data.runId!==node.data.runId){setError('原结果绑定已变化，请核对后重试；不会替换为其他结果。');return;}
  navigate('/projects/'+encodeURIComponent(projectId)+'/results?runId='+encodeURIComponent(target.data.runId)+'&action='+action);
 }
 async function createFlow(){if(!flowSource)return;const fresh=await saveBeforeAction();if(!fresh)return;const source=fresh.nodes.find(node=>node.id===flowSource);if(source?.type!=='text'||source.locked||!source.data.text.trim()){setError('原文字节点不可用，现有数据保留。');return;}try{const draft=localWritingVideoDraft(capability);if(!draft)throw Error('missing_spec');const ops=createBranch(fresh,source.id,{defaultDraft:draft});if(await commitOps(ops)){setFlowSource(undefined);setSelected([(ops[0].payload.node as CanvasNode).id]);}}catch{setError('默认规格不可用，请检查 API 与模型设置；原文字保留。');}}
 async function repairLineage(){
  const savedGraph=await saveBeforeAction();if(!savedGraph)return;
  try{
   const [workspace,records,files]=await Promise.all([client.readWorkspace(projectId),client.listTasks(),client.listAssets()]);
   if(model.getState().status!=='saved'||model.getState().graph?.revision!==workspace.graph.revision){setError('画布已变化，请保存后重新核对来源；未修改现有连线。');return;}
   const operations=workspace.graph.nodes.flatMap(node=>{
    if(node.type!=='asset'&&node.type!=='result')return [];
    const asset=files.find(file=>file.id===node.data.assetId&&!file.trashedAt&&file.mediaType==='video');
    const record=records.find((run):run is CloudVideoRecord=>run.kind==='video'&&run.projectId===projectId&&run.executionState==='succeeded'&&run.resultAssetId===asset?.id&&asset?.sourceRunId===run.id&&(node.type!=='result'||node.data.runId===run.id));
    return record?resultLink(workspace.graph,node,record):[];
   });
   if(!operations.length){setMessage('已核对云端任务与素材，现有结果来源连线无需补齐；不会推测缺失的来源。');return;}
   if(await commitOps(operations))setMessage('已补齐有明确任务记录的结果来源连线，可撤销。');
  }catch(failure){setError(workspaceMessage(failure));}
 }
 async function backup(){try{const result=await exportCloudProject(client,projectId);triggerLocalDownload(result.blob,result.filename);}catch(e){setError(workspaceMessage(e));}}
 if(!graph)return <section className="card"><h1>画布</h1>{state.error?<p role="alert">{workspaceMessage(state.error)}</p>:<p>正在读取画布…</p>}<Button data-interaction-id="cloud:canvas:retry-load" onClick={()=>model.load(true)}>重新加载</Button></section>;
 const view=graph.viewport;
 return <section className="canvas-workspace cloud-canvas-page">
 <div className="canvas-heading actions"><h2>{state.project?.title}</h2><LocalLink data-interaction-id="canvas-entry:switch" className="button" href="/canvas">切换项目</LocalLink><Button data-interaction-id="PG01" disabled={selected.length>1} onClick={()=>{if(selected.length)void openNodeWriting(selected[0]);else if(!writingDirty.current){setWritingDraft({ai:false});}else setError('请先保存当前写作输入，原输入已保留。');}}>提示词生成面板</Button><Button data-interaction-id="C-15" disabled={!canEdit||!graph.nodes.some(node=>selected.includes(node.id)&&node.type==='video-generation')} onClick={()=>void generate(selected)}>生成选中视频</Button><Button data-interaction-id="C-16" disabled={!canEdit||!graph.nodes.some(node=>node.type==='video-generation')} onClick={()=>void generate(graph.nodes.filter(node=>node.type==='video-generation').map(node=>node.id))}>批量生成视频</Button><Button data-interaction-id="C-19" onClick={()=>void backup()}>导出项目备份</Button><LocalLink className="button" data-interaction-id="R-01" href={'/projects/'+projectId+'/results'}>查看结果与审片</LocalLink><Button data-interaction-id="cloud:canvas:repair-lineage" disabled={!canEdit} onClick={()=>void repairLineage()}>补齐来源连线</Button><Button data-interaction-id="cloud:canvas:save" variant="primary" busy={busy} disabled={busy} onClick={save}>{state.status==='failed'?'重试保存':'保存到云端'}</Button><span role="status">{state.status==='saved'&&!invalidCount?'已保存 · 云端修订 '+graph.revision:state.status==='saving'?'正在保存到云端…':state.status==='failed'?'保存未完成 · 输入已保留':'未保存'}</span></div>
 {error||state.error?<p role="alert" className="banner error">{error||workspaceMessage(state.error)}</p>:null}
 {message?<p role="status" className="banner">{message}</p>:null}
 {writingPending?<div className="actions"><Button data-interaction-id="cloud:canvas:writing-retry" onClick={()=>void retryWriting()}>重试原动作</Button><Button data-interaction-id="cloud:canvas:writing-abandon" onClick={abandonWriting}>放弃本次写作打开</Button></div>:null}
 <CanvasToolbar scale={view.scale} onZoom={scale=>model.viewport({...view,scale})} tool={tool} onTool={setTool} onFit={()=>fit()} onLocate={()=>fit(selected)} selectedCount={selected.length} minimap={minimap} onMinimap={()=>setMinimap(!minimap)} background={background} onBackground={setBackground} onAdd={()=>setAddOpen(true)} canWrite={canEdit} onUndo={()=>{void model.history('undo');}} onRedo={()=>{void model.history('redo');}} canUndo={state.status==='saved'&&state.history.undoDepth>0} canRedo={state.status==='saved'&&state.history.redoDepth>0}/>
 <div className="node-action-bar"><Button data-interaction-id="cloud:canvas:add-text" disabled={!canEdit} onClick={()=>add('text')}>添加文字节点</Button><Button data-interaction-id="cloud:canvas:reload" disabled={busy} onClick={()=>state.status==='saved'&&!invalidInputs.current.size?model.load():setDiscardOpen(true)}>重新加载画布</Button><Button data-interaction-id="cloud:canvas:toggle-video-tasks" aria-expanded={!sideCollapsed} aria-controls="canvas-video-tasks" onClick={()=>setSideCollapsed(value=>!value)}>{sideCollapsed?'显示视频任务':'隐藏视频任务'}</Button><Button data-interaction-id="G-10" onClick={()=>{setMinimap(false);setSideCollapsed(false);}}>恢复布局</Button><label>导入素材<input data-interaction-id="cloud:canvas:files" type="file" multiple disabled={!canEdit} onChange={event=>{void files(Array.from(event.target.files??[]));event.target.value='';}}/></label></div>
 <NodeMenu ref={nodeMenu} graph={graph} selected={selected} assets={assets} runs={runs} capability={capability} readonly={!canEdit} deletion={cloudNodeDeletion(client,graph)} onSelect={setSelected} onCommand={commitOps}/>
 <div className={'canvas-main'+(sideCollapsed?' side-collapsed':'')}>
 <div className="canvas-layout" onCompositionStartCapture={()=>{composing.current=true;model.setComposing(true);}} onCompositionEndCapture={()=>{composing.current=false;model.setComposing(invalidInputs.current.size>0);}}>
 <CloudCanvasSurface key={draftReset} client={client} graph={graph} selected={selected} setSelected={setSelected} canEdit={canEdit} saved={state.status==='saved'} assets={assets} runs={runs} capability={capability} stageRef={stageRef} tool={tool} setTool={setTool} background={background} minimap={minimap} nodeMenu={nodeMenu} stageOps={tryStage} commitOps={commitOps} onViewport={viewport=>model.viewport(viewport)} onError={setError} onSave={save} onSaveNodePrompt={saveNodePrompt} onOpenNodeWriting={(nodeId,ai)=>void openNodeWriting(nodeId,ai)} onTextValidity={textValidity} onResultAction={(node,action)=>void openResultAction(node,action)} onCreateFlow={setFlowSource} onGenerate={nodeId=>void generate([nodeId])} onUndo={()=>{void model.history('undo');}} onRedo={()=>{void model.history('redo');}} onFiles={values=>void files(values)} fit={ids=>fit(ids)}/>
 </div>
 <aside id="canvas-video-tasks" className={'canvas-side'+(sideCollapsed?' side-hidden':'')} aria-label="视频生成与任务"><CloudVideoRunPanel client={client} graph={graph} saved={state.status==='saved'} preflightRequest={preflightRequest} onError={setError} onResultInserted={()=>{void model.load();void client.listAssets().then(setAssets).catch(e=>setError(workspaceMessage(e)));}}/></aside>
 </div>
 {writingDraft?<CloudPromptGeneratorPage key={writingDraft.id} client={client} initialDraftId={writingDraft.id} initialAI={writingDraft.ai} onDirtyChange={value=>{writingDirty.current=value;}} onClose={()=>setWritingDraft(undefined)} canApplyCanvas={state.status==='saved'&&!invalidCount} onCanvasApplied={()=>{if(model.getState().status==='saved')void model.load().catch(e=>setError(workspaceMessage(e)));else setError('写作结果已保存到云端。本页仍有未保存输入，请先保存或明确放弃后重新加载画布。');}}/>:null}
 <Dialog open={!!flowSource} title="从文本创建视频流程" onClose={()=>setFlowSource(undefined)} footer={<><Button data-interaction-id="restore:cloudcanvaspage:2" onClick={()=>setFlowSource(undefined)}>返回编辑</Button><Button data-interaction-id="restore:cloudcanvaspage:3" disabled={!canEdit} onClick={()=>void createFlow()}>确认仅创建草稿</Button></>}><p>连接当前文字并新建视频配置草稿，可撤销；不提交任务，不上传素材，不授权收费。</p></Dialog>
 <ArrangePreview graph={graph} patches={patches} onClose={()=>setPatches(null)} onApply={async()=>{if(patches)await commitOps(moveOperations(patches));setPatches(null);}}/>
 <Dialog open={addOpen} title="添加节点" onClose={()=>setAddOpen(false)}><Button data-interaction-id="cloud:canvas:dialog-text" onClick={()=>add('text')}>添加文字节点</Button><label>视频模型名称<input data-interaction-id="cloud:canvas:dialog-model" value={modelName} onChange={event=>setModelName(event.target.value)}/></label><Button data-interaction-id="cloud:canvas:add-video" disabled={!modelName.trim()} onClick={()=>add('video-generation')}>添加视频草稿</Button><CloudAssetPicker client={client} assets={assets} canWrite={canEdit} onPick={asset=>add('asset',asset)} onUploaded={()=>{void client.listAssets().then(setAssets).catch(e=>setError(workspaceMessage(e)));}}/></Dialog>
 <Dialog open={discardOpen} title="重新加载画布" onClose={()=>setDiscardOpen(false)} footer={<><Button data-interaction-id="cloud:canvas:keep" onClick={()=>setDiscardOpen(false)}>保留输入</Button><Button data-interaction-id="cloud:canvas:discard" variant="danger" onClick={async()=>{invalidInputs.current.clear();setInvalidCount(0);model.setComposing(false);await model.load(true);setDraftReset(value=>value+1);setDiscardOpen(false);}}>放弃未保存输入并重新加载</Button></>}><p>当前输入尚未确认保存。重新加载会放弃本页未保存的修改。</p></Dialog>
 </section>;
}
