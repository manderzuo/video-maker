import type {CanvasNode,Graph} from '../../domain/graph';
import type {Run} from '../../domain/run';
import type {GraphOperation} from '../../application/commands/registry';
// The run's frozen producing node identifies the result; layout and chronology
// are never used to infer which draft produced a video.
export function resultSourceLink(graph:Graph,node:CanvasNode,run:Run):GraphOperation[]{
 if((node.type!=='asset'&&node.type!=='result')||node.locked||node.data.generationLinked||node.data.assetId!==run.resultAssetId||!graph.nodes.some(n=>n.id===run.nodeId&&n.type==='video-generation'))return [];
 const operations:GraphOperation[]=[{id:crypto.randomUUID(),type:'update_node',payload:{nodeId:node.id,patch:{data:{...node.data,generationLinked:true}}}}];
 if(!graph.edges.some(e=>e.targetId===node.id&&e.relation==='result'))operations.push({id:crypto.randomUUID(),type:'add_edge',payload:{edge:{id:crypto.randomUUID(),sourceId:run.nodeId,targetId:node.id,port:'video',order:0,relation:'result'}}});
 return operations;
}
