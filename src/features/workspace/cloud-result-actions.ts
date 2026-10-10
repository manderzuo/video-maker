import type {Asset} from '../../domain/asset.js';
import type {VideoSpec} from '../../domain/common.js';
import type {CanvasNode,Graph} from '../../domain/graph.js';
import {nodeSchema} from '../../domain/graph.js';
import type {GraphOperation} from '../../application/commands/registry.js';
import type {CloudVideoRecord} from '../../domain/cloud-video-run.js';
import {videoRunSnapshotSchema} from '../../domain/video-request.js';
import {nodeRect} from '../canvas/geometry.js';
// Cloud result actions keep the pure command building separate from the local
// read/write helpers of the legacy review feature: every batch is produced from
// an already authenticated CloudVideoRecord plus the owned assets, and the
// project revision is supplied by the caller that performs the cloud command.
export type VideoRecord=Extract<CloudVideoRecord,{kind:'video'}>;
export type Position={x:number;y:number};
export type Availability={ok:true}|{ok:false;reason:string};
const operation=(type:GraphOperation['type'],payload:Record<string,unknown>):GraphOperation=>({id:crypto.randomUUID(),type,payload});
export function frozenSnapshot(record:VideoRecord){return videoRunSnapshotSchema.parse(record.inputSnapshot);}
export function frozenSpec(record:VideoRecord):VideoSpec{return record.executionSpec??record.requestedSpec??frozenSnapshot(record).spec;}
export function nextColumnX(graph:Graph){return Math.max(0,...graph.nodes.map(node=>nodeRect(node,graph).right))+64;}
export function placedNode(graph:Graph,assetId:string,runId:string){return graph.nodes.find((node):node is Extract<CanvasNode,{type:'asset'|'result'}>=>(node.type==='asset'||node.type==='result')&&node.data.assetId===assetId&&!node.locked&&(node.type!=='result'||node.data.runId===runId));}
export function resultNodesFor(graph:Graph,assetId:string){return graph.nodes.filter(node=>node.type==='result'&&node.data.assetId===assetId).map(node=>node.id);}
export function affectedResultNodes(graph:Graph,nodeId:string){const ids=new Set<string>(),queue=[nodeId];while(queue.length){const current=queue.shift()!;for(const edge of graph.edges.filter(edge=>edge.sourceId===current))if(!ids.has(edge.targetId)){ids.add(edge.targetId);queue.push(edge.targetId);}}return [...ids];}
// A result asset only supports lineage while the server still binds it to the
// succeeded run that produced it; otherwise the request would be rejected later.
export function lineageAvailability(record:VideoRecord,asset:Asset):Availability{
 if(asset.mediaType!=='video')return {ok:false,reason:'该结果不是视频素材，不能建立视频来源关系。'};
 if(asset.trashedAt!=null)return {ok:false,reason:'结果素材已在回收站；请先恢复素材，不会自动替换其他文件。'};
 if(asset.sourceRunId!==record.id)return {ok:false,reason:'结果素材与原任务绑定不一致；请重新读取任务后再选择。'};
 return {ok:true};
}
// Same pure rule as the reviewed review/result-source-link helper, expressed for
// a cloud record: only the frozen producing draft identifies the result, never
// layout or chronology.
export function resultLink(graph:Graph,node:CanvasNode,record:VideoRecord):GraphOperation[]{
 if((node.type!=='asset'&&node.type!=='result')||node.locked||node.data.generationLinked||node.data.assetId!==record.resultAssetId||!graph.nodes.some(candidate=>candidate.id===record.nodeId&&candidate.type==='video-generation'))return [];
 const operations:GraphOperation[]=[operation('update_node',{nodeId:node.id,patch:{data:{...node.data,generationLinked:true}}})];
 if(!graph.edges.some(edge=>edge.targetId===node.id&&edge.relation==='result'))operations.push(operation('add_edge',{edge:{id:crypto.randomUUID(),sourceId:record.nodeId,targetId:node.id,port:'video',order:0,relation:'result'}}));
 return operations;
}
function sourceNode(graph:Graph,record:VideoRecord,asset:Asset,position?:Position){
 const existing=placedNode(graph,asset.id,record.id);
 if(existing)return {operations:resultLink(graph,existing,record),nodeId:existing.id};
 const id=crypto.randomUUID(),node=nodeSchema.parse({id,type:'result',title:'原视频 · '+[...asset.title].slice(0,50).join(''),x:position?.x??nextColumnX(graph),y:position?.y??0,locked:false,data:{kind:'result',assetId:asset.id,runId:record.id}});
 return {operations:[operation('add_node',{node}),...resultLink(graph,node,record)],nodeId:id};
}
export function resultPlacement(graph:Graph,record:VideoRecord,asset:Asset,position?:Position):{operations:GraphOperation[];placement?:{nodeId:string;created:boolean};reason?:string}{
 const availability=lineageAvailability(record,asset);
 if(!availability.ok)return {operations:[],reason:availability.reason};
 const existing=placedNode(graph,asset.id,record.id);
 if(existing)return {operations:resultLink(graph,existing,record),placement:{nodeId:existing.id,created:false}};
 const id=crypto.randomUUID(),source=graph.nodes.find(node=>node.id===record.nodeId&&node.type==='video-generation');
 const node=nodeSchema.parse({id,type:'result',title:asset.title,size:{width:420,height:640},x:position?.x??nextColumnX(graph),y:position?.y??0,locked:false,data:{kind:'result',assetId:asset.id,runId:record.id,generationLinked:true}});
 const operations:GraphOperation[]=[operation('add_node',{node})];
 if(source)operations.push(operation('add_edge',{edge:{id:crypto.randomUUID(),sourceId:source.id,targetId:id,port:'video',order:0,relation:'result'}}));
 return {operations,placement:{nodeId:id,created:true}};
}
export function removePlacement(graph:Graph,nodeId:string):GraphOperation[]{
 const node=graph.nodes.find(candidate=>candidate.id===nodeId);
 if(!node)return [];
 return [...graph.edges.filter(edge=>edge.sourceId===nodeId||edge.targetId===nodeId).map(edge=>operation('remove_edge',{edgeId:edge.id})),operation('remove_node',{nodeId})];
}
// Undoing a selection that reused an existing node only removes the recorded
// lineage; the node and its file stay in the project.
export function unlinkResult(graph:Graph,nodeId:string):GraphOperation[]{
 const node=graph.nodes.find(candidate=>candidate.id===nodeId);
 if(!node)return [];
 const operations:GraphOperation[]=graph.edges.filter(edge=>edge.targetId===nodeId&&edge.relation==='result').map(edge=>operation('remove_edge',{edgeId:edge.id}));
 if((node.type==='asset'||node.type==='result')&&node.data.generationLinked)operations.push(operation('update_node',{nodeId,patch:{data:{...node.data,generationLinked:false}}}));
 return operations;
}
// Copies the frozen input of a finished run into a new text node, a new video
// draft that records its revision source, and the still readable references.
export function revisionCopy(graph:Graph,record:VideoRecord,asset:Asset,prompt:string,assets:Map<string,Asset>,position?:Position):{operations:GraphOperation[];videoNodeId:string;textNodeId:string;skipped:string[]}{
 const snapshot=frozenSnapshot(record),source=sourceNode(graph,record,asset,position),x=position?.x??nextColumnX(graph),y=position?.y??0;
 const textId=crypto.randomUUID(),videoId=crypto.randomUUID();
 const text=nodeSchema.parse({id:textId,type:'text',title:'修改提示词',x:x-460,y:y+340,locked:false,data:{kind:'text',text:prompt,referenceTokens:[]}});
 const draft=nodeSchema.parse({id:videoId,type:'video-generation',title:'修改后重新生成',x,y,locked:false,data:{kind:'video-generation',draft:structuredClone(frozenSpec(record)),inputBindings:[],stale:true,revisionSource:{assetId:asset.id,runId:record.id,projectId:graph.projectId}}});
 const operations:GraphOperation[]=[...source.operations,operation('add_node',{node:text}),operation('add_node',{node:draft}),operation('add_edge',{edge:{id:crypto.randomUUID(),sourceId:textId,targetId:videoId,port:'text',order:0}}),operation('add_edge',{edge:{id:crypto.randomUUID(),sourceId:source.nodeId,targetId:videoId,port:'video',order:0,relation:'revision'}})];
 const skipped:string[]=[],linked=new Set<string>();let order=1;
 for(const reference of snapshot.references){
  const media=assets.get(reference.assetId);
  if(!media||media.trashedAt!=null){skipped.push(reference.alias);continue;}
  const port=reference.mediaType==='image'?'image':'video';
  if(media.mediaType!==port){skipped.push(reference.alias);continue;}
  const key=reference.assetId+':'+port;
  if(linked.has(key))continue;
  linked.add(key);
  const existing=graph.nodes.find(node=>node.type==='asset'&&node.data.assetId===reference.assetId&&!node.locked);
  const nodeId=existing?.id??crypto.randomUUID();
  if(!existing){const node=nodeSchema.parse({id:nodeId,type:'asset',title:media.title,x:x-460,y:y+560+order*240,locked:false,data:{kind:'asset',assetId:media.id}});operations.push(operation('add_node',{node}));}
  operations.push(operation('add_edge',{edge:{id:crypto.randomUUID(),sourceId:nodeId,targetId:videoId,port,order:order++}}));
 }
 return {operations,videoNodeId:videoId,textNodeId:textId,skipped};
}
// Tail-frame continuation mirrors the reviewed legacy batch: the original video,
// the uploaded frame, the continuation text and the new draft are saved as one
// cloud command with explicit tail-frame and input relations.
export function tailFrameBatch(graph:Graph,record:VideoRecord,video:Asset,frame:Asset,prompt:string,timeSeconds:number,position?:Position):{operations:GraphOperation[];videoNodeId?:string;reason?:string}{
 const availability=lineageAvailability(record,video);
 if(!availability.ok)return {operations:[],reason:availability.reason};
 if(frame.mediaType!=='image')return {operations:[],reason:'抽取的尾帧不是图片素材，不能作为视频输入。'};
 const source=sourceNode(graph,record,video,position),x=position?.x??nextColumnX(graph),y=position?.y??0;
 const frameId=crypto.randomUUID(),textId=crypto.randomUUID(),videoId=crypto.randomUUID();
 const tailFrame={assetId:frame.id,sourceAssetId:video.id,sourceRunId:video.sourceRunId??record.id,timeSeconds};
 const frameNode=nodeSchema.parse({id:frameId,type:'asset',title:'尾帧参考',x:x+460,y,locked:false,data:{kind:'asset',assetId:frame.id,sourceVideo:tailFrame}});
 const textNode=nodeSchema.parse({id:textId,type:'text',title:'续写提示词',x:x+460,y:y+340,locked:false,data:{kind:'text',text:prompt,referenceTokens:[]}});
 const draftNode=nodeSchema.parse({id:videoId,type:'video-generation',title:'尾帧续写视频',x:x+920,y,locked:false,data:{kind:'video-generation',draft:structuredClone(frozenSpec(record)),inputBindings:[],stale:true}});
 const operations:GraphOperation[]=[...source.operations,operation('add_node',{node:frameNode}),operation('add_node',{node:textNode}),operation('add_node',{node:draftNode}),
  operation('add_edge',{edge:{id:crypto.randomUUID(),sourceId:source.nodeId,targetId:frameId,port:'video',order:0,relation:'tail-frame'}}),
  operation('add_edge',{edge:{id:crypto.randomUUID(),sourceId:frameId,targetId:videoId,port:'image',order:0}}),
  operation('add_edge',{edge:{id:crypto.randomUUID(),sourceId:textId,targetId:videoId,port:'text',order:1}})];
 return {operations,videoNodeId:videoId};
}
// Browser-side frame extraction: the bytes stay in the current account because
// the caller uploads the returned file through uploadCloudAsset before use.
export async function extractFrameFile(url:string,timeSeconds?:number):Promise<{file:File;timeSeconds:number}>{
 const video=document.createElement('video');
 video.muted=true;video.preload='metadata';video.src=url;
 let fail:(error:Error)=>void=()=>{};
 const timer=setTimeout(()=>fail(new Error('frame_video_unreadable')),15000);
 try{
 await new Promise<void>((resolve,reject)=>{fail=reject;video.onloadedmetadata=()=>resolve();video.onerror=()=>reject(new Error('frame_video_unreadable'));});
 if(!Number.isFinite(video.duration)||video.duration<=0)throw new Error('frame_video_unreadable');
 const last=Math.max(0,video.duration-0.000001),at=Math.min(Math.max(timeSeconds??last,0),last);
 await new Promise<void>((resolve,reject)=>{fail=reject;video.onerror=()=>reject(new Error('frame_seek_failed'));video.onseeked=()=>resolve();if(at===0){if(video.readyState>=2)resolve();else video.onloadeddata=()=>resolve();}else video.currentTime=at;});
 const canvas=document.createElement('canvas');
 canvas.width=video.videoWidth||1280;canvas.height=video.videoHeight||720;
 const context=canvas.getContext('2d');
 if(!context)throw new Error('frame_canvas_unavailable');
 context.drawImage(video,0,0,canvas.width,canvas.height);
 const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(value=>resolve(value),'image/png'));
 if(!blob)throw new Error('frame_encode_failed');
 return {file:new File([blob],'tail-frame-'+Math.round(at*1000)+'ms.png',{type:'image/png'}),timeSeconds:at};
 }finally{clearTimeout(timer);video.pause();video.removeAttribute('src');video.load();}
}
