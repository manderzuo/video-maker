import {openStudioDb,transact} from '../../src/infrastructure/storage/database';
import {f} from '../helpers/fixtures';
export async function seedScenario(name:string){
 if(!['project-library','canvas-project','unverified-capability'].includes(name))throw new Error('scenario_not_implemented');
 const db=await openStudioDb();
 try{await transact(db,db.tables.slice(),'readwrite',tx=>{
  for(const table of db.tables)tx.objectStore(table).clear();
  if(name==='unverified-capability'){
   tx.objectStore('projects').put(f.project());tx.objectStore('graphs').put(f.graph({nodes:[
    {id:'text-1',type:'text',title:'镜头文字',x:20,y:20,locked:false,data:{kind:'text',text:'原创镜头',referenceTokens:[]}},
    {id:'asset-1',type:'asset',title:'参考一',x:20,y:440,locked:false,data:{kind:'asset',assetId:'a1'}},
    {id:'asset-2',type:'asset',title:'参考二',x:20,y:680,locked:false,data:{kind:'asset',assetId:'a2'}},
    {id:'video-1',type:'video-generation',title:'视频草稿',x:440,y:20,locked:false,data:{kind:'video-generation',draft:{modelId:'unverified-video-draft',ratio:'4:5',durationSeconds:5},inputBindings:[],stale:false}},
    {id:'result-1',type:'result',title:'固定结果',x:440,y:680,locked:false,data:{kind:'result',assetId:'a3',runId:'r1'}},
    {id:'group-1',type:'group',title:'镜头组',x:900,y:20,locked:false,data:{kind:'group',childIds:[],collapsed:false}}
   ]}));
   for(const id of ['a1','a2'])tx.objectStore('assets').put(f.asset({id,mediaType:'image',mimeType:'image/png',title:id==='a1'?'参考一':'参考二',blobKey:'blob-'+id}));
   tx.objectStore('assets').put(f.asset({id:'a3',mediaType:'video',mimeType:'video/mp4',title:'固定结果素材',sourceRunId:'r1'}));tx.objectStore('runs').put(f.run({nodeId:'video-1',executionState:'succeeded',resultAssetId:'a3'}));tx.objectStore('diagnostics').put({id:'capability:current',capability:f.unknownCaps()});return;
  }
  if(name==='canvas-project'){
   tx.objectStore('projects').put(f.project());tx.objectStore('graphs').put(f.graph({nodes:[{id:'text-1',type:'text',title:'镜头一',x:80,y:80,locked:false,data:{kind:'text',text:'原创镜头',referenceTokens:[]}}]}));return;
  }
  for(const project of [f.project({title:'项目甲'}),f.project({id:'p2',title:'项目乙'}),f.project({id:'p3',title:'归档项目',archived:true})])tx.objectStore('projects').put(project);
  for(const projectId of ['p1','p2'])tx.objectStore('graphs').put(f.graph({projectId,nodes:[{id:'asset-'+projectId,type:'asset',title:'共享素材',x:32,y:32,locked:false,data:{kind:'asset',assetId:'a1'}}]}));
  tx.objectStore('graphs').put(f.graph({projectId:'p3'}));tx.objectStore('assets').put(f.asset());tx.objectStore('blobs').put({id:'blob-a1',blob:new Blob(['原创共享素材'])});
  tx.objectStore('runs').put(f.run({executionState:'submit_unknown',inputSnapshot:{assetId:'a1'}}));
 });}finally{db.close();}
}

