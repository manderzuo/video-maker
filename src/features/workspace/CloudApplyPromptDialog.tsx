import {useEffect,useRef,useState} from 'react';
import type {PromptDraft,PromptResultVersion} from '../../domain/prompt';
import type {Project} from '../../domain/project';
import type {Graph,CanvasNode} from '../../domain/graph';
import type {GraphOperation} from '../../application/commands/registry';
import {ApiError} from '../../infrastructure/api/client';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {inspectVideoTextInputs, nextEdgeOrder, resolveFlowSpec, type FlowCapability} from './cloud-video-input';
import type {VideoSpec} from '../../domain/common';

type TargetMode = 'text' | 'video' | 'flow';

export function CloudApplyPromptDialog({client,draft,version,initialMode,onClose,onApplied}:{client:WorkspaceClient;draft:PromptDraft;version:PromptResultVersion;initialMode?:TargetMode;onClose:()=>void;onApplied:(revision:number)=>void}){
 const [projects,setProjects]=useState<Project[]>([]),[target,setTarget]=useState(''),[graph,setGraph]=useState<Graph>(),[input,setInput]=useState<PromptDraft>();
 const [nodeId,setNodeId]=useState(''),[videoNodeId,setVideoNodeId]=useState(''),[replaceEdgeId,setReplaceEdgeId]=useState(''),[flowTitle,setFlowTitle]=useState('视频流程'),[mode,setMode]=useState<TargetMode>(initialMode??'text');
 const [cap,setCap]=useState<FlowCapability|null>(null),[capLoading,setCapLoading]=useState(false),[capError,setCapError]=useState(''),[selectedSpec,setSelectedSpec]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false);
 const alive=useRef(true),generation=useRef(0),frozen=useRef<{target:string;revision:number;key:string;command:Parameters<WorkspaceClient['command']>[2]}|undefined>(undefined);
 useEffect(()=>{let active=true;alive.current=true;void Promise.all([client.listProjects(),client.draftRevision(draft.id,version.sourceRevision)]).then(([rows,snapshot])=>{if(active){setProjects(rows);setTarget(rows[0]?.id??'');setInput(snapshot);}}).catch(e=>{if(active)setError(workspaceMessage(e));});return()=>{active=false;alive.current=false;};},[client,draft.id,version.sourceRevision]);
 async function readTarget(id:string){const current=++generation.current;setGraph(undefined);setNodeId('');setVideoNodeId('');setReplaceEdgeId('');setError('');try{const workspace=await client.readWorkspace(id);if(alive.current&&current===generation.current){setGraph(workspace.graph);setConflict(false);frozen.current=undefined;}}catch(e){if(alive.current&&current===generation.current)setError(workspaceMessage(e));}}
 useEffect(()=>{if(target)void readTarget(target);},[target]); // The request is guarded against late responses when the target changes.
 async function loadCapability(){setCapLoading(true);setCapError('');try{const value=await client.videoCapability();if(alive.current){setCap({model:value.model,videoSpecs:value.videoSpecs});setSelectedSpec('');}}catch(e){if(alive.current){setCap(null);setCapError(workspaceMessage(e));}}finally{if(alive.current)setCapLoading(false);}}
 useEffect(()=>{if(mode==='flow'&&!cap&&!capLoading&&!capError)void loadCapability();},[mode]);
 useEffect(()=>{frozen.current=undefined;},[mode,nodeId,videoNodeId,replaceEdgeId,flowTitle,selectedSpec]);
 function textData():Extract<CanvasNode,{type:'text'}>['data']{
  return {kind:'text',text:version.finalPrompt,referenceTokens:structuredClone(input!.references),promptGenerationSource:{draftId:draft.id,resultVersionId:version.id,sourceRevision:version.sourceRevision,origin:version.origin,ruleVersion:input!.ruleVersion}};
 }
 async function buildOperations():Promise<GraphOperation[]>{
  if(!graph||!input) throw new Error('目标画布尚未加载。');
  const op=(type:GraphOperation['type'],payload:Record<string,unknown>):GraphOperation=>({id:crypto.randomUUID(),type,payload});
  if(mode==='text'){
   const selected=nodeId?graph.nodes.find(node=>node.id===nodeId):undefined;
   if(nodeId&&(!selected||selected.type!=='text'||selected.locked))throw new Error('目标文字节点已不可编辑，请重新加载画布。');
   const data=textData();
   const operation=selected?{id:crypto.randomUUID(),type:'update_node' as const,payload:{nodeId:selected.id,patch:{data}}}:{id:crypto.randomUUID(),type:'add_node' as const,payload:{node:{id:crypto.randomUUID(),type:'text' as const,title:[...(draft.userRequest.trim()||'写作结果')].slice(0,60).join(''),x:64,y:64,locked:false,data}}};
   return [operation];
  }
  if(mode==='video'){
   const video=graph.nodes.find(n=>n.id===videoNodeId);
   if(!video||video.type!=='video-generation') throw new Error('请选择目标视频草稿。');
   if(video.locked) throw new Error('目标视频草稿已锁定。');
   const {sources}=inspectVideoTextInputs(graph,video.id);
   const textId=crypto.randomUUID();
   const node:CanvasNode={id:textId,type:'text',title:[...(draft.userRequest.trim()||'写作结果')].slice(0,60).join('')||'文字',x:video.x-380,y:video.y,locked:false,data:textData()};
   const ops:GraphOperation[]=[op('add_node',{node})];
   if(replaceEdgeId){
    const old=graph.edges.find(e=>e.id===replaceEdgeId&&e.targetId===video.id);
    if(!old) throw new Error('待替换的输入已变化，请重新加载。');
    ops.push(op('remove_edge',{edgeId:old.id}));
    ops.push(op('add_edge',{edge:{id:crypto.randomUUID(),sourceId:textId,targetId:video.id,port:'text',order:old.order}}));
   } else {
    ops.push(op('add_edge',{edge:{id:crypto.randomUUID(),sourceId:textId,targetId:video.id,port:'text',order:nextEdgeOrder(graph,video.id)}}));
   }
   void sources;
   return ops;
  }
  // flow: 新建文字 + 新建视频草稿 + 连线，一次保存。规格以写作请求为准，不复制旁边视频，不猜默认。
  const requested = input.requestedSpec ?? {};
  const suggested = version.suggestedSpec ?? {};
  const parsedSelected = selectedSpec ? (JSON.parse(selectedSpec) as VideoSpec) : undefined;
  const resolved = resolveFlowSpec({requested, suggested, capability: cap ?? undefined, selected: parsedSelected});
  if (resolved.kind !== 'ready') {
    throw new Error(resolved.reason);
  }
  const spec = resolved.spec;
  const textId=crypto.randomUUID(),vid=crypto.randomUUID();
  const textNode:CanvasNode={id:textId,type:'text',title:[...(draft.userRequest.trim()||'写作结果')].slice(0,60).join('')||'文字',x:64,y:64,locked:false,data:textData()};
  const videoNode:CanvasNode={id:vid,type:'video-generation',title:flowTitle.trim()||'视频草稿',x:444,y:64,locked:false,data:{kind:'video-generation',draft:spec,inputBindings:[],stale:true}};
  return [op('add_node',{node:textNode}),op('add_node',{node:videoNode}),op('add_edge',{edge:{id:crypto.randomUUID(),sourceId:textId,targetId:vid,port:'text',order:0}})];
 }
 async function apply(){if(busy||!graph||!input||!target||conflict)return;setBusy(true);setError('');try{
  if(!frozen.current){
   const operations=await buildOperations();
   frozen.current={target,revision:graph.revision,key:crypto.randomUUID(),command:{type:'operations',operations}};
  }
  const attempt=frozen.current,receipt=await client.command(attempt.target,attempt.revision,attempt.command,attempt.key);
  if(alive.current)onApplied(receipt.revision);
 }catch(e){if(alive.current){if(e instanceof ApiError&&e.status===409)setConflict(true);setError(e instanceof Error?e.message:workspaceMessage(e));}}finally{if(alive.current)setBusy(false);}}
 const videoSources=graph&&videoNodeId?inspectVideoTextInputs(graph,videoNodeId):null;
 const flowResolution=input?resolveFlowSpec({requested:input.requestedSpec??{},suggested:version.suggestedSpec??{},capability:cap??undefined,selected:selectedSpec?(JSON.parse(selectedSpec) as VideoSpec):undefined}):null;
 const flowReady=mode!=='flow'||(flowResolution?.kind==='ready');
 return <Dialog open title="应用写作结果到画布" dismissible={!busy} onClose={onClose} footer={<><Button data-interaction-id="cloud:draft:apply-cancel" disabled={busy} onClick={onClose}>取消</Button><Button data-interaction-id="cloud:draft:apply-confirm" variant="primary" busy={busy} disabled={!graph||!input||!target||conflict||(mode==='video'&&!videoNodeId)||!flowReady} onClick={apply}>确认应用到云端画布</Button></>}>
  <p>将保存此结果的文字和输入来源。画布中的生成节点不会自动运行。编辑提示词、应用到画布、连接节点、创建草稿均不触发收费生成。</p>
  <fieldset disabled={busy||!!frozen.current}><legend>应用目标</legend>
   <label><input type="radio" data-interaction-id="cloud:draft:apply-mode-text" checked={mode==='text'} onChange={()=>setMode('text')}/>插入文字</label>
   <label><input type="radio" data-interaction-id="cloud:draft:apply-mode-video" checked={mode==='video'} onChange={()=>setMode('video')}/>应用到视频草稿</label>
   <label><input type="radio" data-interaction-id="cloud:draft:apply-mode-flow" checked={mode==='flow'} onChange={()=>setMode('flow')}/>创建视频流程</label>
  </fieldset>
  <label>目标项目<select aria-label="目标项目" data-interaction-id="cloud:draft:apply-project" disabled={busy||!!frozen.current} value={target} onChange={event=>setTarget(event.target.value)}><option value="">请选择</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
  {mode==='text'&&<label>目标文字节点<select aria-label="目标文字节点" data-interaction-id="cloud:draft:apply-node" disabled={busy||!!frozen.current||!graph} value={nodeId} onChange={event=>setNodeId(event.target.value)}><option value="">插入新的文字节点</option>{graph?.nodes.filter(node=>node.type==='text'&&!node.locked).map(node=><option key={node.id} value={node.id}>{node.title}</option>)}</select></label>}
  {mode==='video'&&<>
   <label>目标视频草稿<select aria-label="目标视频草稿" data-interaction-id="cloud:draft:apply-video" disabled={busy||!!frozen.current||!graph} value={videoNodeId} onChange={event=>{setVideoNodeId(event.target.value);setReplaceEdgeId('');}}><option value="">请选择视频草稿</option>{graph?.nodes.filter(node=>node.type==='video-generation'&&!node.locked).map(node=><option key={node.id} value={node.id}>{node.title}</option>)}</select></label>
   {videoSources&&videoSources.sources.length>0&&<>
    <p>该视频已有 {videoSources.sources.length} 个文字输入，请选择追加或替换其中一个。替换只改变当前视频的连接，原文字和历史任务保留。</p>
    <label><input type="radio" data-interaction-id="cloud:draft:apply-append" disabled={busy||!!frozen.current} checked={!replaceEdgeId} onChange={()=>setReplaceEdgeId('')}/>追加为新的输入</label>
    {videoSources.sources.map(s=><label key={s.edgeId}><input type="radio" data-interaction-id="cloud:draft:apply-replace" disabled={busy||!!frozen.current} checked={replaceEdgeId===s.edgeId} onChange={()=>setReplaceEdgeId(s.edgeId)}/>替换“{s.title}”（不断开其他输入，原文字保留）</label>)}
   </>}
   {videoSources&&videoSources.sources.length===0&&<p>该视频暂无文字输入，将新建文字并连接。</p>}
  </>}
  {mode==='flow'&&<>
   <label>新建视频草稿标题<input aria-label="新建视频草稿标题" data-interaction-id="cloud:draft:apply-flow-title" disabled={busy||!!frozen.current} value={flowTitle} onChange={event=>setFlowTitle(event.target.value)}/></label>
   <p>写作请求：{input?.requestedSpec?.durationSeconds!==undefined?input.requestedSpec.durationSeconds+'秒':'未指定'} / {input?.requestedSpec?.ratio??'未指定'}；建议规格：{version.suggestedSpec?.durationSeconds!==undefined?version.suggestedSpec.durationSeconds+'秒':'未指定'} / {version.suggestedSpec?.ratio??'未指定'}。新建规格以此为准，不从旁边视频复制。</p>
   {capLoading&&<p role="status">正在读取视频执行能力…</p>}
   {capError&&<><p role="alert">{capError}</p><Button data-interaction-id="cloud:draft:apply-cap-retry" disabled={busy||capLoading} onClick={()=>loadCapability()}>重试读取能力</Button></>}
   {!capLoading&&!capError&&cap&&<>
    <label>执行规格（已核验 {cap.videoSpecs.length} 项）<select aria-label="执行规格" data-interaction-id="cloud:draft:apply-flow-spec" disabled={busy||!!frozen.current} value={selectedSpec} onChange={event=>setSelectedSpec(event.target.value)}>
     <option value="">请选择执行规格</option>
     {(flowResolution?.kind==='need_selection'?flowResolution.options:cap.videoSpecs).map(spec=><option key={JSON.stringify(spec)} value={JSON.stringify(spec)}>{spec.modelId} · {spec.durationSeconds}秒 · {spec.ratio}{spec.resolution?' · '+spec.resolution:''}</option>)}
    </select></label>
    {flowResolution?.kind==='need_selection'&&<p role="alert">{flowResolution.reason}</p>}
    {flowResolution?.kind==='ready'&&flowResolution.warning&&<p role="alert">{flowResolution.warning}</p>}
    {flowResolution?.kind==='ready'&&!flowResolution.warning&&<p>将按{flowResolution.spec.durationSeconds}秒 / {flowResolution.spec.ratio}创建，原写作请求保留，不静默替换。</p>}
    {flowResolution?.kind==='capability_unavailable'&&<p role="alert">{flowResolution.reason}</p>}
   </>}
  </>}
  <pre aria-label="待应用结果正文">{version.finalPrompt}</pre><p>输入修订 {version.sourceRevision}{graph?' · 画布修订 '+graph.revision:''}</p>
  {error?<p role="alert" className="banner error">{error}</p>:null}{frozen.current&&error&&!conflict?<p>重试沿用同一请求；若服务端已保存，重试只取回原结果，不重复创建。如需更改目标，请重新加载目标画布。</p>:null}{conflict?<Button data-interaction-id="cloud:draft:apply-reload" disabled={busy} onClick={()=>readTarget(target)}>重新加载目标画布</Button>:null}
 </Dialog>;
}
