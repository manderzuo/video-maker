import type {Graph} from '../../domain/graph';
import type {WorkspaceClient} from '../../infrastructure/api/workspace-client';
import type {DeletionImpact} from '../projects/delete-policy';

// Only the graph reference is removed. Shared media, task snapshots and billing
// remain owned by the account. Confirmation is bound to the displayed revision.
export function cloudNodeDeletion(client:WorkspaceClient,graph:Graph){
 const inspect=async(ids:string[]):Promise<DeletionImpact[]>=>{
  const fresh=await client.readWorkspace(graph.projectId);
  if(fresh.graph.revision!==graph.revision)throw Error('deletion_impact_changed');
  return Promise.all(ids.map(async id=>{
   const node=graph.nodes.find(node=>node.id===id);
   if(!node||node.locked)throw Error('deletion_impact_changed');
   const assetIds=node.type==='asset'||node.type==='result'?[node.data.assetId]:node.type==='text'?node.data.referenceTokens.flatMap(ref=>ref.assetId?[ref.assetId]:[]):[];
   const references=await Promise.all(assetIds.map(assetId=>client.assetReferences(assetId)));
   const sharedAssets=assetIds.filter((_,index)=>references[index].some(ref=>ref.projectId!==graph.projectId||!ref.current));
   return {target:{kind:'node',id,projectId:graph.projectId,mode:'permanent'},blockers:[],sharedAssets,activeRuns:[],referencedAssets:assetIds,deletable:true,impactHash:JSON.stringify({revision:graph.revision,node,references}),displayedCounts:{references:assetIds.length,activeRuns:0,sharedAssets:sharedAssets.length}};
  }));
 };
 return {inspect,validate:async(impacts:DeletionImpact[])=>{
  const current=await inspect(impacts.map(impact=>impact.target.id));
  if(current.some((impact,index)=>impact.impactHash!==impacts[index].impactHash))throw Error('deletion_impact_changed');
 }};
}
