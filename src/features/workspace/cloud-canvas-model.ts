import type {Project} from '../../domain/project';
import type {Graph,Viewport} from '../../domain/graph';
import {executeGraphOperations,type GraphOperation} from '../../application/commands/registry';
import type {WorkspaceClient,WorkspaceSnapshot,CloudCommand} from '../../infrastructure/api/workspace-client';
type CanvasApi=Pick<WorkspaceClient,'readWorkspace'|'command'>;
function appendPending(previous:GraphOperation[],operations:GraphOperation[]){
 const pending=[...previous];
 for(const next of structuredClone(operations)){
  const last=pending.at(-1);
  if(last?.type===next.type&&last.payload.nodeId===next.payload.nodeId){
   if(next.type==='update_node'){
    pending[pending.length-1]={...next,payload:{...next.payload,patch:{...last.payload.patch as object,...next.payload.patch as object}}};continue;
   }
   if(next.type==='move_node'){pending[pending.length-1]=next;continue;}
  }
  pending.push(next);
 }
 return pending;
}
export type CloudCanvasState={status:'loading'|'saved'|'dirty'|'saving'|'failed';project?:Project;graph?:Graph;history:WorkspaceSnapshot['history'];pending:GraphOperation[];error?:unknown};
export function createCloudCanvasModel(projectId:string,client:CanvasApi){
 let state:CloudCanvasState={status:'loading',history:{undoDepth:0,redoDepth:0},pending:[]},base:Graph|undefined,disposed=false,epoch=0;
 let attempt:{key:string;revision:number;command:CloudCommand}|undefined;
 const listeners=new Set<()=>void>();const publish=(next:CloudCanvasState)=>{if(disposed)return;state=next;for(const cb of listeners)cb();};
 const busy=()=>state.status==='saving'||state.status==='loading';
 async function load(discard=false){
  if(disposed)return;if((state.pending.length||state.status==='dirty'||state.status==='failed')&&!discard)throw new Error('unsaved_changes');const generation=++epoch;publish({...state,status:'loading'});
  try{const data=await client.readWorkspace(projectId);if(disposed||epoch!==generation)return;base=data.graph;attempt=undefined;publish({...data,status:'saved',pending:[]});}catch(error){if(epoch===generation)publish({...state,status:'failed',error});}
 }
 function stage(operations:GraphOperation[]){
  if(disposed||busy()||!state.graph)throw new Error('editor_busy');if(attempt)throw new Error('retry_pending_save_first');
  const graph=executeGraphOperations(state.graph,operations);publish({...state,status:'dirty',graph,pending:appendPending(state.pending,operations),error:undefined});
 }
 function viewport(value:Viewport){if(disposed||busy()||!state.graph||attempt)return;publish({...state,status:'dirty',graph:{...state.graph,viewport:value},error:undefined});}
 async function save(){
  if(disposed||busy()||!base||!state.graph||state.status==='saved')return;
  const changedViewport=JSON.stringify(state.graph.viewport)!==JSON.stringify(base.viewport);
  attempt??={key:crypto.randomUUID(),revision:base.revision,command:state.pending.length?{type:'operations',operations:structuredClone(state.pending),...(changedViewport?{viewport:structuredClone(state.graph.viewport)}:{})}:{type:'viewport',viewport:structuredClone(state.graph.viewport)}};
  const request=attempt,generation=epoch;publish({...state,status:'saving',error:undefined});
  try{
   const data=await client.command(projectId,request.revision,request.command,request.key);if(disposed||epoch!==generation)return;
   base=data.graph;attempt=undefined;publish({status:'saved',project:data.project,graph:data.graph,history:data.history??state.history,pending:[]});
  }catch(error){if(disposed||epoch!==generation)return;publish({...state,status:'failed',error});}
 }
 async function history(type:'undo'|'redo'){
  if(disposed||busy()||state.status!=='saved'||!base)return;
  attempt={key:crypto.randomUUID(),revision:base.revision,command:{type}};publish({...state,status:'dirty'});await save();
 }
 return {getState:()=>state,subscribe:(cb:()=>void)=>{listeners.add(cb);return()=>{listeners.delete(cb);};},load,stage,viewport,save,history,dispose(){disposed=true;epoch++;listeners.clear();}};
}
