import {projectSchema} from '../../domain/project';
import {graphSchema,type Graph} from '../../domain/graph';
import {requestResult,transact,withDatabase,storageErrorCode,type StudioDb,type TableName} from '../../infrastructure/storage/database';
import {assertProjectWriter,type ProjectLeaseToken} from '../../infrastructure/storage/project-lease';
import {snapshotAssetIds} from '../../features/assets/reference-index';
import {commandEnvelopeSchema,executeGraphOperations,type CommandEnvelope,type CommandReceipt} from './registry';
import {validateConnection,getOrderedInputs,type ReferenceLimits} from '../../domain/graph-validation';
import {unverifiedCapabilities,type CapabilityProfile} from '../../domain/connection';
import {assetSchema} from '../../domain/asset';
export type CommandContext={db?:StudioDb;lease?:ProjectLeaseToken;origin:'ui'|'mcp';authorize?:(envelope:CommandEnvelope)=>void;capability?:CapabilityProfile;referenceLimits?:ReferenceLimits;beforeCreativeCommit?:(tx:IDBTransaction)=>Promise<void>};
export type StoredCommandReceipt={id:string;projectId:string;status:'applied';revision:number;fingerprint:string;beforeGraph:Graph;afterGraph:Graph;origin:'ui'|'mcp';createdAt:number};
export type HistoryState={id:string;projectId:string;undoStack:string[];redoStack:string[]};
export const commandTables:TableName[]=['projects','graphs','receipts','references','leases','runs','assets','diagnostics','blobs','promptDrafts'];
export function emptyHistory(projectId:string):HistoryState{return {id:'history:'+projectId,projectId,undoStack:[],redoStack:[]};}
export async function putCreativeGraph(tx:IDBTransaction,graph:Graph){
 tx.objectStore('graphs').put(graph);
 const refs=tx.objectStore('references'),old=await requestResult<{id:string;kind?:string}[]>(refs.index('projectId').getAll(graph.projectId));
 for(const row of old)if(row.kind!=='project-import')refs.delete(row.id);
 for(const assetId of snapshotAssetIds(graph.nodes))refs.put({id:graph.projectId+':'+assetId,projectId:graph.projectId,assetId,revision:graph.revision});
}
export async function applyCommand(envelope:unknown,context:CommandContext):Promise<CommandReceipt>{
 const parsed=commandEnvelopeSchema.safeParse(envelope);
 if(!parsed.success)return {id:typeof envelope==='object'&&envelope&&'id'in envelope&&typeof envelope.id==='string'?envelope.id:'invalid',status:'rejected',errorCode:'command_schema_invalid'};
 const input=parsed.data,lease=context.lease?{...context.lease}:undefined;
 if(input.origin!==context.origin)return {id:input.id,status:'rejected',errorCode:'command_origin_mismatch'};
 if(input.origin==='mcp'&&!context.authorize)return {id:input.id,status:'rejected',errorCode:'agent_command_authorization_required'};
 try{
  context.authorize?.(input);
  return await withDatabase(context.db,db=>transact(db,commandTables,'readwrite',async tx=>{
   if(lease?.epoch!==input.leaseEpoch)throw new Error('lease_epoch_invalid');
   await assertProjectWriter(tx,input.projectId,lease);
   const fingerprint=JSON.stringify({...input,leaseEpoch:0}),receipt:StoredCommandReceipt|undefined=await requestResult(tx.objectStore('receipts').get(input.id));
   if(receipt){if(receipt.fingerprint!==fingerprint||receipt.projectId!==input.projectId)throw new Error('command_id_reused_with_different_input');return {id:input.id,status:'replayed',revision:receipt.revision};}
   const project=projectSchema.parse(await requestResult(tx.objectStore('projects').get(input.projectId)));
   if(project.trashedAt!==null)throw new Error('project_in_trash');
   if(project.revision!==input.baseRevision)return {id:input.id,status:'conflict',revision:project.revision,errorCode:'project_revision_conflict'};
   const before=graphSchema.parse(await requestResult(tx.objectStore('graphs').get(input.projectId)));
   if(before.revision!==project.revision)throw new Error('graph_revision_conflict');
   await context.beforeCreativeCommit?.(tx);
   for(const operation of input.operations)if(operation.type==='select_result'){
    const run=await requestResult(tx.objectStore('runs').get(operation.payload.runId)),asset=await requestResult(tx.objectStore('assets').get(operation.payload.assetId));
    if(!run||!asset||run.projectId!==project.id||run.resultAssetId!==asset.id||asset.sourceRunId!==run.id)throw new Error('result_binding_mismatch');
   }
   const graph=executeGraphOperations(before,input.operations);graph.revision=project.revision+1;
   const assets=(await requestResult<unknown[]>(tx.objectStore('assets').getAll())).map(a=>assetSchema.parse(a));
   for(const operation of input.operations)if(operation.type==='update_node'&&'data'in operation.payload.patch){
    const changed=graph.nodes.find(n=>n.id===operation.payload.nodeId)!;
    if(changed.type==='asset'&&!assets.some(a=>a.id===changed.data.assetId&&!a.trashedAt))throw new Error('asset_reference_missing');
    if(changed.type==='result')throw new Error('use_explicit_select_result');
    for(const edge of graph.edges.filter(e=>e.sourceId===changed.id)){const valid=validateConnection(graph,edge,context.capability??unverifiedCapabilities(),{assets,limits:context.referenceLimits});if(!valid.ok)throw new Error(valid.issues[0].code);}
   }
   for(const operation of input.operations)if(operation.type==='add_node'){
    const added=graph.nodes.find(n=>n.id===(operation.payload.node as {id:string}).id)!;
    if(added.type==='asset'&&!assets.some(a=>a.id===added.data.assetId&&!a.trashedAt))throw new Error('asset_reference_missing');
    if(added.type==='result'){const asset=assets.find(a=>a.id===added.data.assetId),run=await requestResult(tx.objectStore('runs').get(added.data.runId));if(!asset||!run||asset.sourceRunId!==run.id||run.resultAssetId!==asset.id)throw new Error('result_binding_mismatch');}
   }
   for(const operation of input.operations)if(operation.type==='add_edge'){
    const edge=graph.edges.find(e=>e.id===(operation.payload.edge as {id:string}).id)!;
    const valid=validateConnection(graph,edge,context.capability??unverifiedCapabilities(),{assets,limits:context.referenceLimits});if(!valid.ok)throw new Error(valid.issues[0].code);
   }
   const changedTargets=new Set(input.operations.flatMap(op=>op.type==='add_edge'?[(op.payload.edge as {targetId:string}).targetId]:op.type==='remove_edge'?before.edges.filter(e=>e.id===op.payload.edgeId).map(e=>e.targetId):op.type==='remove_node'?before.edges.filter(e=>e.sourceId===op.payload.nodeId).map(e=>e.targetId):[]));
   const changedSources=new Set(input.operations.flatMap(op=>op.type==='update_node'&&'data'in op.payload.patch||op.type==='select_result'?[op.payload.nodeId]:[]));
   for(const node of graph.nodes)if(node.type==='video-generation'){
    if(changedTargets.has(node.id))node.data={...node.data,inputBindings:getOrderedInputs(graph,node.id),stale:true,missingInputNodeIds:node.data.missingInputNodeIds?.filter(id=>!graph.edges.some(edge=>edge.targetId===node.id&&edge.sourceId===id))};
    if(graph.edges.some(e=>e.targetId===node.id&&changedSources.has(e.sourceId)))node.data={...node.data,inputBindings:getOrderedInputs(graph,node.id),stale:true};
   }
   await putCreativeGraph(tx,graph);
   tx.objectStore('projects').put({...project,revision:graph.revision,updatedAt:Date.now()});
   const record:StoredCommandReceipt={id:input.id,projectId:project.id,status:'applied',revision:graph.revision,fingerprint,beforeGraph:before,afterGraph:graph,origin:context.origin,createdAt:Date.now()};
   tx.objectStore('receipts').put(record);
   const history:HistoryState=await requestResult(tx.objectStore('receipts').get('history:'+project.id))??emptyHistory(project.id);
   history.undoStack.push(record.id);history.redoStack=[];tx.objectStore('receipts').put(history);
   tx.objectStore('diagnostics').put({id:crypto.randomUUID(),kind:'command_applied',projectId:project.id,revision:graph.revision,at:Date.now()});
   return {id:input.id,status:'applied',revision:graph.revision};
  }));
 }catch(error){return {id:input.id,status:'rejected',errorCode:storageErrorCode(error)};}
}
export function applyUiCommand(input:Omit<CommandEnvelope,'origin'|'leaseEpoch'>,context:Omit<CommandContext,'origin'>){
 return applyCommand({...input,origin:'ui',leaseEpoch:context.lease?.epoch??0},{...context,origin:'ui'});
}
