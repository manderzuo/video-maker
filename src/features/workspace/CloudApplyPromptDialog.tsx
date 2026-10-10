import {useEffect,useRef,useState} from 'react';
import type {PromptDraft,PromptResultVersion} from '../../domain/prompt';
import type {Project} from '../../domain/project';
import type {Graph} from '../../domain/graph';
import {ApiError} from '../../infrastructure/api/client';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';

export function CloudApplyPromptDialog({client,draft,version,onClose,onApplied}:{client:WorkspaceClient;draft:PromptDraft;version:PromptResultVersion;onClose:()=>void;onApplied:(revision:number,target:string,nodeId:string)=>void}){
 const [projects,setProjects]=useState<Project[]>([]),[target,setTarget]=useState(''),[graph,setGraph]=useState<Graph>(),[input,setInput]=useState<PromptDraft>();
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false);
 const alive=useRef(true),generation=useRef(0),frozen=useRef<{target:string;revision:number;key:string;nodeId:string;command:Parameters<WorkspaceClient['command']>[2]}|undefined>(undefined);
 useEffect(()=>{let active=true;alive.current=true;void Promise.all([client.listProjects(),client.draftRevision(draft.id,version.sourceRevision)]).then(([rows,snapshot])=>{if(active){setProjects(rows);setInput(snapshot);}}).catch(e=>{if(active)setError(workspaceMessage(e));});return()=>{active=false;alive.current=false;};},[client,draft.id,version.sourceRevision]);
 async function readTarget(id:string){const current=++generation.current;setGraph(undefined);setError('');try{const workspace=await client.readWorkspace(id);if(alive.current&&current===generation.current){setGraph(workspace.graph);setConflict(false);frozen.current=undefined;}}catch(e){if(alive.current&&current===generation.current)setError(workspaceMessage(e));}}
 useEffect(()=>{if(target)void readTarget(target);},[target]);
 async function apply(){if(busy||!graph||!input||!target||conflict)return;setBusy(true);setError('');try{
  if(!frozen.current){
   const nodeId=crypto.randomUUID(),x=64+graph.nodes.length*24,y=64+graph.nodes.length*24;
   frozen.current={target,revision:graph.revision,key:crypto.randomUUID(),nodeId,command:{type:'operations',operations:[{id:crypto.randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'text',title:[...(input.userRequest.trim()||'写作结果')].slice(0,60).join(''),x,y,locked:false,data:{kind:'text',text:version.finalPrompt,referenceTokens:structuredClone(input.references),promptGenerationSource:{draftId:draft.id,resultVersionId:version.id,sourceRevision:version.sourceRevision,origin:version.origin,ruleVersion:input.ruleVersion}}}}}]}};
  }
  const attempt=frozen.current,receipt=await client.command(attempt.target,attempt.revision,attempt.command,attempt.key);
  if(alive.current)onApplied(receipt.revision,attempt.target,attempt.nodeId);
 }catch(e){if(alive.current){if(e instanceof ApiError&&e.status===409)setConflict(true);setError(workspaceMessage(e));}}finally{if(alive.current)setBusy(false);}}
 return <Dialog open title="插入到画布中" dismissible={!busy} onClose={onClose} footer={<><Button data-interaction-id="cloud:draft:apply-cancel" disabled={busy} onClick={onClose}>取消</Button><Button data-interaction-id="cloud:draft:apply-confirm" variant="primary" busy={busy} disabled={!graph||!input||!target||conflict} onClick={apply}>确认插入</Button></>}>
  <label>目标项目<select aria-label="目标项目" data-interaction-id="cloud:draft:apply-project" disabled={busy||!!frozen.current} value={target} onChange={event=>setTarget(event.target.value)}><option value="">请选择项目</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
  <p>插入新的文字节点，保存成功后进入画布。</p>
  {error?<p role="alert">{error}</p>:null}{frozen.current&&error&&!conflict?<p>重试会取回同一请求的结果，不重复插入。</p>:null}{conflict?<Button data-interaction-id="cloud:draft:apply-reload" disabled={busy} onClick={()=>readTarget(target)}>重新读取目标画布</Button>:null}
 </Dialog>;
}
