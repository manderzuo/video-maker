import {describe,it,expect} from 'vitest';
import {graphSchema} from '../../src/domain/graph';
import {validateConnection,getOrderedInputs} from '../../src/domain/graph-validation';
import {preflightRun} from '../../src/application/runs/preflight';
import {f} from '../helpers/fixtures';
function setup(){
 const graph=graphSchema.parse(f.graph({nodes:[
  {id:'a',type:'result',title:'视频A',x:0,y:0,locked:false,data:{kind:'result',assetId:'clip',runId:'r1',tailFrame:{assetId:'frame',sourceAssetId:'clip',sourceRunId:'r1',timeSeconds:4.99}}},
  {id:'t',type:'text',title:'下一段',x:0,y:300,locked:false,data:{kind:'text',text:'继续向前行走',referenceTokens:[]}},
  {id:'b',type:'video-generation',title:'视频B',x:500,y:0,locked:false,data:{kind:'video-generation',draft:{modelId:'fake-video-only',durationSeconds:5,ratio:'16:9'},inputBindings:[],stale:true}}
 ],edges:[{id:'tail',sourceId:'a',targetId:'b',port:'image',order:0},{id:'text',sourceId:'t',targetId:'b',port:'text',order:1}]}));
 const assets=[f.asset({id:'clip',mediaType:'video',mimeType:'video/mp4',bytes:1000,sourceRunId:'r1'}),f.asset({id:'frame',mediaType:'image',mimeType:'image/png',bytes:50})];
 const capability=f.caps({videoSpecs:[{modelId:'fake-video-only',durationSeconds:5,ratio:'16:9'}],limits:{assetBytes:10000,promptBytes:65536,imageReferences:1,videoReferences:0}});
 return {graph,assets,capability};
}
describe('tail-frame connection from original video',()=>{
 it('links Video A but sends only the extracted image, and disconnect removes its input',()=>{
  const {graph,assets,capability}=setup();expect(validateConnection(graph,graph.edges[0],capability,{assets}).ok).toBe(true);
  expect(getOrderedInputs(graph,'b')[0]).toMatchObject({nodeId:'a',assetId:'frame',runId:'r1',role:'image'});
  const result=preflightRun({graph,nodeIds:['b'],assets,readableAssetIds:['clip','frame'],capability,connection:f.connection(),binding:{id:'binding-a',connectionId:'c1',originSnapshot:'https://core.invalid',kind:'core-user',createdAt:1},canWrite:true,credentialAvailable:true});
  expect(result.status).toBe('ready');if(result.status!=='ready')throw Error(JSON.stringify(result));
  expect(result.plan.nodes[0].inputSnapshot.references).toEqual([expect.objectContaining({assetId:'frame',mediaType:'image',nodeId:'a',runId:'r1'})]);
  expect(result.plan.nodes[0].assets.map(a=>a.assetId)).toEqual(['frame']);
  graph.edges=graph.edges.filter(e=>e.id!=='tail');expect(getOrderedInputs(graph,'b').some(i=>i.assetId==='frame')).toBe(false);
 });
 it('rejects a stale tail source after changing the video identity',()=>{
  const {graph,assets,capability}=setup();const node=graph.nodes[0];if(node.type!=='result')throw Error('fixture');node.data.assetId='another';
  assets.push(f.asset({id:'another',mediaType:'video',mimeType:'video/mp4',bytes:1000,sourceRunId:'r2'}));
  expect(validateConnection(graph,graph.edges[0],capability,{assets}).ok).toBe(false);
 });
});
