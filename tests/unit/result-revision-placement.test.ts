import {it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {f} from '../helpers/fixtures';
import {openStudioDb,transact,requestResult} from '../../src/infrastructure/storage/database';
import {acquireProjectLease} from '../../src/infrastructure/storage/project-lease';
import {createResultRevision} from '../../src/features/review/result-revision';
import {graphSchema} from '../../src/domain/graph';
import {runSchema} from '../../src/domain/run';
import {nodeRect} from '../../src/features/canvas/geometry';
it('QA50 revision text and original reference remain visible in separate nonoverlapping nodes',async()=>{
 const db=await openStudioDb({factory:new IDBFactory(),name:'revision-layout'});
 try{
  const run=runSchema.parse(f.run({executionState:'succeeded',resultAssetId:'a1',inputSnapshot:{prompt:'参考 @图片1',spec:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},references:[{assetId:'image',mediaType:'image',role:'参考',alias:'@图片1'}]}}));
  await transact(db,['projects','graphs','runs','assets'],'readwrite',tx=>{tx.objectStore('projects').put(f.project());tx.objectStore('graphs').put(f.graph());tx.objectStore('runs').put(run);tx.objectStore('assets').put(f.asset({mediaType:'video',mimeType:'video/mp4',sourceRunId:run.id}));tx.objectStore('assets').put(f.asset({id:'image',mediaType:'image',mimeType:'image/png'}));});
  const lease=await acquireProjectLease('p1','revision',Date.now(),{db});if(!lease.ok)throw Error('writer');
  const result=await createResultRevision({run,baseRevision:1,prompt:'参考 @图片1 继续前进',commandId:'revision'},{db,lease:lease.token});if(result.receipt.status==='rejected')throw Error(result.receipt.errorCode);expect(result.receipt.status).toBe('applied');
  const graph=await transact(db,['graphs'],'readonly',async tx=>graphSchema.parse(await requestResult(tx.objectStore('graphs').get('p1'))));
  const text=graph.nodes.find(n=>n.type==='text')!,ref=graph.nodes.find(n=>n.title==='原参考 @图片1')!,a=nodeRect(text,graph),b=nodeRect(ref,graph);
  expect(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom).toBe(true);
 }finally{db.close();}
});
it('QA50 revising a clip reuses its exact existing frame input and retains the visible original-video lineage',async()=>{
 const db=await openStudioDb({factory:new IDBFactory(),name:'revision-frame-lineage'});
 try{
  const run=runSchema.parse(f.run({executionState:'succeeded',resultAssetId:'a1',inputSnapshot:{prompt:'参考 @图片1',spec:{modelId:'seedance',durationSeconds:5},references:[{assetId:'image',nodeId:'frame-node',mediaType:'image',role:'参考',alias:'@图片1'}]}}));
  const graph=f.graph({nodes:[{id:'source-video',type:'asset',title:'原视频',x:0,y:0,locked:false,data:{kind:'asset',assetId:'origin-video'}},{id:'frame-node',type:'asset',title:'尾帧参考',x:460,y:0,locked:false,data:{kind:'asset',assetId:'image',sourceVideo:{assetId:'image',sourceAssetId:'origin-video',sourceRunId:'origin-run',timeSeconds:4.9}}}],edges:[{id:'origin-frame',sourceId:'source-video',targetId:'frame-node',port:'video',order:0,relation:'tail-frame'}]});
  await transact(db,['projects','graphs','runs','assets'],'readwrite',tx=>{tx.objectStore('projects').put(f.project());tx.objectStore('graphs').put(graph);tx.objectStore('runs').put(run);tx.objectStore('assets').put(f.asset({mediaType:'video',mimeType:'video/mp4',sourceRunId:run.id}));tx.objectStore('assets').put(f.asset({id:'image',mediaType:'image',mimeType:'image/png'}));tx.objectStore('assets').put(f.asset({id:'origin-video',mediaType:'video',mimeType:'video/mp4',sourceRunId:'origin-run'}));});
  const lease=await acquireProjectLease('p1','revision',Date.now(),{db});if(!lease.ok)throw Error('writer');
  const result=await createResultRevision({run,baseRevision:1,prompt:'参考 @图片1 继续前进',commandId:'revision'},{db,lease:lease.token});expect(result.receipt.status).toBe('applied');
  const after=await transact(db,['graphs'],'readonly',async tx=>graphSchema.parse(await requestResult(tx.objectStore('graphs').get('p1'))));
  expect(after.nodes.filter(n=>n.type==='asset'&&n.data.assetId==='image')).toHaveLength(1);
  expect(after.edges).toContainEqual(expect.objectContaining({sourceId:'frame-node',targetId:result.videoId,port:'image'}));
  expect(after.edges).toContainEqual(graph.edges[0]);expect(after.nodes.find(n=>n.id==='frame-node')).toEqual(graph.nodes[1]);
 }finally{db.close();}
});
