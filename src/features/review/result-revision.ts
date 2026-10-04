import {resultSourceLink} from './result-source-link';
import {runSchema,type Run} from '../../domain/run';
import {projectSchema} from '../../domain/project';
import {assetSchema} from '../../domain/asset';
import {localText} from '../../domain/common';
import {videoRunSnapshotSchema} from '../../application/runs/prepare-request';
import {applyUiCommand} from '../../application/commands/apply-command';
import type {GraphOperation} from '../../application/commands/registry';
import {readGraph} from '../../infrastructure/storage/project-repository';
import {withDatabase,transact,requestResult,type StudioDb} from '../../infrastructure/storage/database';
import {getProjectWriter} from '../projects/project-service';
import {releaseProjectLease,type ProjectLeaseToken} from '../../infrastructure/storage/project-lease';
import {nodeSchema} from '../../domain/graph';
import {nodeRect} from '../canvas/geometry';

export const revisionInput=(run:Run)=>videoRunSnapshotSchema.safeParse(run.inputSnapshot);
export async function createResultRevision(input:{run:Run;baseRevision:number;prompt:string;commandId:string},options:{db?:StudioDb;lease?:ProjectLeaseToken}={}){
 const prompt=localText.parse(input.prompt.trim());if(!prompt)throw Error('prompt_empty');
 const frozen=revisionInput(input.run);if(!frozen.success||input.run.executionState!=='succeeded')throw Error('original_snapshot_unavailable');
 return withDatabase(options.db,async db=>{
  const graph=await readGraph(input.run.projectId,db);if(!graph)throw Error('graph_missing');
  const x=Math.max(0,...graph.nodes.map(n=>nodeRect(n,graph).right))+64,textId=crypto.randomUUID(),videoId=crypto.randomUUID();
  const sourceAsset=await transact(db,['assets'],'readonly',tx=>requestResult(tx.objectStore('assets').get(input.run.resultAssetId??'')));
  const checked=assetSchema.safeParse(sourceAsset);if(!checked.success||checked.data.mediaType!=='video'||checked.data.sourceRunId!==input.run.id||checked.data.trashedAt!=null)throw Error('original_result_unavailable');
  const existing=graph.nodes.find(n=>(n.type==='asset'||n.type==='result')&&n.data.assetId===checked.data.id&&(n.type!=='result'||n.data.runId===input.run.id)),sourceId=existing?.id??crypto.randomUUID();
  const sourceOps:GraphOperation[]=existing?[]:[{id:crypto.randomUUID(),type:'add_node',payload:{node:{id:sourceId,type:'result',title:'原视频 · '+[...checked.data.title].slice(0,50).join(''),x,y:0,locked:false,data:{kind:'result',assetId:checked.data.id,runId:input.run.id}}}}];
  const operations:GraphOperation[]=[...sourceOps,
   {id:crypto.randomUUID(),type:'add_edge',payload:{edge:{id:crypto.randomUUID(),sourceId,targetId:videoId,port:'video',order:0,relation:'revision'}}},
   {id:crypto.randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'修改提示词',x,y:340,locked:false,data:{kind:'text',text:prompt,referenceTokens:frozen.data.references.map(ref=>({assetId:ref.assetId,alias:ref.alias,mediaType:ref.mediaType,role:ref.role,description:ref.alias,available:true,unbound:false}))}}}},
   {id:crypto.randomUUID(),type:'add_node',payload:{node:{id:videoId,type:'video-generation',title:'修改后的视频',x:x+460,y:0,locked:false,data:{kind:'video-generation',draft:structuredClone(input.run.executionSpec??input.run.requestedSpec??frozen.data.spec),inputBindings:[],stale:true,lineageRecorded:true,revisionSource:{projectId:input.run.projectId,runId:input.run.id,...(input.run.resultAssetId?{assetId:input.run.resultAssetId}:{})}}}}},
   {id:crypto.randomUUID(),type:'add_edge',payload:{edge:{id:crypto.randomUUID(),sourceId:textId,targetId:videoId,port:'text',order:0}}}
  ];
  for(const [index,reference]of frozen.data.references.entries()){
   const original=graph.nodes.find(n=>n.id===reference.nodeId&&(n.type==='asset'||n.type==='result')&&n.data.assetId===reference.assetId&&(n.type!=='result'||!reference.runId||n.data.runId===reference.runId));
   const nodeId=original?.id??crypto.randomUUID();
   if(!original)operations.push({id:crypto.randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'asset',title:'原参考 '+reference.alias,x,y:768+index*264,locked:false,data:{kind:'asset',assetId:reference.assetId}}}});
   operations.push({id:crypto.randomUUID(),type:'add_edge',payload:{edge:{id:crypto.randomUUID(),sourceId:nodeId,targetId:videoId,port:reference.mediaType,order:index+1}}});
  }
  const sourceNode=existing??sourceOps.flatMap(op=>op.type==='add_node'?[nodeSchema.parse(op.payload.node)]:[])[0];
  if(sourceNode)operations.push(...resultSourceLink(graph,sourceNode,input.run));
  const lease=options.lease??await getProjectWriter(input.run.projectId,db);
  try{
   const receipt=await applyUiCommand({id:input.commandId,projectId:input.run.projectId,baseRevision:input.baseRevision,operations},{db,lease,beforeCreativeCommit:async tx=>{
    const project=projectSchema.parse(await requestResult(tx.objectStore('projects').get(input.run.projectId))),run=runSchema.parse(await requestResult(tx.objectStore('runs').get(input.run.id)));
    const asset=assetSchema.parse(await requestResult(tx.objectStore('assets').get(checked.data.id)));
    if(JSON.stringify(asset)!==JSON.stringify(checked.data))throw Error('original_result_changed');
    if(project.archived||JSON.stringify(run)!==JSON.stringify(input.run))throw Error('original_result_changed');
    for(const ref of frozen.data.references){const asset=assetSchema.parse(await requestResult(tx.objectStore('assets').get(ref.assetId)));if(asset.trashedAt!=null||asset.mediaType!==ref.mediaType||ref.sha256&&ref.sha256!==asset.sha256||ref.bytes!==undefined&&ref.bytes!==asset.bytes)throw Error('original_reference_changed');}
   }});
   return {receipt,videoId};
  }finally{if(!options.lease)await releaseProjectLease(lease,db);}
 });
}
