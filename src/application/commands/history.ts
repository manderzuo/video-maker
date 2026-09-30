import {projectSchema} from '../../domain/project';
import {graphSchema,type Graph} from '../../domain/graph';
import {transact,requestResult,withDatabase,storageErrorCode} from '../../infrastructure/storage/database';
import {assertProjectWriter} from '../../infrastructure/storage/project-lease';
import {commandTables,putCreativeGraph,emptyHistory,type CommandContext,type StoredCommandReceipt,type HistoryState} from './apply-command';
import type {CommandReceipt} from './registry';
const graphContents=(graph:Graph)=>JSON.stringify({...graph,revision:0});
async function moveHistory(projectId:string,expectedRevision:number,context:CommandContext,action:'undo'|'redo'):Promise<CommandReceipt>{
 const id=crypto.randomUUID(),lease=context.lease?{...context.lease}:undefined;
 if(context.origin!=='ui')return {id,status:'rejected',errorCode:'agent_history_requires_browser_confirmation'};
 try{return await withDatabase(context.db,db=>transact(db,commandTables,'readwrite',async tx=>{
  await assertProjectWriter(tx,projectId,lease);
  const project=projectSchema.parse(await requestResult(tx.objectStore('projects').get(projectId)));
  if(project.revision!==expectedRevision)return {id,status:'conflict',revision:project.revision,errorCode:'project_revision_conflict'};
  if(project.trashedAt!==null)throw new Error('project_in_trash');
  const history:HistoryState=await requestResult(tx.objectStore('receipts').get('history:'+projectId))??emptyHistory(projectId);
  const from=action==='undo'?history.undoStack:history.redoStack,to=action==='undo'?history.redoStack:history.undoStack;
  const commandId=from.at(-1);if(!commandId)throw new Error('history_empty');
  const record:StoredCommandReceipt|undefined=await requestResult(tx.objectStore('receipts').get(commandId));
  if(!record||record.projectId!==projectId)throw new Error('history_receipt_missing');
  const current=graphSchema.parse(await requestResult(tx.objectStore('graphs').get(projectId)));
  const expected=action==='undo'?record.afterGraph:record.beforeGraph,target=action==='undo'?record.beforeGraph:record.afterGraph;
  if(current.revision!==project.revision||graphContents(current)!==graphContents(expected))throw new Error('history_graph_changed');
  const graph=graphSchema.parse({...structuredClone(target),revision:project.revision+1});
  await putCreativeGraph(tx,graph);tx.objectStore('projects').put({...project,revision:graph.revision,updatedAt:Date.now()});
  from.pop();to.push(commandId);tx.objectStore('receipts').put(history);
  tx.objectStore('receipts').put({id,projectId,status:'applied',revision:graph.revision,historyAction:action,sourceCommandId:commandId,beforeGraph:current,afterGraph:graph,createdAt:Date.now()});
  return {id,status:'applied',revision:graph.revision};
 }));}catch(error){return {id,status:'rejected',errorCode:storageErrorCode(error)};}
}
export function undoProject(projectId:string,expectedRevision:number,context:CommandContext){return moveHistory(projectId,expectedRevision,context,'undo');}
export function redoProject(projectId:string,expectedRevision:number,context:CommandContext){return moveHistory(projectId,expectedRevision,context,'redo');}
