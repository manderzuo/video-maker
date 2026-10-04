import {resultSourceLink} from './result-source-link';
import type {Asset} from '../../domain/asset';
import type {Run} from '../../domain/run';
import type {CanvasNode,Graph} from '../../domain/graph';
import type {GraphOperation} from '../../application/commands/registry';
import {assetSchema} from '../../domain/asset';
import {runSchema} from '../../domain/run';
import {withDatabase,transact,requestResult,type StudioDb} from '../../infrastructure/storage/database';
import {prepareTailFrame,type TailFrame} from './tail-frame';
import {hashBlob} from '../assets/hash-worker';
import {nodeRect} from '../canvas/geometry';

// Explicit, undoable repair. Modern source metadata survives disconnect, so this
// operation never silently reattaches a source the user deliberately disconnected.
export async function prepareLineageRepair(graph:Graph,assets:Asset[],runs:Run[],db?:StudioDb){
 const operations:GraphOperation[]=[],nodes=graph.nodes.slice(),verified=new Map<string,{run:Run;asset:Asset}>(),verifiedFrames=new Map<string,Asset>(),unresolved:string[]=[];
 const op=(operation:Omit<GraphOperation,'id'>)=>operations.push({...operation,id:crypto.randomUUID()} as GraphOperation);
 function sourceNode(run:Run,asset:Asset,target:CanvasNode){
  const existing=nodes.find(n=>(n.type==='asset'||n.type==='result')&&n.data.assetId===asset.id&&(n.type!=='result'||n.data.runId===run.id));if(existing)return existing.id;
  const node:CanvasNode={id:crypto.randomUUID(),type:'result',title:'原视频 · '+[...asset.title].slice(0,50).join(''),x:target.x-460,y:target.y,locked:false,data:{kind:'result',assetId:asset.id,runId:run.id}};
  const occupied=nodes.map(n=>nodeRect(n,{...graph,nodes}));for(let attempt=0;attempt<=occupied.length;attempt++){const rect=nodeRect(node,{...graph,nodes}),collision=occupied.find(r=>rect.left<r.right&&rect.right>r.left&&rect.top<r.bottom&&rect.bottom>r.top);if(!collision)break;node.y=collision.bottom+48;}
  nodes.push(node);op({type:'add_node',payload:{node}});return node.id;
 }
 function link(run:Run,asset:Asset,target:CanvasNode,relation:'tail-frame'|'revision'){
  const sourceId=sourceNode(run,asset,target);op({type:'add_edge',payload:{edge:{id:crypto.randomUUID(),sourceId,targetId:target.id,port:'video',order:0,relation}}});verified.set(run.id,{run,asset});
 }
 const candidates=runs.filter(r=>r.projectId===graph.projectId&&r.executionState==='succeeded'&&assets.some(a=>a.id===r.resultAssetId&&a.sourceRunId===r.id&&a.mediaType==='video'&&a.trashedAt==null));
 const legacyFrames=graph.nodes.filter(n=>n.type==='asset'&&!n.locked&&!n.data.sourceVideo&&assets.some(a=>a.id===n.data.assetId&&a.mediaType==='image'&&a.title==='视频尾帧.png'&&a.trashedAt==null));
 const matches=new Map<string,TailFrame[]>();if(legacyFrames.length)for(const run of candidates){try{const frame=await prepareTailFrame(run.id,db),hash=await hashBlob(frame.file),same=matches.get(hash)??[];same.push(frame);matches.set(hash,same);}catch{unresolved.push('来源视频无法本地核验：'+run.id);}}
 for(const node of legacyFrames){if(node.type!=='asset')continue;const asset=assets.find(a=>a.id===node.data.assetId)!,match=matches.get(asset.sha256);
  const stored=await withDatabase(db,c=>transact(c,['blobs'],'readonly',tx=>requestResult<{blob:Blob}|undefined>(tx.objectStore('blobs').get(asset.blobKey))));
  if(!stored||stored.blob.size!==asset.bytes||await hashBlob(stored.blob)!==asset.sha256){unresolved.push('尾帧缓存缺失或损坏：'+node.title);continue;}
  if(match?.length!==1){unresolved.push('尾帧来源缺失或不唯一：'+node.title);continue;}verifiedFrames.set(asset.id,asset);const frame=match[0];op({type:'update_node',payload:{nodeId:node.id,patch:{data:{...node.data,sourceVideo:{assetId:asset.id,sourceAssetId:frame.sourceAsset.id,sourceRunId:frame.sourceRun.id,timeSeconds:frame.timeSeconds}}}}});link(frame.sourceRun,frame.sourceAsset,node,'tail-frame');}
 for(const node of graph.nodes){
  if(node.type!=='video-generation'||node.locked||!node.data.revisionSource||node.data.lineageRecorded)continue;
  const run=candidates.find(r=>r.id===node.data.revisionSource?.runId&&r.resultAssetId===node.data.revisionSource.assetId),asset=assets.find(a=>a.id===run?.resultAssetId);if(!run||!asset){unresolved.push('修改来源缺失：'+node.title);continue;}
  op({type:'update_node',payload:{nodeId:node.id,patch:{data:{...node.data,lineageRecorded:true}}}});if(!graph.edges.some(e=>e.targetId===node.id&&e.relation==='revision'))link(run,asset,node,'revision');
 }
 // Upgrade the previous direct tail-output representation into a visible frame.
 for(const edge of graph.edges){const source=graph.nodes.find(n=>n.id===edge.sourceId);if(edge.relation||edge.port!=='image'||!source||(source.type!=='asset'&&source.type!=='result')||!source.data.tailFrame)continue;
  const lineage=source.data.tailFrame,run=candidates.find(r=>r.id===lineage.sourceRunId&&r.resultAssetId===lineage.sourceAssetId),asset=assets.find(a=>a.id===lineage.sourceAssetId),image=assets.find(a=>a.id===lineage.assetId&&a.mediaType==='image'&&a.trashedAt==null);if(!run||!asset||!image){unresolved.push('旧尾帧输出无法核验：'+source.title);continue;}
  const target=graph.nodes.find(n=>n.id===edge.targetId);if(!target||target.locked)continue;
  const frame:CanvasNode={id:crypto.randomUUID(),type:'asset',title:'尾帧参考',x:target.x-460,y:target.y-340,locked:false,data:{kind:'asset',assetId:image.id,sourceVideo:lineage}};nodes.push(frame);op({type:'add_node',payload:{node:frame}});link(run,asset,frame,'tail-frame');op({type:'remove_edge',payload:{edgeId:edge.id}});op({type:'add_edge',payload:{edge:{...edge,id:crypto.randomUUID(),sourceId:frame.id}}});
 }
 for(const node of nodes){if(node.type!=='asset'&&node.type!=='result')continue;const run=candidates.find(r=>r.resultAssetId===node.data.assetId);if(!run)continue;const links=resultSourceLink({...graph,nodes},node,run);if(links.length){operations.push(...links);verified.set(run.id,{run,asset:assets.find(a=>a.id===run.resultAssetId)!});}}
 return {operations,unresolved,beforeCreativeCommit:async(tx:IDBTransaction)=>{for(const {run,asset}of verified.values()){
  const currentRun=runSchema.parse(await requestResult(tx.objectStore('runs').get(run.id))),currentAsset=assetSchema.parse(await requestResult(tx.objectStore('assets').get(asset.id)));
  if(JSON.stringify(currentRun)!==JSON.stringify(run)||JSON.stringify(currentAsset)!==JSON.stringify(asset))throw Error('lineage_source_changed');
 }for(const asset of verifiedFrames.values()){const current=assetSchema.parse(await requestResult(tx.objectStore('assets').get(asset.id))),blob=await requestResult<{blob:Blob}|undefined>(tx.objectStore('blobs').get(asset.blobKey));if(JSON.stringify(current)!==JSON.stringify(asset)||!blob||blob.blob.size!==asset.bytes)throw Error('lineage_frame_changed');}}};
}
