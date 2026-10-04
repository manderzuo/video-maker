import {it,expect} from 'vitest';
import {graphSchema} from '../../src/domain/graph';
import {getOrderedInputs,validateConnection} from '../../src/domain/graph-validation';
import {preflightRun} from '../../src/application/runs/preflight';
import {f} from '../helpers/fixtures';
import {planGraphRuns} from '../../src/application/runs/graph-plan';
import {copyNodes,pasteNodes} from '../../src/features/canvas/branch-command';
import {executeGraphOperations} from '../../src/application/commands/registry';
it('source relationship is visible graph data but never uploads the original video as a revision input',()=>{
 const graph=graphSchema.safeParse(f.graph({nodes:[
 {id:'a',type:'result',title:'视频A',x:0,y:0,locked:false,data:{kind:'result',assetId:'clip',runId:'r1'}},
 {id:'t',type:'text',title:'修改提示词',x:0,y:300,locked:false,data:{kind:'text',text:'向前走',referenceTokens:[]}},
 {id:'b',type:'video-generation',title:'修改版本',x:500,y:0,locked:false,data:{kind:'video-generation',draft:{modelId:'fake-video-only',durationSeconds:5,ratio:'16:9'},inputBindings:[],stale:true,revisionSource:{projectId:'p1',runId:'r1',assetId:'clip'}}}
 ],edges:[{id:'origin',sourceId:'a',targetId:'b',port:'video',order:0,relation:'revision'},{id:'text',sourceId:'t',targetId:'b',port:'text',order:0}]}));
 expect(graph.success).toBe(true);if(!graph.success)throw Error('schema');
 const assets=[f.asset({id:'clip',sourceRunId:'r1',mediaType:'video',mimeType:'video/mp4'})],capability=f.caps({videoSpecs:[{modelId:'fake-video-only',durationSeconds:5,ratio:'16:9'}],limits:{assetBytes:10000,promptBytes:65536,imageReferences:1,videoReferences:0}});
 expect(validateConnection(graph.data,graph.data.edges[0],capability,{assets,limits:{video:0}}).ok).toBe(true);
 expect(getOrderedInputs(graph.data,'b')).toEqual([{nodeId:'t',order:0,role:'text'}]);
 const planned=planGraphRuns(graph.data,['b']);expect(planned.ok).toBe(true);
 if(planned.ok){expect(planned.value[0].inputNodeIds).toEqual(['t']);expect(planned.value[0].dependencyRunIds).toEqual([]);}
 const result=preflightRun({graph:graph.data,nodeIds:['b'],assets,readableAssetIds:[],capability,connection:f.connection(),binding:{id:'binding-a',connectionId:'c1',originSnapshot:'https://core.invalid',kind:'core-user',createdAt:1},canWrite:true,credentialAvailable:true});
 expect(result.status).toBe('ready');if(result.status==='ready')expect(result.plan.nodes[0].inputSnapshot.references).toEqual([]);
});
it('generation result line is bound to the exact producing run and is excluded from run dependencies',()=>{
 const graph=graphSchema.safeParse(f.graph({nodes:[
  {id:'a',type:'video-generation',title:'视频草稿',x:0,y:0,locked:false,data:{kind:'video-generation',draft:{modelId:'fake-video-only',durationSeconds:5,ratio:'16:9'},inputBindings:[],stale:true}},
  {id:'result',type:'result',title:'视频A',x:500,y:0,locked:false,data:{kind:'result',assetId:'clip',runId:'r1'}}
 ],edges:[{id:'result-edge',sourceId:'a',targetId:'result',port:'video',order:0,relation:'result'}]}));
 expect(graph.success).toBe(true);if(!graph.success)throw Error('schema');
 const assets=[f.asset({id:'clip',sourceRunId:'r1',mediaType:'video',mimeType:'video/mp4'})],run=f.run({id:'r1',nodeId:'a',resultAssetId:'clip',executionState:'succeeded'});
 expect(validateConnection(graph.data,graph.data.edges[0],f.caps(),{assets,runs:[run]}).ok).toBe(true);
 expect(validateConnection(graph.data,graph.data.edges[0],f.caps(),{assets,runs:[{...run,nodeId:'other'}]}).ok).toBe(false);
 expect(getOrderedInputs(graph.data,'result')).toEqual([]);
 const copied=pasteNodes(copyNodes(graph.data,['a','result']),graph.data),copiedEdges=copied.filter(op=>op.type==='add_edge');
 expect(copiedEdges).toEqual([]); // A copied draft did not produce the immutable historic Run.
 const selected=executeGraphOperations(graph.data,[{id:'choose',type:'select_result',payload:{nodeId:'result',runId:'r2',assetId:'other-clip'}}]);
 expect(selected.edges.some(e=>e.targetId==='result'&&e.relation==='result')).toBe(false);
});
