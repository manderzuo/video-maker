import {resultSourceLink} from './result-source-link';
import type {Run} from '../../domain/run';
import {runSchema} from '../../domain/run';
import {assetSchema,type Asset} from '../../domain/asset';
import {projectSchema} from '../../domain/project';
import {boundedText} from '../../domain/common';
import {withDatabase,transact,requestResult,type StudioDb} from '../../infrastructure/storage/database';
import {releaseProjectLease,type ProjectLeaseToken} from '../../infrastructure/storage/project-lease';
import {getProjectWriter} from '../projects/project-service';
import {prepareCanvasFiles} from '../assets/canvas-import';
import {hashBlob} from '../assets/hash-worker';
import {applyUiCommand} from '../../application/commands/apply-command';
import type {GraphOperation} from '../../application/commands/registry';
import {readGraph} from '../../infrastructure/storage/project-repository';
import {nodeRect} from '../canvas/geometry';
import {nodeSchema} from '../../domain/graph';
import {videoRunSnapshotSchema} from '../../application/runs/prepare-request';

export type TailFrame={file:File;timeSeconds:number;sourceRun:Run;sourceAsset:Asset};
async function readSource(runId:string,db?:StudioDb){return withDatabase(db,c=>transact(c,['runs','assets','blobs'],'readonly',async tx=>{
 const run=runSchema.parse(await requestResult(tx.objectStore('runs').get(runId))),asset=assetSchema.parse(await requestResult(tx.objectStore('assets').get(run.resultAssetId??''))),stored=await requestResult<{blob:Blob}|undefined>(tx.objectStore('blobs').get(asset.blobKey));
 if(run.executionState!=='succeeded'||run.resultAssetId!==asset.id||asset.sourceRunId!==run.id||asset.mediaType!=='video'||asset.trashedAt!=null||!stored||stored.blob.size!==asset.bytes)throw Error('result_binding_or_cache_missing');return {run,asset,blob:stored.blob};
}));}
export async function prepareTailFrame(runId:string,db?:StudioDb):Promise<TailFrame>{
 const source=await readSource(runId,db);if(await hashBlob(source.blob)!==source.asset.sha256)throw Error('media_cached_integrity_failed');
 const url=URL.createObjectURL(source.blob),video=document.createElement('video');video.preload='auto';video.muted=true;
 try{
  const timeSeconds=await new Promise<number>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('tail_frame_decode_timeout')),15000),fail=()=>{clearTimeout(timer);reject(Error('tail_frame_decode_failed'));};video.onerror=fail;
   video.onloadeddata=()=>{if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth||!video.videoHeight||video.videoWidth*video.videoHeight>32*1024*1024){fail();return;}const at=Math.max(0,video.duration-.001);video.onseeked=()=>{clearTimeout(timer);resolve(at);};if(at===0){clearTimeout(timer);resolve(0);}else video.currentTime=at;};video.src=url;
  });
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');if(!ctx||video.readyState<2)throw Error('tail_frame_decode_failed');ctx.drawImage(video,0,0);
  const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('tail_frame_encode_failed')),'image/png'));
  return {file:new File([png],'视频尾帧.png',{type:'image/png'}),timeSeconds,sourceRun:source.run,sourceAsset:source.asset};
 }finally{video.onloadeddata=null;video.onseeked=null;video.onerror=null;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}
export async function createTailFrameDraft(input:{projectId:string;baseRevision:number;frame:TailFrame;prompt:string;commandId:string},options:{db?:StudioDb;lease?:ProjectLeaseToken}={}){
 const prompt=boundedText(1,65536).parse(input.prompt.trim());if(new TextEncoder().encode(prompt).byteLength>65536)throw Error('prompt_bytes_exceeded');
 if(input.frame.sourceRun.projectId!==input.projectId)throw Error('result_project_mismatch');
 return withDatabase(options.db,async db=>{
  const source=await readSource(input.frame.sourceRun.id,db);if(JSON.stringify(source.run)!==JSON.stringify(input.frame.sourceRun)||JSON.stringify(source.asset)!==JSON.stringify(input.frame.sourceAsset)||await hashBlob(source.blob)!==source.asset.sha256)throw Error('result_source_changed');
  const graph=await readGraph(input.projectId,db);if(!graph)throw Error('graph_missing');const x=Math.max(0,...graph.nodes.map(n=>nodeRect(n,graph).right))+64;
  const prepared=await prepareCanvasFiles([input.frame.file],{x,y:0},db),assetOp=prepared.operations[0];if(assetOp.type!=='add_node')throw Error('tail_frame_node_missing');const imageNode=nodeSchema.parse(assetOp.payload.node);if(imageNode.type!=='asset')throw Error('tail_frame_node_missing');
  const tailFrame={assetId:imageNode.data.assetId,sourceAssetId:source.asset.id,sourceRunId:source.run.id,timeSeconds:input.frame.timeSeconds};
  const existing=graph.nodes.find(n=>(n.type==='asset'||n.type==='result')&&n.data.assetId===source.asset.id&&!n.locked&&(n.type!=='result'||n.data.runId===source.run.id)),sourceId=existing?.id??crypto.randomUUID(),videoId=crypto.randomUUID(),textId=crypto.randomUUID();
  const sourceOps:GraphOperation[]=existing?[]:[{id:crypto.randomUUID(),type:'add_node',payload:{node:{id:sourceId,type:'result',title:'原视频 · '+[...source.asset.title].slice(0,50).join(''),x,y:0,locked:false,data:{kind:'result',assetId:source.asset.id,runId:source.run.id}}}}];
  const draft=structuredClone(source.run.executionSpec??source.run.requestedSpec??videoRunSnapshotSchema.parse(source.run.inputSnapshot).spec);
  const operations:GraphOperation[]=[...sourceOps,
   {id:crypto.randomUUID(),type:'add_node',payload:{node:{...imageNode,title:'尾帧参考',x:x+460,y:0,data:{...imageNode.data,sourceVideo:tailFrame}}}},
   {id:crypto.randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'续写提示词',x:x+460,y:340,locked:false,data:{kind:'text',text:prompt,referenceTokens:[]}}}},
   {id:crypto.randomUUID(),type:'add_node',payload:{node:{id:videoId,type:'video-generation',title:'尾帧续写视频',x:x+920,y:0,locked:false,data:{kind:'video-generation',draft,inputBindings:[],stale:true}}}},
   {id:crypto.randomUUID(),type:'add_edge',payload:{edge:{id:crypto.randomUUID(),sourceId,targetId:imageNode.id,port:'video',order:0,relation:'tail-frame'}}},
   {id:crypto.randomUUID(),type:'add_edge',payload:{edge:{id:crypto.randomUUID(),sourceId:imageNode.id,targetId:videoId,port:'image',order:0}}},
   {id:crypto.randomUUID(),type:'add_edge',payload:{edge:{id:crypto.randomUUID(),sourceId:textId,targetId:videoId,port:'text',order:1}}}];
  const sourceNode=existing??sourceOps.flatMap(op=>op.type==='add_node'?[nodeSchema.parse(op.payload.node)]:[])[0];
  if(sourceNode)operations.push(...resultSourceLink(graph,sourceNode,source.run));
  const lease=options.lease??await getProjectWriter(input.projectId,db);
  try{const receipt=await applyUiCommand({id:input.commandId,projectId:input.projectId,baseRevision:input.baseRevision,operations},{db,lease,beforeCreativeCommit:async tx=>{
   const project=projectSchema.parse(await requestResult(tx.objectStore('projects').get(input.projectId))),run=runSchema.parse(await requestResult(tx.objectStore('runs').get(source.run.id))),asset=assetSchema.parse(await requestResult(tx.objectStore('assets').get(source.asset.id))),blob=await requestResult<{blob:Blob}|undefined>(tx.objectStore('blobs').get(asset.blobKey));
   if(project.archived||JSON.stringify(run)!==JSON.stringify(source.run)||JSON.stringify(asset)!==JSON.stringify(source.asset)||!blob||blob.blob.size!==source.blob.size)throw Error('result_source_changed');
   await prepared.beforeCreativeCommit(tx);
  }});return {receipt,videoId};}finally{if(!options.lease)await releaseProjectLease(lease,db);}
 });
}
