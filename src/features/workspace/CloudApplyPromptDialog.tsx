import {useEffect,useRef,useState} from 'react';
import type {PromptDraft,PromptResultVersion} from '../../domain/prompt';
import type {Project} from '../../domain/project';
import type {Graph,CanvasNode} from '../../domain/graph';
import {ApiError} from '../../infrastructure/api/client';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';

export function CloudApplyPromptDialog({client,draft,version,onClose,onApplied}:{client:WorkspaceClient;draft:PromptDraft;version:PromptResultVersion;onClose:()=>void;onApplied:(revision:number)=>void}){
 const [projects,setProjects]=useState<Project[]>([]),[target,setTarget]=useState(''),[graph,setGraph]=useState<Graph>(),[input,setInput]=useState<PromptDraft>();
 const [nodeId,setNodeId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false);
 const alive=useRef(true),generation=useRef(0),frozen=useRef<{target:string;revision:number;key:string;command:Parameters<WorkspaceClient['command']>[2]}|undefined>(undefined);
 useEffect(()=>{let active=true;alive.current=true;void Promise.all([client.listProjects(),client.draftRevision(draft.id,version.sourceRevision)]).then(([rows,snapshot])=>{if(active){setProjects(rows);setTarget(rows[0]?.id??'');setInput(snapshot);}}).catch(e=>{if(active)setError(workspaceMessage(e));});return()=>{active=false;alive.current=false;};},[client,draft.id,version.sourceRevision]);
 async function readTarget(id:string){const current=++generation.current;setGraph(undefined);setNodeId('');setError('');try{const workspace=await client.readWorkspace(id);if(alive.current&&current===generation.current){setGraph(workspace.graph);setConflict(false);frozen.current=undefined;}}catch(e){if(alive.current&&current===generation.current)setError(workspaceMessage(e));}}
 useEffect(()=>{if(target)void readTarget(target);},[target]); // The request is guarded against late responses when the target changes.
 async function apply(){if(busy||!graph||!input||!target||conflict)return;setBusy(true);setError('');try{
  if(!frozen.current){
   const selected=nodeId?graph.nodes.find(node=>node.id===nodeId):undefined;
   if(nodeId&&(!selected||selected.type!=='text'||selected.locked))throw new Error('目标文字节点已不可编辑，请重新加载画布。');
   const data:Extract<CanvasNode,{type:'text'}>['data']={kind:'text',text:version.finalPrompt,referenceTokens:structuredClone(input.references),promptGenerationSource:{draftId:draft.id,resultVersionId:version.id,sourceRevision:version.sourceRevision,origin:version.origin,ruleVersion:input.ruleVersion}};
   const operation=selected?{id:crypto.randomUUID(),type:'update_node' as const,payload:{nodeId:selected.id,patch:{data}}}:{id:crypto.randomUUID(),type:'add_node' as const,payload:{node:{id:crypto.randomUUID(),type:'text' as const,title:[...(draft.userRequest.trim()||'写作结果')].slice(0,60).join(''),x:64,y:64,locked:false,data}}};
   frozen.current={target,revision:graph.revision,key:crypto.randomUUID(),command:{type:'operations',operations:[operation]}};
  }
  const attempt=frozen.current,receipt=await client.command(attempt.target,attempt.revision,attempt.command,attempt.key);
  if(alive.current)onApplied(receipt.revision);
 }catch(e){if(alive.current){if(e instanceof ApiError&&e.status===409)setConflict(true);setError(workspaceMessage(e));}}finally{if(alive.current)setBusy(false);}}
 return <Dialog open title="应用写作结果到画布" dismissible={!busy} onClose={onClose} footer={<><Button data-interaction-id="cloud:draft:apply-cancel" disabled={busy} onClick={onClose}>取消</Button><Button data-interaction-id="cloud:draft:apply-confirm" variant="primary" busy={busy} disabled={!graph||!input||!target||conflict} onClick={apply}>确认应用到云端画布</Button></>}>
  <p>将保存此结果的文字和输入来源。画布中的生成节点不会自动运行。</p>
  <label>目标项目<select aria-label="目标项目" data-interaction-id="cloud:draft:apply-project" disabled={busy||!!frozen.current} value={target} onChange={event=>setTarget(event.target.value)}><option value="">请选择</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
  <label>目标文字节点<select aria-label="目标文字节点" data-interaction-id="cloud:draft:apply-node" disabled={busy||!!frozen.current||!graph} value={nodeId} onChange={event=>setNodeId(event.target.value)}><option value="">插入新的文字节点</option>{graph?.nodes.filter(node=>node.type==='text'&&!node.locked).map(node=><option key={node.id} value={node.id}>{node.title}</option>)}</select></label>
  <pre aria-label="待应用结果正文">{version.finalPrompt}</pre><p>输入修订 {version.sourceRevision}{graph?' · 画布修订 '+graph.revision:''}</p>
  {error?<p role="alert" className="banner error">{error}</p>:null}{conflict?<Button data-interaction-id="cloud:draft:apply-reload" disabled={busy} onClick={()=>readTarget(target)}>重新加载目标画布</Button>:null}
 </Dialog>;
}
