import {z} from 'zod';
import {withDatabase,transact,storageErrorCode,type StudioDb,type TableName} from '../../infrastructure/storage/database';
import {assertProjectWriter,type ProjectLeaseToken} from '../../infrastructure/storage/project-lease';
import {loadResourceSnapshot,referencesFor,snapshotAssetIds,type ResourceSnapshot} from '../assets/reference-index';
import type {Asset} from '../../domain/asset';
export type DeleteTarget={kind:'project'|'node'|'asset';id:string;mode:'soft'|'permanent';projectId?:string};
export type DeletionImpact={target:DeleteTarget;blockers:string[];sharedAssets:string[];activeRuns:string[];referencedAssets:string[];deletable:boolean;impactHash:string;displayedCounts:{references:number;activeRuns:number;sharedAssets:number}};
export type DeletionConfirmation={impactHash:string;displayedCounts:DeletionImpact['displayedCounts'];projectTitle?:string};
export type DeleteOptions={db?:StudioDb;lease?:ProjectLeaseToken;expectedRevision?:number};
export type DeleteResult={success:boolean;id:string;errorCode?:string;revision?:number};
const targetSchema=z.strictObject({kind:z.enum(['project','node','asset']),id:z.string().min(1),mode:z.enum(['soft','permanent']),projectId:z.string().min(1).optional()});
export const deletionTables:TableName[]=['projects','graphs','assets','blobs','runs','promptDrafts','references','receipts','leases'];
function removeAssetRecords(tx:IDBTransaction,asset:Asset,snapshot:ResourceSnapshot,removedIds=new Set([asset.id])){
 tx.objectStore('assets').delete(asset.id);
 if(!snapshot.assets.some(a=>!removedIds.has(a.id)&&a.blobKey===asset.blobKey)){tx.objectStore('blobs').delete(asset.blobKey);tx.objectStore('blobs').delete('thumbnail:'+asset.sha256);}
}
export function removeUnreferencedAssetsInTransaction(tx:IDBTransaction,snapshot:ResourceSnapshot,ids:string[]){
 const removed=new Set(ids);if(removed.size!==ids.length)throw Error('cleanup_targets_invalid');
 const assets=ids.map(id=>snapshot.assets.find(asset=>asset.id===id));if(assets.some(asset=>!asset||referencesFor(snapshot,asset.id).length))throw Error('cleanup_asset_referenced');
 for(const asset of assets)removeAssetRecords(tx,asset!,snapshot,removed);
}
export function removeProjectRecordsInTransaction(tx:IDBTransaction,projectId:string,snapshot:ResourceSnapshot){
 tx.objectStore('projects').delete(projectId);tx.objectStore('graphs').delete(projectId);
 for(const link of snapshot.links)if(link.projectId===projectId)tx.objectStore('references').delete(link.id);
}
const activeStates=new Set(['persisted','uploading','submitting','submit_unknown','accepted','running']);
function deriveImpact(target:DeleteTarget,snapshot:ResourceSnapshot):Omit<DeletionImpact,'impactHash'>{
 const blockers:string[]=[],projectId=target.kind==='project'?target.id:target.projectId;
 const project=snapshot.projects.find(p=>p.id===projectId),asset=snapshot.assets.find(a=>a.id===target.id),graph=snapshot.graphs.find(g=>g.projectId===projectId);
 if(target.kind==='project'&&!project)blockers.push('resource_not_found');
 if(target.kind==='node'&&(!project||!graph?.nodes.some(n=>n.id===target.id)))blockers.push('resource_not_found');
 if(target.kind==='asset'&&!asset)blockers.push('resource_not_found');
 const activeRuns=target.kind==='project'?snapshot.runs.filter(r=>r.projectId===target.id&&activeStates.has(r.executionState)).map(r=>r.id).sort():[];
 const referencedAssets=target.kind==='asset'?[target.id]:Array.from(new Set([...snapshotAssetIds(target.kind==='node'?graph?.nodes.filter(n=>n.id===target.id):graph?.nodes),...snapshot.links.filter(r=>r.projectId===projectId&&r.kind==='project-import').map(r=>r.assetId)])).sort();
 const sharedAssets=referencedAssets.filter(id=>referencesFor(snapshot,id).some(r=>r.projectId!==projectId||r.kind==='run'||r.kind==='draft'||r.kind==='receipt'));
 const references=target.kind==='asset'?referencesFor(snapshot,target.id).length:referencedAssets.length;
 if(target.mode==='permanent'){
  if(target.kind==='asset'&&references>0)blockers.push('asset_referenced');
  if(target.kind==='project'&&activeRuns.length)blockers.push('active_or_unknown_tracking');
  if(target.kind==='project'&&project?.trashedAt===null)blockers.push('project_not_in_trash');
 }
 return {target,blockers,sharedAssets,activeRuns,referencedAssets,deletable:blockers.length===0,displayedCounts:{references,activeRuns:activeRuns.length,sharedAssets:sharedAssets.length}};
}
function fingerprint(target:DeleteTarget,snapshot:ResourceSnapshot){
 const projectId=target.kind==='project'?target.id:target.projectId;
 const impact=deriveImpact(target,snapshot);
 return JSON.stringify({impact,project:snapshot.projects.find(p=>p.id===projectId),graph:snapshot.graphs.find(g=>g.projectId===projectId),asset:target.kind==='asset'?snapshot.assets.find(a=>a.id===target.id):undefined,runs:snapshot.runs.filter(r=>r.projectId===projectId).map(r=>({id:r.id,updatedAt:r.updatedAt,executionState:r.executionState})),references:impact.referencedAssets.map(id=>({id,refs:referencesFor(snapshot,id)}))});
}
async function digest(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
async function capture(target:DeleteTarget,db:StudioDb){return transact(db,deletionTables,'readonly',async tx=>{const snapshot=await loadResourceSnapshot(tx);return {snapshot,fingerprint:fingerprint(target,snapshot)};});}
export async function getDeletionImpact(target:DeleteTarget,options:DeleteOptions={}):Promise<DeletionImpact>{
 const input=targetSchema.parse(target);
 return withDatabase(options.db,async db=>{const captured=await capture(input,db);return {...deriveImpact(input,captured.snapshot),impactHash:await digest(captured.fingerprint)};});
}
export async function prepareNodeDeletionGuard(impacts:DeletionImpact[],options:DeleteOptions={}){
 return withDatabase(options.db,async db=>{
  const captured: {target:DeleteTarget;fingerprint:string}[]=[];
  for(const displayed of impacts){if(displayed.target.kind!=='node')throw new Error('node_guard_only');const current=await capture(displayed.target,db),actual=deriveImpact(displayed.target,current.snapshot);if(!actual.deletable||displayed.impactHash!==await digest(current.fingerprint)||JSON.stringify(displayed.displayedCounts)!==JSON.stringify(actual.displayedCounts))throw new Error('deletion_impact_changed');captured.push({target:displayed.target,fingerprint:current.fingerprint});}
  return async(tx:IDBTransaction)=>{const snapshot=await loadResourceSnapshot(tx);for(const item of captured)if(fingerprint(item.target,snapshot)!==item.fingerprint)throw new Error('deletion_impact_changed');};
 });
}
export async function deleteLocalResource(target:DeleteTarget,confirmation:DeletionConfirmation,options:DeleteOptions={}):Promise<DeleteResult>{
 const input=targetSchema.safeParse(target);if(!input.success)return {success:false,id:target.id,errorCode:'delete_target_invalid'};
 const intent=structuredClone(confirmation),lease=options.lease?{...options.lease}:undefined;
 try{return await withDatabase(options.db,async db=>{
  const captured=await capture(input.data,db),impact=deriveImpact(input.data,captured.snapshot);
  if(intent.impactHash!==await digest(captured.fingerprint)||JSON.stringify(intent.displayedCounts)!==JSON.stringify(impact.displayedCounts))return {success:false,id:target.id,errorCode:'deletion_impact_changed'};
  if(!impact.deletable)return {success:false,id:target.id,errorCode:impact.blockers[0]};
  return transact(db,deletionTables,'readwrite',async tx=>{
   const snapshot=await loadResourceSnapshot(tx);
   if(fingerprint(input.data,snapshot)!==captured.fingerprint)throw new Error('deletion_impact_changed');
   if(input.data.kind==='asset'){
    const asset=snapshot.assets.find(a=>a.id===target.id)!;
    if(target.mode==='soft')tx.objectStore('assets').put({...asset,trashedAt:Date.now()});
    else{
     removeAssetRecords(tx,asset,snapshot);
    }
    return {success:true,id:target.id};
   }
   const projectId=target.kind==='project'?target.id:target.projectId!;
   await assertProjectWriter(tx,projectId,lease);
   const project=snapshot.projects.find(p=>p.id===projectId)!;
   if(project.revision!==options.expectedRevision)throw new Error('project_revision_conflict');
   if(target.kind==='project'&&target.mode==='permanent'){
    if(intent.projectTitle!==project.title)throw new Error('project_name_confirmation_required');
    removeProjectRecordsInTransaction(tx,projectId,snapshot);
    // Runs and media remain in the global task/media library, including terminal evidence.
    return {success:true,id:target.id};
   }
   const nextRevision=project.revision+1;
   tx.objectStore('projects').put({...project,revision:nextRevision,updatedAt:Date.now(),...(target.kind==='project'?{trashedAt:Date.now()}:{})});
   const graph=snapshot.graphs.find(g=>g.projectId===projectId);
   if(graph){
    const nodes=target.kind==='node'?graph.nodes.filter(n=>n.id!==target.id).map(n=>n.type==='group'?{...n,data:{...n.data,childIds:n.data.childIds.filter(id=>id!==target.id)}}:n):graph.nodes;
    const edges=target.kind==='node'?graph.edges.filter(e=>e.sourceId!==target.id&&e.targetId!==target.id):graph.edges;
    tx.objectStore('graphs').put({...graph,revision:nextRevision,nodes,edges});
   }
   return {success:true,id:target.id,revision:nextRevision};
  });
 });}catch(error){return {success:false,id:target.id,errorCode:storageErrorCode(error)};}
}
