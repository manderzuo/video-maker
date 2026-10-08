import {seedTaskHistory} from './task-history';
import {runSchema} from '../../src/domain/run';
import {graphSchema} from '../../src/domain/graph';
import {withDatabase,transact,requestResult} from '../../src/infrastructure/storage/database';
import type {RunQueue} from '../../src/application/runs/queue';

// A completed submission queue tracks the existing fake Run without authorizing new work.
export async function seedVideoFailureHistory(){
 await seedTaskHistory();
 const queueId='11111111-1111-4111-8111-111111111111';
 const queue:RunQueue={id:`queue:${queueId}`,queueId,projectId:'p1',revision:1,epoch:1,state:'completed',preparationConcurrency:1,items:[{nodeId:'text-1',inputNodeIds:[],dependencyNodeIds:[],dependencyRunIds:[],requiresVisibleOutputs:[],runId:'video-run-1',status:'accepted'}],planHashes:[],supersededRunIds:[],createdAt:1000,updatedAt:1000};
 await withDatabase(undefined,db=>transact(db,['receipts','runs','graphs'],'readwrite',async tx=>{
  const run=runSchema.parse(await requestResult(tx.objectStore('runs').get('video-run-1'))),at=Date.now()-12000;
  tx.objectStore('runs').put({...run,createdAt:at,updatedAt:at});
  const graph=graphSchema.parse(await requestResult(tx.objectStore('graphs').get('p1')));
  graph.nodes.find(node=>node.id==='text-1')!.title='参考图视频任务';
  tx.objectStore('graphs').put(graph);tx.objectStore('receipts').put(queue);
 }));
}
