import {describe,expect,it} from 'vitest';
import {executeGraphOperations} from '../../src/application/commands/registry';
import {assetSchema,type Asset} from '../../src/domain/asset';
import type {CloudVideoRecord} from '../../src/domain/cloud-video-run';
import {unverifiedCapabilities} from '../../src/domain/connection';
import {graphSchema,type Graph} from '../../src/domain/graph';
import {validateConnection} from '../../src/domain/graph-validation';
import {
 affectedResultNodes,
 frozenSpec,
 lineageAvailability,
 nextColumnX,
 removePlacement,
 resultLink,
 resultNodesFor,
 resultPlacement,
 revisionCopy,
 tailFrameBatch,
 unlinkResult
} from '../../src/features/workspace/cloud-result-actions';
const sha=(seed:string)=>seed.repeat(64).slice(0,64).replace(/[^a-f0-9]/g,'0');
function asset(id:string,mediaType:Asset['mediaType'],sourceRunId?:string):Asset{
 return assetSchema.parse({id,sha256:sha('a'),mediaType,mimeType:mediaType==='video'?'video/mp4':mediaType==='image'?'image/png':'audio/mpeg',bytes:2048,blobKey:'sha256:'+sha(id),title:id,...(sourceRunId?{sourceRunId}:{}),createdAt:1});
}
function record(overrides:Record<string,unknown>={}):CloudVideoRecord{
 // Only the fields the pure builders read are populated; the cloud client always
 // receives the complete record from the server.
 return {id:'run-1',kind:'video',projectId:'p1',nodeId:'draft-1',executionState:'succeeded',resultAssetId:'video-1',requestedSpec:{modelId:'seedance',durationSeconds:5,ratio:'16:9'},executionSpec:{modelId:'seedance',durationSeconds:8,ratio:'9:16',resolution:'720p'},inputSnapshot:{prompt:'雨后的街道',spec:{modelId:'seedance',durationSeconds:5,ratio:'16:9'},references:[{assetId:'image-1',mediaType:'image',role:'参考',alias:'@参考一'},{assetId:'missing-1',mediaType:'video',role:'参考',alias:'@已删除'}]},...overrides} as unknown as CloudVideoRecord;
}
const draftNode={id:'draft-1',type:'video-generation',title:'原草稿',x:0,y:0,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9'},inputBindings:[],stale:false}} as const;
const emptyGraph=():Graph=>graphSchema.parse({projectId:'p1',revision:1,nodes:[draftNode],edges:[],viewport:{x:0,y:0,scale:1}});
const apply=(graph:Graph,operations:Parameters<typeof executeGraphOperations>[1])=>graphSchema.parse(executeGraphOperations(graph,operations));
const valid=(graph:Graph,assets:Asset[],runs:CloudVideoRecord[])=>graph.edges.map(edge=>validateConnection(graph,edge,unverifiedCapabilities(),{assets,runs}));
describe('cloud result actions',()=>{
 it('places a result node with its succeeded run and reuses it instead of duplicating',()=>{
  const graph=emptyGraph(),video=asset('video-1','video','run-1'),run=record();
  const placed=resultPlacement(graph,run,video);
  expect(placed.reason).toBeUndefined();expect(placed.placement?.created).toBe(true);
  const next=apply(graph,placed.operations),node=next.nodes.find(candidate=>candidate.id===placed.placement!.nodeId);
  expect(node).toMatchObject({type:'result',data:{kind:'result',assetId:'video-1',runId:'run-1'}});
  expect(next.edges).toHaveLength(1);expect(next.edges[0]).toMatchObject({sourceId:'draft-1',targetId:node!.id,port:'video',relation:'result'});
  expect(valid(next,[video],[run])).toEqual([{ok:true,value:next.edges[0]}]);
  expect(resultNodesFor(next,'video-1')).toEqual([node!.id]);
  const again=resultPlacement(next,run,video);
  expect(again.placement).toMatchObject({nodeId:node!.id,created:false});
  expect(apply(next,again.operations).nodes).toHaveLength(next.nodes.length);
  const linked=apply(next,resultLink(next,node!,run));
  expect(linked.edges).toHaveLength(1);
  const unlinked=apply(linked,unlinkResult(linked,node!.id));
  expect(unlinked.edges).toHaveLength(0);expect(unlinked.nodes.find(candidate=>candidate.id===node!.id)).toMatchObject({data:{generationLinked:false}});
  expect(removePlacement(next,node!.id)).toHaveLength(2);
  expect(apply(next,removePlacement(next,node!.id)).nodes).toHaveLength(1);
  expect(affectedResultNodes(next,'draft-1')).toEqual([node!.id]);
  expect(node?.size).toEqual({width:420,height:640});
  expect(nextColumnX(next)).toBe(908);
 });
 it('refuses a result whose asset is not bound to the succeeded run',()=>{
  const video=asset('video-1','video','other-run');
  expect(lineageAvailability(record(),video)).toEqual({ok:false,reason:'结果素材与原任务绑定不一致；请重新读取任务后再选择。'});
  expect(resultPlacement(emptyGraph(),record(),video)).toEqual({operations:[],reason:'结果素材与原任务绑定不一致；请重新读取任务后再选择。'});
  const trashed=assetSchema.parse({...video,sourceRunId:'run-1',trashedAt:2});
  expect(resultPlacement(emptyGraph(),record(),trashed).reason).toContain('回收站');
 });
 it('copies the frozen input into a revision draft and reports unreadable references',()=>{
  const graph=emptyGraph(),video=asset('video-1','video','run-1'),image=asset('image-1','image'),run=record();
  expect(frozenSpec(run)).toMatchObject({durationSeconds:8,ratio:'9:16'});
  const copy=revisionCopy(graph,run,video,'改过的正文',new Map([['image-1',image]]));
  expect(copy.skipped).toEqual(['@已删除']);
  const next=apply(graph,copy.operations),created=next.nodes.find(candidate=>candidate.id===copy.videoNodeId);
  const sourceNode=next.nodes.find(candidate=>candidate.type==='result'&&candidate.data.assetId==='video-1');
  expect(created).toMatchObject({type:'video-generation',data:{draft:{modelId:'seedance',durationSeconds:8,ratio:'9:16',resolution:'720p'},revisionSource:{assetId:'video-1',runId:'run-1',projectId:'p1'}}});
  expect(next.nodes.find(candidate=>candidate.id===copy.textNodeId)).toMatchObject({type:'text',data:{kind:'text',text:'改过的正文'}});
  const referenceNode=next.nodes.find(candidate=>candidate.type==='asset'&&candidate.data.assetId==='image-1');
  expect(referenceNode).toMatchObject({type:'asset',data:{kind:'asset',assetId:'image-1'}});
  expect(next.edges.map(edge=>[edge.sourceId,edge.port,edge.order,edge.relation??null])).toEqual(expect.arrayContaining([['draft-1','video',0,'result'],[sourceNode!.id,'video',0,'revision'],[copy.textNodeId,'text',0,null],[referenceNode!.id,'image',1,null]]));
  expect(next.edges.filter(edge=>edge.targetId===copy.videoNodeId)).toHaveLength(3);
  expect(next.edges.some(edge=>edge.sourceId==='missing-1')).toBe(false);
  expect(valid(next,[video,image],[run]).every(result=>result.ok)).toBe(true);
 });
 it('builds the tail-frame continuation batch that the domain lineage rules accept',()=>{
  const graph=emptyGraph(),video=asset('video-1','video','run-1'),frame=asset('frame-1','image'),run=record();
  const batch=tailFrameBatch(graph,run,video,frame,'继续向前推进',1.5);
  expect(batch.reason).toBeUndefined();expect(batch.videoNodeId).toBeTruthy();
  const next=apply(graph,batch.operations),created=next.nodes.find(candidate=>candidate.id===batch.videoNodeId);
  const frameNode=next.nodes.find(candidate=>candidate.title==='尾帧参考');
  expect(frameNode).toMatchObject({type:'asset',data:{kind:'asset',assetId:'frame-1',sourceVideo:{assetId:'frame-1',sourceAssetId:'video-1',sourceRunId:'run-1'}}});
  expect(created).toMatchObject({type:'video-generation',data:{draft:{durationSeconds:8}}});
  expect(next.edges.map(edge=>[edge.port,edge.order,edge.relation??null])).toEqual(expect.arrayContaining([['video',0,'tail-frame'],['image',0,null],['text',1,null]]));
  expect(valid(next,[video,frame],[run]).every(result=>result.ok)).toBe(true);
  expect(tailFrameBatch(graph,record(),video,asset('frame-2','video'),'x',1)).toEqual({operations:[],reason:'抽取的尾帧不是图片素材，不能作为视频输入。'});
 });
 it('rejects a tail-frame batch when the source video lost its run binding',()=>{
  const result=tailFrameBatch(emptyGraph(),record(),asset('video-1','video'),asset('frame-1','image'),'x',1);
  expect(result.videoNodeId).toBeUndefined();expect(result.reason).toContain('绑定不一致');
 });
 it('reuses an existing asset node and unlinks only the new association',()=>{
  const base=graphSchema.parse({projectId:'p1',revision:1,nodes:[draftNode,{id:'old-asset',type:'asset',title:'Existing video',x:100,y:900,locked:false,data:{kind:'asset',assetId:'video-1'}}],edges:[],viewport:{x:0,y:0,scale:1}});
  const video=asset('video-1','video','run-1'),run=record();
  const reused=resultPlacement(base,run,video);
  expect(reused.placement).toMatchObject({nodeId:'old-asset',created:false});
  const linked=apply(base,reused.operations);
  expect(linked.edges.filter(edge=>edge.targetId==='old-asset'&&edge.relation==='result')).toHaveLength(1);
  expect(linked.nodes.find(candidate=>candidate.id==='old-asset')).toMatchObject({type:'asset',title:'Existing video',data:{generationLinked:true}});
  const unlinked=apply(linked,unlinkResult(linked,'old-asset'));
  expect(unlinked.edges.filter(edge=>edge.relation==='result')).toHaveLength(0);
  expect(unlinked.nodes.find(candidate=>candidate.id==='old-asset')).toMatchObject({type:'asset',title:'Existing video',data:{generationLinked:false}});
  expect(valid(unlinked,[video],[run]).every(result=>result.ok)).toBe(true);
  expect(unlinkResult(unlinked,'old-asset')).toEqual([]);
 });
});
